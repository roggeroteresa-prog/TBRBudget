import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { getConsolidatoAggregation } from "../src/services/baseBudgetService.js";

// Budget fittizio: legge comunque il vero consuntivo (data/tbr_sales.csv),
// ma non scrive nulla — sola lettura, sicuro da eseguire in CI.
const fakeBudget = {
  currencyCode: "EUR",
  startDate: "2020-01-01",
  endDate: "2030-12-31",
  exchangeRates: {},
};

describe("baseBudgetService — getConsolidatoAggregation", () => {
  test("senza filtri, il totale è coerente con la somma dei gruppi per paese", () => {
    const noFilter = getConsolidatoAggregation(fakeBudget, "country", {});
    const sumOfGroups = noFilter.groups.reduce((s, g) => s + g.consAmount, 0);
    // tolleranza minima per arrotondamenti in virgola mobile
    assert.ok(Math.abs(sumOfGroups - noFilter.consAmount) < 1);
  });

  test("un filtro con array vuoto equivale a nessun filtro", () => {
    const noFilter = getConsolidatoAggregation(fakeBudget, null, {});
    const emptyArrayFilter = getConsolidatoAggregation(fakeBudget, null, { country: [] });
    assert.equal(Math.round(emptyArrayFilter.consAmount), Math.round(noFilter.consAmount));
  });

  test("un filtro multi-valore restituisce un sottoinsieme coerente del totale", () => {
    const all = getConsolidatoAggregation(fakeBudget, null, {});
    const filtered = getConsolidatoAggregation(fakeBudget, null, { country: ["Italia", "Francia"] });
    assert.ok(filtered.consAmount > 0, "il filtro deve trovare almeno delle righe");
    assert.ok(filtered.consAmount <= all.consAmount, "il sottoinsieme non può superare il totale");
  });
});
