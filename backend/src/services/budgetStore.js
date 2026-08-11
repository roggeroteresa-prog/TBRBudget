/**
 * Store dei budget su file JSON (nessun database: coerente con la natura
 * "leggera" del progetto di tesi). Gestisce Budget e BudgetLine con
 * operazioni CRUD sincrone (dataset piccolo, uso locale/dimostrativo).
 *
 * Le righe di budget (BudgetLine) usano un oggetto generico `dims` le cui
 * chiavi dipendono dalle dimensioni attive scelte in fase di configurazione
 * del budget (macroarea, country, customer, category, product), anziché
 * campi fissi: questo permette di supportare qualunque sottoinsieme di
 * dimensioni scelto dall'utente.
 *
 * Ogni funzione che modifica dati registra un evento nello storico
 * (historyService), attribuito all'utente indicato in `actingUser` — sia
 * che la richiesta arrivi dalla UI sia dall'assistente in chat, essendo
 * questo l'unico punto di scrittura condiviso.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { randomUUID } from "crypto";
import { logEvent, ACTION_TYPES } from "./historyService.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STORE_PATH = path.join(__dirname, "..", "data", "budgets-store.json");

function readStore() {
  if (!fs.existsSync(STORE_PATH)) {
    return { budgets: [], lines: [] };
  }
  const raw = fs.readFileSync(STORE_PATH, "utf-8");
  try {
    return JSON.parse(raw);
  } catch {
    return { budgets: [], lines: [] };
  }
}

function writeStore(store) {
  fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), "utf-8");
}

function dimsKeyOf(dims) {
  return JSON.stringify(dims, Object.keys(dims).sort());
}

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

// ─── Budget ────────────────────────────────────────────────────────────

export function listBudgets() {
  return readStore().budgets;
}

export function getBudget(id) {
  return readStore().budgets.find((b) => b.id === id) || null;
}

export function createBudget(data, actingUser) {
  const store = readStore();
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
  store.budgets.push(budget);
  writeStore(store);
  log(ACTION_TYPES.CREATE, "Budget", budget, actingUser, `Creato budget "${budget.budgetName}" (anno ${budget.budgetYear}, ${budget.currencyCode})`);
  return budget;
}

export function updateBudget(id, patch, actingUser) {
  const store = readStore();
  const idx = store.budgets.findIndex((b) => b.id === id);
  if (idx === -1) return null;
  // Company e budgetName non modificabili dopo la creazione (come in PWB)
  const { company, budgetName, ...editable } = patch;

  const current = store.budgets[idx];
  const isStatusOnlyPatch = Object.keys(editable).length === 1 && "status" in editable;
  if (!isStatusOnlyPatch) assertBudgetEditable(current);

  const nextConfigStatus = { ...current.configStatus };
  if (Object.prototype.hasOwnProperty.call(editable, "dimensions")) nextConfigStatus.dimensions = true;
  if (Object.prototype.hasOwnProperty.call(editable, "exchangeRates")) nextConfigStatus.currency = true;
  if (Object.prototype.hasOwnProperty.call(editable, "initialTargets")) nextConfigStatus.amounts = true;

  const updated = { ...current, ...editable, configStatus: nextConfigStatus };
  store.budgets[idx] = updated;
  writeStore(store);

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
  const store = readStore();
  const budget = store.budgets.find((b) => b.id === id);
  store.budgets = store.budgets.filter((b) => b.id !== id);
  store.lines = store.lines.filter((l) => l.budgetId !== id);
  writeStore(store);
  if (budget) log(ACTION_TYPES.DELETE, "Budget", budget, actingUser, `Eliminato budget "${budget.budgetName}" e tutte le sue righe`);
}

// ─── Righe di budget ─────────────────────────────────────────────────

export function listLines(budgetId) {
  return readStore().lines.filter((l) => l.budgetId === budgetId);
}

/**
 * Aggiunge un blocco di righe (tipicamente una per mese) per una
 * combinazione di dimensioni.
 */
export function addLines(budgetId, newLines, actingUser, options = {}) {
  const store = readStore();
  const budget = store.budgets.find((b) => b.id === budgetId);
  assertBudgetEditable(budget);
  const created = newLines.map((l) => ({
    id: randomUUID(),
    budgetId,
    dims: l.dims,
    month: Number(l.month),
    amount: Number(l.amount) || 0,
    quantity: Number(l.quantity) || 0,
  }));
  store.lines.push(...created);
  writeStore(store);
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
 */
export function upsertLines(budgetId, dims, newLines, actingUser) {
  const store = readStore();
  const budget = store.budgets.find((b) => b.id === budgetId);
  assertBudgetEditable(budget);
  const key = dimsKeyOf(dims);
  store.lines = store.lines.filter((l) => !(l.budgetId === budgetId && dimsKeyOf(l.dims) === key));
  writeStore(store);
  return addLines(budgetId, newLines, actingUser);
}

/**
 * Sostituisce TUTTE le righe di un budget (usato dalla generazione della
 * base budget: riponderazione proporzionale del consuntivo sul target).
 */
export function replaceAllLines(budgetId, newLines, actingUser) {
  const store = readStore();
  const budget = store.budgets.find((b) => b.id === budgetId);
  assertBudgetEditable(budget);
  store.lines = store.lines.filter((l) => l.budgetId !== budgetId);
  writeStore(store);
  const created = addLines(budgetId, newLines, actingUser, { silent: true });
  log(ACTION_TYPES.WRITEBACK, "Base budget", budget, actingUser, `Generata base budget: ${created.length} righe`);
  return created;
}

export function deleteLine(budgetId, lineId, actingUser) {
  const store = readStore();
  const budget = store.budgets.find((b) => b.id === budgetId);
  assertBudgetEditable(budget);
  store.lines = store.lines.filter((l) => !(l.budgetId === budgetId && l.id === lineId));
  writeStore(store);
  log(ACTION_TYPES.DELETE, "Riga budget", budget, actingUser, `Eliminata riga ${lineId}`);
}

export function lineExists(budgetId, dims) {
  const store = readStore();
  const key = dimsKeyOf(dims);
  return store.lines.some((l) => l.budgetId === budgetId && dimsKeyOf(l.dims) === key);
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
