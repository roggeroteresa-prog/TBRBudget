/**
 * Legge e pulisce il CSV di consuntivo vendite, con cache in memoria
 * invalidata solo se il file cambia (confronto sulla data di modifica, così
 * da evitare di rileggerlo e ripulirlo ad ogni chiamata pur restando
 * corretti se il dataset viene aggiornato). Usato da: dimensionsService
 * (opzioni dei dropdown derivate dai dati reali), la configurazione valuta
 * del budget (analisi del periodo consuntivo) e la generazione della base
 * budget (riponderazione proporzionale del consuntivo sul nuovo target).
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CSV_PATH = path.join(__dirname, "..", "..", "..", "data", "tbr_sales.csv");

let cachedRows = null;
let cachedMtimeMs = null;

function parseCsvLine(line) {
  // Il dataset non contiene virgole/virgolette nei campi di testo, quindi
  // uno split semplice è sufficiente e robusto.
  return line.split(",");
}

/**
 * Prova a interpretare le date in formati misti (coerente con le anomalie
 * introdotte volutamente nel dataset): ISO, europeo, US, "15-Mar-2023".
 */
function parseMixedDate(raw) {
  if (!raw) return null;
  const s = raw.trim();

  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/); // ISO
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));

  m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/); // dd/mm/yyyy
  if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));

  m = s.match(/^(\d{2})-(\d{2})-(\d{4})$/); // mm-dd-yyyy
  if (m) return new Date(Number(m[3]), Number(m[1]) - 1, Number(m[2]));

  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  m = s.match(/^(\d{2})-([A-Za-z]{3})-(\d{4})$/); // dd-Mon-yyyy
  if (m) {
    const mi = MONTHS.indexOf(m[2]);
    if (mi >= 0) return new Date(Number(m[3]), mi, Number(m[1]));
  }

  const fallback = new Date(s);
  return isNaN(fallback.getTime()) ? null : fallback;
}

// Lista canonica dei paesi (deve rispecchiare le chiavi di COUNTRIES in
// data/generate_data.py) usata per normalizzare eventuali anomalie di
// maiuscole/minuscole nel campo country senza alterare acronimi legittimi
// come "USA".
const CANONICAL_COUNTRIES = [
  "Italia", "Francia", "Spagna", "Germania", "Polonia", "Ungheria", "Romania",
  "Serbia", "Bulgaria", "Ucraina", "Russia", "Turchia", "Kazakhstan", "USA",
  "Canada", "Messico", "Brasile", "Argentina", "Sud Africa", "Australia",
];
const COUNTRY_LOOKUP = new Map(CANONICAL_COUNTRIES.map((c) => [c.toLowerCase(), c]));

function clean(str) {
  return (str || "").trim();
}

function normalizeCountry(raw) {
  const trimmed = clean(raw);
  return COUNTRY_LOOKUP.get(trimmed.toLowerCase()) || trimmed;
}

/**
 * Carica e pulisce il CSV: converte le date, rimuove duplicati esatti,
 * scarta righe con quantità/importo palesemente fuori range, normalizza
 * spazi/maiuscole nei campi testuali.
 */
function loadRows() {
  const mtimeMs = fs.statSync(CSV_PATH).mtimeMs;
  if (cachedRows && cachedMtimeMs === mtimeMs) return cachedRows;

  const raw = fs.readFileSync(CSV_PATH, "utf-8").trim().split("\n");
  const header = parseCsvLine(raw[0]);
  const idx = Object.fromEntries(header.map((h, i) => [h.trim(), i]));

  const seen = new Set();
  const rows = [];

  for (let i = 1; i < raw.length; i++) {
    const cols = parseCsvLine(raw[i]);
    if (cols.length < header.length) continue;

    const country = normalizeCountry(cols[idx.country]);
    const product = clean(cols[idx.product]);
    const date = parseMixedDate(cols[idx.order_date]);
    const quantity = Number(cols[idx.quantity]);
    const unitPriceEur = Number(cols[idx.unit_price_eur]);
    const revenueEur = Number(cols[idx.revenue_eur]);

    if (!date) continue;
    if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 50) continue;
    if (!Number.isFinite(unitPriceEur) || unitPriceEur <= 0) continue;
    if (!Number.isFinite(revenueEur) || revenueEur <= 0) continue;

    const dedupeKey = `${cols[idx.order_id]}|${country}|${product}|${cols[idx.order_date]}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    rows.push({
      orderId: cols[idx.order_id],
      date,
      month: date.getMonth() + 1,
      country,
      region: clean(cols[idx.region]) || null,
      customer: clean(cols[idx.customer]) || null,
      product,
      crop: clean(cols[idx.crop]),
      quantity,
      unitPriceEur,
      revenueEur,
      salesChannel: clean(cols[idx.sales_channel]) || null,
      currency: clean(cols[idx.currency]) || "EUR",
      fxRateUsed: Number(cols[idx.fx_rate_used]) || 1,
      revenueLocal: Number(cols[idx.revenue_local]) || revenueEur,
    });
  }

  cachedRows = rows;
  cachedMtimeMs = mtimeMs;
  return rows;
}

export function getAllRows() {
  return loadRows();
}

export function getRowsInPeriod(startDate, endDate) {
  const start = startDate ? new Date(startDate) : null;
  const end = endDate ? new Date(endDate) : null;
  return loadRows().filter((r) => (!start || r.date >= start) && (!end || r.date <= end));
}

/**
 * Analizza le valute presenti nel periodo consuntivo (diverse da quella
 * base del budget) e suggerisce un tasso di cambio medio osservato nei dati.
 */
export function getCurrencyAnalysis(startDate, endDate, baseCurrency) {
  const rows = getRowsInPeriod(startDate, endDate).filter((r) => r.currency !== baseCurrency);
  const groups = new Map();

  for (const r of rows) {
    if (!groups.has(r.currency)) groups.set(r.currency, { sum: 0, count: 0 });
    const g = groups.get(r.currency);
    g.sum += r.fxRateUsed;
    g.count += 1;
  }

  return Array.from(groups.entries())
    .map(([code, g]) => ({ code, sampleCount: g.count, suggestedRate: Number((g.sum / g.count).toFixed(4)) }))
    .sort((a, b) => b.sampleCount - a.sampleCount);
}