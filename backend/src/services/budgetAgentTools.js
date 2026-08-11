/**
 * Funzioni esposte all'assistente come "tool" di function calling per la
 * gestione dei budget via chat: creazione, configurazione (dimensioni,
 * currency, importo iniziale) e modifica delle righe. Riusano esattamente
 * gli stessi servizi già usati dalle pagine "Gestione Budget"/"Budget dei
 * Ricavi"/"Configura", così la chat e la UI restano sempre coerenti —
 * inclusi permessi (RBAC) e storico azioni, che passano dagli stessi punti
 * di scrittura di budgetStore.js.
 */
import * as store from "./budgetStore.js";
import * as userStore from "./userStore.js";
import { getDimensions, categoryForProduct } from "./dimensionsService.js";
import { getCurrencyAnalysis } from "./salesDataService.js";
import { fetchLiveRates } from "./currencyRatesService.js";
import { generateBaseBudget, getConsolidatoAggregation } from "./baseBudgetService.js";
import { suggestBudgetLine } from "./suggestionService.js";

function summarizeBudget(b) {
  return {
    id: b.id,
    budgetName: b.budgetName,
    budgetYear: b.budgetYear,
    currencyCode: b.currencyCode,
    startDate: b.startDate,
    endDate: b.endDate,
    fixedFactor: b.fixedFactor,
    status: b.status,
    dimensions: b.dimensions,
    configStatus: b.configStatus,
  };
}

function assertCanEdit(actingUser, budgetId) {
  if (!userStore.canEditBudget(actingUser, budgetId)) {
    throw new Error("L'utente attivo non ha i permessi per modificare questo budget.");
  }
}

function assertCanView(actingUser, budgetId) {
  if (!userStore.canViewBudget(actingUser, budgetId)) {
    throw new Error("L'utente attivo non ha i permessi per vedere questo budget.");
  }
}

export function listBudgetsTool(_args, actingUser) {
  return store
    .listBudgets()
    .filter((b) => userStore.canViewBudget(actingUser, b.id))
    .map(summarizeBudget);
}

export function createBudgetTool({ budgetName, budgetYear, currencyCode, startDate, endDate, fixedFactor }, actingUser) {
  if (actingUser && actingUser.role === "viewer") {
    throw new Error("L'utente attivo (Visualizzatore) non può creare budget.");
  }
  if (!budgetName || !budgetYear || !startDate || !endDate || !fixedFactor) {
    throw new Error(
      "Parametri mancanti: servono budgetName, budgetYear, startDate (YYYY-MM-DD), endDate (YYYY-MM-DD) e fixedFactor (IMPORTO|QUANTITA|PREZZO)."
    );
  }
  if (!["IMPORTO", "QUANTITA", "PREZZO"].includes(fixedFactor)) {
    throw new Error("fixedFactor deve essere uno tra IMPORTO, QUANTITA, PREZZO.");
  }
  const budget = store.createBudget(
    { budgetName, budgetYear, currencyCode: currencyCode || "EUR", startDate, endDate, fixedFactor },
    actingUser?.name
  );
  return summarizeBudget(budget);
}

export function getDimensionOptionsTool() {
  const { defs, options } = getDimensions();
  return {
    availableDimensions: defs,
    macroarea: options.macroarea,
    country: options.country,
    customer: options.customer,
    category: options.category,
    product: options.product,
  };
}

export function configureDimensionsTool({ budgetId, dimensions }, actingUser) {
  const budget = store.getBudget(budgetId);
  if (!budget) throw new Error("Budget non trovato.");
  assertCanEdit(actingUser, budgetId);
  const valid = ["macroarea", "country", "customer", "category", "product"];
  if (!Array.isArray(dimensions) || dimensions.length === 0 || !dimensions.every((d) => valid.includes(d))) {
    throw new Error(`Dimensioni non valide. Valori ammessi: ${valid.join(", ")}.`);
  }
  const updated = store.updateBudget(budgetId, { dimensions }, actingUser?.name);
  return summarizeBudget(updated);
}

export async function getCurrencyAnalysisTool({ budgetId }, actingUser) {
  const budget = store.getBudget(budgetId);
  if (!budget) throw new Error("Budget non trovato.");
  assertCanView(actingUser, budgetId);
  const analysis = getCurrencyAnalysis(budget.startDate, budget.endDate, budget.currencyCode);
  let liveRates = {};
  if (analysis.length) {
    try {
      liveRates = await fetchLiveRates(budget.currencyCode, analysis.map((a) => a.code));
    } catch {
      // tassi live non disponibili: si procede solo con il suggerimento storico
    }
  }
  return {
    baseCurrency: budget.currencyCode,
    currencies: analysis.map((a) => ({ ...a, liveRate: liveRates[a.code] ?? null })),
  };
}

export function configureCurrencyTool({ budgetId, rates }, actingUser) {
  const budget = store.getBudget(budgetId);
  if (!budget) throw new Error("Budget non trovato.");
  assertCanEdit(actingUser, budgetId);
  const updated = store.updateBudget(budgetId, { exchangeRates: rates || {} }, actingUser?.name);
  return summarizeBudget(updated);
}

export function getConsuntivoTotalsTool({ budgetId }, actingUser) {
  const budget = store.getBudget(budgetId);
  if (!budget) throw new Error("Budget non trovato.");
  assertCanView(actingUser, budgetId);
  if (!budget.configStatus?.dimensions) {
    throw new Error("Configura prima le dimensioni del budget (configure_dimensions).");
  }
  const { consAmount, consQuantity } = getConsolidatoAggregation(budget, null, {});
  return {
    period: `${budget.startDate} → ${budget.endDate}`,
    currencyCode: budget.currencyCode,
    consAmount: Math.round(consAmount),
    consQuantity: Math.round(consQuantity),
  };
}

export function generateBaseBudgetTool({ budgetId, totalAmount, totalQuantity }, actingUser) {
  const budget = store.getBudget(budgetId);
  if (!budget) throw new Error("Budget non trovato.");
  assertCanEdit(actingUser, budgetId);
  if (!budget.configStatus?.dimensions) {
    throw new Error("Configura prima le dimensioni del budget (configure_dimensions).");
  }
  if (!totalAmount && !totalQuantity) {
    throw new Error("Serve almeno un importo o una quantità target.");
  }
  const { lines, meta } = generateBaseBudget(budget, { totalAmount, totalQuantity });
  store.replaceAllLines(budget.id, lines, actingUser?.name);
  store.updateBudget(
    budget.id,
    { initialTargets: { totalAmount: Number(totalAmount) || 0, totalQuantity: Number(totalQuantity) || 0 } },
    actingUser?.name
  );
  return { linesGenerated: lines.length, ...meta };
}

export function getBudgetLinesSummaryTool({ budgetId }, actingUser) {
  const budget = store.getBudget(budgetId);
  if (!budget) throw new Error("Budget non trovato.");
  assertCanView(actingUser, budgetId);
  const pivot = store.getPivot(budgetId);
  return {
    grandTotal: Math.round(pivot.grandTotal),
    rowCount: pivot.rows.length,
    topRows: pivot.rows
      .sort((a, b) => b.totalAmount - a.totalAmount)
      .slice(0, 15)
      .map((r) => ({
        dims: r.dims,
        totalAmount: Math.round(r.totalAmount),
        totalQuantity: Math.round(r.totalQuantity),
      })),
  };
}

/**
 * Restituisce TUTTE le righe di budget (senza il limite a 15 di
 * get_budget_lines_summary), con la categoria/coltura associata quando la
 * dimensione "product" è attiva — usato per operazioni che riguardano
 * l'intero budget, come la riponderazione stagionale su tutte le righe.
 */
export function getAllBudgetLinesTool({ budgetId }, actingUser) {
  const budget = store.getBudget(budgetId);
  if (!budget) throw new Error("Budget non trovato.");
  assertCanView(actingUser, budgetId);
  const pivot = store.getPivot(budgetId);
  return {
    grandTotal: Math.round(pivot.grandTotal),
    rowCount: pivot.rows.length,
    rows: pivot.rows.map((r) => ({
      dims: r.dims,
      category: r.dims.product ? categoryForProduct(r.dims.product) : r.dims.category || null,
      totalAmount: Math.round(r.totalAmount),
      totalQuantity: Math.round(r.totalQuantity),
      monthlyAmount: r.monthlyAmount.map((v) => Math.round(v)),
      monthlyQuantity: r.monthlyQuantity.map((v) => Math.round(v)),
    })),
  };
}

export async function suggestLineDistributionTool({ country, product }) {
  if (!country || !product) throw new Error("Servono country e product per suggerire una distribuzione.");
  return suggestBudgetLine({ country, product });
}

export function upsertBudgetLineTool({ budgetId, dims, distribution, amount, quantity, monthlyAmounts, monthlyQuantities }, actingUser) {
  const budget = store.getBudget(budgetId);
  if (!budget) throw new Error("Budget non trovato.");
  assertCanEdit(actingUser, budgetId);
  if (!dims || typeof dims !== "object" || Object.keys(dims).length === 0) {
    throw new Error("dims obbligatorio: un valore per ciascuna dimensione attiva del budget.");
  }
  const activeDims = budget.dimensions || [];
  const missing = activeDims.filter((d) => !(d in dims));
  if (missing.length) {
    throw new Error(`Mancano valori per le dimensioni: ${missing.join(", ")}.`);
  }

  const linesToCreate = [];
  if (distribution === "monthly") {
    for (let m = 1; m <= 12; m++) {
      const amt = Number(monthlyAmounts?.[m]) || 0;
      const qty = Number(monthlyQuantities?.[m]) || 0;
      if (amt > 0 || qty > 0) linesToCreate.push({ dims, month: m, amount: amt, quantity: qty });
    }
  } else {
    const totalAmount = Number(amount) || 0;
    const totalQuantity = Number(quantity) || 0;
    for (let m = 1; m <= 12; m++) {
      linesToCreate.push({ dims, month: m, amount: totalAmount / 12, quantity: totalQuantity / 12 });
    }
  }
  if (linesToCreate.length === 0) throw new Error("Inserisci almeno un valore di importo/quantità.");

  const result = store.upsertLines(budgetId, dims, linesToCreate, actingUser?.name);
  return { linesWritten: result.length, dims };
}

export function deleteBudgetLineTool({ budgetId, dims }, actingUser) {
  const budget = store.getBudget(budgetId);
  if (!budget) throw new Error("Budget non trovato.");
  assertCanEdit(actingUser, budgetId);
  const lines = store.listLines(budgetId);
  const toRemove = lines.filter((l) => Object.entries(dims || {}).every(([k, v]) => l.dims[k] === v));
  toRemove.forEach((l) => store.deleteLine(budgetId, l.id, actingUser?.name));
  return { deleted: toRemove.length };
}

export function setBudgetStatusTool({ budgetId, status }, actingUser) {
  if (!["Bozza", "Confermato"].includes(status)) throw new Error("status deve essere Bozza o Confermato.");
  const budget = store.getBudget(budgetId);
  if (!budget) throw new Error("Budget non trovato.");
  assertCanEdit(actingUser, budgetId);
  const updated = store.setBudgetStatus(budgetId, status, actingUser?.name);
  return summarizeBudget(updated);
}
