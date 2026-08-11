/**
 * Genera la "base budget": a partire dal consuntivo storico del periodo
 * selezionato in fase di creazione del budget, riponderà in modo
 * proporzionale i valori (per combinazione di dimensioni scelte E per mese,
 * preservando così sia il mix tra dimensioni sia la stagionalità storica)
 * sul nuovo importo/quantità target complessivo indicato dall'utente.
 */
import { getRowsInPeriod } from "./salesDataService.js";

/**
 * Costruisce la chiave delle dimensioni per una riga storica, in base alle
 * dimensioni attive sul budget. Ritorna null se manca un valore richiesto
 * (es. cliente non presente per anomalia nel consuntivo).
 */
function extractDims(row, activeDims) {
  const dims = {};
  for (const key of activeDims) {
    let value;
    if (key === "macroarea") value = row.region;
    else if (key === "country") value = row.country;
    else if (key === "customer") value = row.customer;
    else if (key === "category") value = row.crop;
    else if (key === "product") value = row.product;
    if (!value) return null;
    dims[key] = value;
  }
  return dims;
}

function dimsKeyOf(dims) {
  return JSON.stringify(dims);
}

export function generateBaseBudget(budget, { totalAmount, totalQuantity }) {
  const activeDims = budget.dimensions?.length ? budget.dimensions : ["country", "product"];
  const rows = getRowsInPeriod(budget.startDate, budget.endDate);

  // Aggregazione storica: per ogni combinazione di dimensioni e mese,
  // somma di importo (EUR) e quantità.
  const histAmount = new Map(); // key -> [12]
  const histQuantity = new Map();
  const dimsByKey = new Map();
  let totalHistAmount = 0;
  let totalHistQuantity = 0;
  let usedRows = 0;

  for (const row of rows) {
    const dims = extractDims(row, activeDims);
    if (!dims) continue;
    const key = dimsKeyOf(dims);
    if (!histAmount.has(key)) {
      histAmount.set(key, Array(12).fill(0));
      histQuantity.set(key, Array(12).fill(0));
      dimsByKey.set(key, dims);
    }
    histAmount.get(key)[row.month - 1] += row.revenueEur;
    histQuantity.get(key)[row.month - 1] += row.quantity;
    totalHistAmount += row.revenueEur;
    totalHistQuantity += row.quantity;
    usedRows += 1;
  }

  const lines = [];
  const target = { totalAmount: Number(totalAmount) || 0, totalQuantity: Number(totalQuantity) || 0 };

  if (totalHistAmount > 0 || totalHistQuantity > 0) {
    for (const [key, dims] of dimsByKey.entries()) {
      const amtByMonth = histAmount.get(key);
      const qtyByMonth = histQuantity.get(key);
      for (let m = 0; m < 12; m++) {
        const amountShare = totalHistAmount > 0 ? amtByMonth[m] / totalHistAmount : 0;
        const quantityShare = totalHistQuantity > 0 ? qtyByMonth[m] / totalHistQuantity : 0;
        const newAmount = target.totalAmount * amountShare;
        const newQuantity = target.totalQuantity * quantityShare;
        if (newAmount > 0 || newQuantity > 0) {
          lines.push({ dims, month: m + 1, amount: newAmount, quantity: newQuantity });
        }
      }
    }
  }

  return {
    lines,
    meta: {
      historicalRowsUsed: usedRows,
      historicalGroups: dimsByKey.size,
      totalHistoricalAmount: Math.round(totalHistAmount),
      totalHistoricalQuantity: Math.round(totalHistQuantity),
    },
  };
}

function rowMatchesFilters(dims, filters) {
  return Object.entries(filters || {}).every(([k, v]) => {
    if (Array.isArray(v)) return v.length === 0 || v.includes(dims[k]);
    return dims[k] === v;
  });
}

/**
 * Aggregazione del consolidato (storico) per la pagina "Budget dei Ricavi":
 * filtra le righe storiche del periodo secondo i filtri di drill-down
 * correnti, poi le raggruppa per una singola dimensione (viewDim) — oppure
 * restituisce solo il totale se viewDim è null (livello "Budget" radice).
 */
export function getConsolidatoAggregation(budget, viewDim, filters) {
  const activeDims = budget.dimensions?.length ? budget.dimensions : ["country", "product"];
  const rows = getRowsInPeriod(budget.startDate, budget.endDate);

  const groups = new Map();
  let totalAmount = 0;
  let totalQuantity = 0;

  for (const row of rows) {
    const dims = extractDims(row, activeDims);
    if (!dims) continue;
    if (!rowMatchesFilters(dims, filters)) continue;

    totalAmount += row.revenueEur;
    totalQuantity += row.quantity;

    if (viewDim) {
      const value = dims[viewDim];
      if (!groups.has(value)) groups.set(value, { value, consAmount: 0, consQuantity: 0 });
      const g = groups.get(value);
      g.consAmount += row.revenueEur;
      g.consQuantity += row.quantity;
    }
  }

  const groupList = Array.from(groups.values()).sort((a, b) => b.consAmount - a.consAmount);
  return { consAmount: totalAmount, consQuantity: totalQuantity, groups: groupList };
}