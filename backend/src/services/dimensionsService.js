/**
 * Dimensioni di analisi configurabili per un budget, derivate dai dati reali
 * del consuntivo vendite (data/tbr_sales.csv), con mappe di filtro
 * incrociato (macroarea -> paesi, paese -> clienti, categoria -> prodotti).
 */
import { getAllRows } from "./salesDataService.js";

export const DIMENSION_DEFS = [
  { key: "macroarea", label: "Macroarea" },
  { key: "country", label: "Paese" },
  { key: "customer", label: "Cliente" },
  { key: "category", label: "Categoria Prodotto" },
  { key: "product", label: "Prodotto" },
];

let cache = null;

function build() {
  if (cache) return cache;

  const rows = getAllRows();

  const macroareas = new Set();
  const countries = new Set();
  const customers = new Set();
  const categories = new Set();
  const products = new Map(); // code -> category

  const countryToMacroarea = {};
  const macroareaToCountries = {};
  const customerToCountry = {};
  const countryToCustomers = {};
  const productToCategory = {};
  const categoryToProducts = {};

  for (const r of rows) {
    if (r.region) macroareas.add(r.region);
    countries.add(r.country);
    if (r.customer) customers.add(r.customer);
    categories.add(r.crop);
    products.set(r.product, r.crop);

    if (r.region) {
      countryToMacroarea[r.country] = r.region;
      (macroareaToCountries[r.region] ??= new Set()).add(r.country);
    }
    if (r.customer) {
      customerToCountry[r.customer] = r.country;
      (countryToCustomers[r.country] ??= new Set()).add(r.customer);
    }
    productToCategory[r.product] = r.crop;
    (categoryToProducts[r.crop] ??= new Set()).add(r.product);
  }

  const toSortedArray = (s) => Array.from(s).sort();
  const mapOfSets = (obj) => Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, toSortedArray(v)]));

  cache = {
    options: {
      macroarea: toSortedArray(macroareas),
      country: toSortedArray(countries),
      customer: toSortedArray(customers),
      category: toSortedArray(categories),
      product: Array.from(products.entries()).map(([code, category]) => ({ code, category })).sort((a, b) => a.code.localeCompare(b.code)),
    },
    filters: {
      countryToMacroarea,
      macroareaToCountries: mapOfSets(macroareaToCountries),
      customerToCountry,
      countryToCustomers: mapOfSets(countryToCustomers),
      productToCategory,
      categoryToProducts: mapOfSets(categoryToProducts),
    },
  };
  return cache;
}

export function getDimensions() {
  const { options, filters } = build();
  return { defs: DIMENSION_DEFS, options, filters };
}

export function categoryForProduct(productCode) {
  return build().filters.productToCategory[productCode] || null;
}

export function currencyForCountry(country) {
  const rows = getAllRows();
  const match = rows.find((r) => r.country === country);
  return match ? match.currency : "EUR";
}
