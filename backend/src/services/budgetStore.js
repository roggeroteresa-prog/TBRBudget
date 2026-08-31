/**
 * Store dei budget su SQLite (vedi db.js). Gestisce Budget e BudgetLine con
 * operazioni CRUD — ogni scrittura è una transazione atomica su righe
 * specifiche, non più una riscrittura dell'intero file JSON: elimina la
 * race condition per cui due scritture concorrenti (interfaccia + assistente
 * in chat) potevano sovrascriversi a vicenda.
 *
 * Le righe di budget (BudgetLine) usano un oggetto generico `dims` le cui
 * chiavi dipendono dalle dimensioni attive scelte in fase di configurazione
 * del budget (macroarea, country, customer, category, product), anziché
 * campi fissi: questo permette di supportare qualunque sottoinsieme di
 * dimensioni scelto dall'utente. `dims` è salvato come testo JSON in una
 * colonna, con una colonna `dimsKey` calcolata e indicizzata per i
 * confronti di uguaglianza (lineExists, upsert).
 *
 * Ogni funzione che modifica dati registra un evento nello storico
 * (historyService), attribuito all'utente indicato in `actingUser` — sia
 * che la richiesta arrivi dalla UI sia dall'assistente in chat, essendo
 * questo l'unico punto di scrittura condiviso.
 */
import { randomUUID } from "crypto";
import { db, dimsKeyOf } from "./db.js";
import { logEvent, ACTION_TYPES } from "./historyService.js";

function log(actionType, entity, budget, user, detail) {
  logEvent({
    actionType,
    entity,
    budgetId: budget?.id,
    budgetName: budget?.budgetName,
    user: user || "Utente Demo",
    detail,
  });
}

/**
 * Impedisce modifiche di contenuto (config, righe) a un budget in stato
 * Confermato — sia che la richiesta arrivi dalla UI sia dalla chat. Il
 * cambio di stato stesso (per riportarlo in Bozza) resta sempre permesso.
 */
function assertBudgetEditable(budget) {
  if (budget && budget.status === "Confermato") {
    throw new Error(
      `Il budget "${budget.budgetName}" è in stato Confermato e non è modificabile. Riportalo in Bozza per poterlo modificare.`
    );
  }
}

function rowToBudget(row) {
  if (!row) return null;
  return {
    ...row,
    budgetYear: Number(row.budgetYear),
    dimensions: JSON.parse(row.dimensions),
    exchangeRates: JSON.parse(row.exchangeRates),
    initialTargets: JSON.parse(row.initialTargets),
    configStatus: JSON.parse(row.configStatus),
  };
}

function rowToLine(row) {
  return {
    id: row.id,
    budgetId: row.budgetId,
    dims: JSON.parse(row.dims),
    month: row.month,
    amount: row.amount,
    quantity: row.quantity,
  };
}

// ─── Statement precompilati (preparati una sola volta, riusati ad ogni chiamata) ───
const stmtListBudgets = db.prepare("SELECT * FROM budgets ORDER BY createdAt DESC");
const stmtGetBudget = db.prepare("SELECT * FROM budgets WHERE id = ?");
const stmtInsertBudget = db.prepare(`
  INSERT INTO budgets (id, company, budgetName, budgetYear, currencyCode, startDate, endDate, fixedFactor, status, createdAt, createdBy, dimensions, exchangeRates, initialTargets, configStatus)
  VALUES (@id,@company,@budgetName,@budgetYear,@currencyCode,@startDate,@endDate,@fixedFactor,@status,@createdAt,@createdBy,@dimensions,@exchangeRates,@initialTargets,@configStatus)
`);
const stmtUpdateBudget = db.prepare(`
  UPDATE budgets SET
    budgetYear=@budgetYear, currencyCode=@currencyCode, startDate=@startDate, endDate=@endDate,
    fixedFactor=@fixedFactor, status=@status, dimensions=@dimensions, exchangeRates=@exchangeRates,
    initialTargets=@initialTargets, configStatus=@configStatus
  WHERE id=@id
`);
const stmtDeleteBudget = db.prepare("DELETE FROM budgets WHERE id = ?");

const stmtListLines = db.prepare("SELECT * FROM budget_lines WHERE budgetId = ?");
const stmtInsertLine = db.prepare(`
  INSERT INTO budget_lines (id, budgetId, dims, dimsKey, month, amount, quantity)
  VALUES (@id,@budgetId,@dims,@dimsKey,@month,@amount,@quantity)
`);
const stmtDeleteLinesByDimsKey = db.prepare("DELETE FROM budget_lines WHERE budgetId = ? AND dimsKey = ?");
const stmtDeleteAllLines = db.prepare("DELETE FROM budget_lines WHERE budgetId = ?");
const stmtDeleteLine = db.prepare("DELETE FROM budget_lines WHERE budgetId = ? AND id = ?");
const stmtLineExists = db.prepare("SELECT 1 FROM budget_lines WHERE budgetId = ? AND dimsKey = ? LIMIT 1");

// ─── Budget ────────────────────────────────────────────────────────────

export function listBudgets() {
  return stmtListBudgets.all().map(rowToBudget);
}

export function getBudget(id) {
  return rowToBudget(stmtGetBudget.get(id));
}

export function createBudget(data, actingUser) {
  const budget = {
    id: randomUUID(),
    company: "TBR Budget Group",
    budgetName: data.budgetName,
    budgetYear: Number(data.budgetYear),
    currencyCode: data.currencyCode || "EUR",
    startDate: data.startDate,
    endDate: data.endDate,
    fixedFactor: data.fixedFactor || "IMPORTO",
    status: "Bozza",
    createdAt: new Date().toISOString(),
    createdBy: actingUser || "Utente Demo",
    // ─── Configurazione (impostata dopo la creazione) ───
    dimensions: [], // sottoinsieme di: macroarea, country, customer, category, product — scelto in configurazione
    exchangeRates: {}, // { CURRENCY_CODE: tasso osservato nel periodo consuntivo rispetto a currencyCode }
    initialTargets: { totalAmount: 0, totalQuantity: 0 },
    configStatus: { dimensions: false, currency: false, amounts: false },
  };

  stmtInsertBudget.run({
    ...budget,
    dimensions: JSON.stringify(budget.dimensions),
    exchangeRates: JSON.stringify(budget.exchangeRates),
    initialTargets: JSON.stringify(budget.initialTargets),
    configStatus: JSON.stringify(budget.configStatus),
  });

  log(ACTION_TYPES.CREATE, "Budget", budget, actingUser, `Creato budget "${budget.budgetName}" (anno ${budget.budgetYear}, ${budget.currencyCode})`);
  return budget;
}

export function updateBudget(id, patch, actingUser) {
  const current = getBudget(id);
  if (!current) return null;
  // Company e budgetName non modificabili dopo la creazione (come in PWB)
  const { company, budgetName, ...editable } = patch;

  const isStatusOnlyPatch = Object.keys(editable).length === 1 && "status" in editable;
  if (!isStatusOnlyPatch) assertBudgetEditable(current);

  const nextConfigStatus = { ...current.configStatus };
  if (Object.prototype.hasOwnProperty.call(editable, "dimensions")) nextConfigStatus.dimensions = true;
  if (Object.prototype.hasOwnProperty.call(editable, "exchangeRates")) nextConfigStatus.currency = true;
  if (Object.prototype.hasOwnProperty.call(editable, "initialTargets")) nextConfigStatus.amounts = true;

  const updated = { ...current, ...editable, configStatus: nextConfigStatus };

  stmtUpdateBudget.run({
    id: updated.id,
    budgetYear: Number(updated.budgetYear),
    currencyCode: updated.currencyCode,
    startDate: updated.startDate,
    endDate: updated.endDate,
    fixedFactor: updated.fixedFactor,
    status: updated.status,
    dimensions: JSON.stringify(updated.dimensions),
    exchangeRates: JSON.stringify(updated.exchangeRates),
    initialTargets: JSON.stringify(updated.initialTargets),
    configStatus: JSON.stringify(updated.configStatus),
  });

  if (isStatusOnlyPatch) {
    log(ACTION_TYPES.STATUS, "Budget", updated, actingUser, `Stato cambiato in "${editable.status}"`);
  } else if ("dimensions" in editable) {
    log(ACTION_TYPES.CONFIG, "Dimensioni", updated, actingUser, `Dimensioni impostate: ${(editable.dimensions || []).join(", ") || "nessuna"}`);
  } else if ("exchangeRates" in editable) {
    log(ACTION_TYPES.CONFIG, "Currency", updated, actingUser, `Tassi di cambio configurati (${Object.keys(editable.exchangeRates || {}).length} valute)`);
  } else if ("initialTargets" in editable) {
    log(ACTION_TYPES.CONFIG, "Importo iniziale", updated, actingUser, `Target impostato: ${Math.round(editable.initialTargets?.totalAmount || 0)} / ${Math.round(editable.initialTargets?.totalQuantity || 0)} qtà`);
  } else {
    log(ACTION_TYPES.UPDATE, "Budget", updated, actingUser, `Campi modificati: ${Object.keys(editable).join(", ")}`);
  }

  return updated;
}

export function setBudgetStatus(id, status, actingUser) {
  return updateBudget(id, { status }, actingUser);
}

export function deleteBudget(id, actingUser) {
  const budget = getBudget(id);
  // ON DELETE CASCADE nello schema elimina automaticamente anche le righe del budget.
  stmtDeleteBudget.run(id);
  if (budget) log(ACTION_TYPES.DELETE, "Budget", budget, actingUser, `Eliminato budget "${budget.budgetName}" e tutte le sue righe`);
}

// ─── Righe di budget ─────────────────────────────────────────────────

export function listLines(budgetId) {
  return stmtListLines.all(budgetId).map(rowToLine);
}

/**
 * Aggiunge un blocco di righe (tipicamente una per mese) per una
 * combinazione di dimensioni. L'inserimento di tutte le righe avviene in
 * un'unica transazione: o vengono scritte tutte, o nessuna.
 */
export function addLines(budgetId, newLines, actingUser, options = {}) {
  const budget = getBudget(budgetId);
  assertBudgetEditable(budget);

  const created = newLines.map((l) => ({
    id: randomUUID(),
    budgetId,
    dims: l.dims,
    month: Number(l.month),
    amount: Number(l.amount) || 0,
    quantity: Number(l.quantity) || 0,
  }));

  const insertAll = db.transaction((lines) => {
    for (const l of lines) {
      stmtInsertLine.run({ ...l, dims: JSON.stringify(l.dims), dimsKey: dimsKeyOf(l.dims) });
    }
  });
  insertAll(created);

  if (!options.silent) {
    const dimsLabel = newLines[0] ? Object.entries(newLines[0].dims).map(([k, v]) => `${k}=${v}`).join(", ") : "";
    log(ACTION_TYPES.WRITEBACK, "Riga budget", budget, actingUser, `Scritte ${created.length} righe mensili (${dimsLabel})`);
  }
  return created;
}

/**
 * Sostituisce tutte le righe mensili esistenti per una combinazione di
 * dimensioni con un nuovo set (usato dalla tabella editabile in "Budget dei
 * Ricavi": modifica in blocco invece di dover passare dal modale).
 * Cancellazione + inserimento in un'unica transazione: uno stato intermedio
 * "senza righe" non è mai osservabile da un'altra richiesta concorrente.
 */
export function upsertLines(budgetId, dims, newLines, actingUser) {
  const budget = getBudget(budgetId);
  assertBudgetEditable(budget);
  const key = dimsKeyOf(dims);

  const replace = db.transaction((lines) => {
    stmtDeleteLinesByDimsKey.run(budgetId, key);
    return addLines(budgetId, lines, actingUser);
  });
  return replace(newLines);
}

/**
 * Sostituisce TUTTE le righe di un budget (usato dalla generazione della
 * base budget: riponderazione proporzionale del consuntivo sul target).
 * Stessa garanzia di atomicità di upsertLines.
 */
export function replaceAllLines(budgetId, newLines, actingUser) {
  const budget = getBudget(budgetId);
  assertBudgetEditable(budget);

  const replace = db.transaction((lines) => {
    stmtDeleteAllLines.run(budgetId);
    return addLines(budgetId, lines, actingUser, { silent: true });
  });
  const created = replace(newLines);

  log(ACTION_TYPES.WRITEBACK, "Base budget", budget, actingUser, `Generata base budget: ${created.length} righe`);
  return created;
}

export function deleteLine(budgetId, lineId, actingUser) {
  const budget = getBudget(budgetId);
  assertBudgetEditable(budget);
  stmtDeleteLine.run(budgetId, lineId);
  log(ACTION_TYPES.DELETE, "Riga budget", budget, actingUser, `Eliminata riga ${lineId}`);
}

export function lineExists(budgetId, dims) {
  return !!stmtLineExists.get(budgetId, dimsKeyOf(dims));
}

/**
 * Aggregazione pivot: per ogni combinazione di dimensioni, i 12 valori
 * mensili di importo e quantità, con totali di riga/colonna.
 */
export function getPivot(budgetId) {
  const lines = listLines(budgetId);
  const groups = new Map();

  for (const line of lines) {
    const key = dimsKeyOf(line.dims);
    if (!groups.has(key)) {
      groups.set(key, {
        dims: line.dims,
        monthlyAmount: Array(12).fill(0),
        monthlyQuantity: Array(12).fill(0),
      });
    }
    const g = groups.get(key);
    g.monthlyAmount[line.month - 1] += line.amount;
    g.monthlyQuantity[line.month - 1] += line.quantity;
  }

  const rows = Array.from(groups.values()).map((g) => ({
    ...g,
    totalAmount: g.monthlyAmount.reduce((a, b) => a + b, 0),
    totalQuantity: g.monthlyQuantity.reduce((a, b) => a + b, 0),
  }));

  const totalsByMonth = Array(12).fill(0);
  rows.forEach((r) => r.monthlyAmount.forEach((v, i) => (totalsByMonth[i] += v)));
  const grandTotal = totalsByMonth.reduce((a, b) => a + b, 0);

  return { rows, totalsByMonth, grandTotal };
}
