import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { categoryForProduct, DIMENSION_DEFS } from "../src/services/dimensionsService.js";

describe("dimensionsService", () => {
  test("categoryForProduct riconosce i prodotti noti del catalogo", () => {
    assert.equal(categoryForProduct("AltaResa"), "Mais");
    assert.equal(categoryForProduct("SolePieno"), "Girasole");
    assert.equal(categoryForProduct("FienoFacile"), "Foraggio");
  });

  test("categoryForProduct restituisce null per un prodotto sconosciuto", () => {
    assert.equal(categoryForProduct("ProdottoInventato"), null);
  });

  test("le 5 dimensioni attese sono tutte definite", () => {
    const keys = DIMENSION_DEFS.map((d) => d.key).sort();
    assert.deepEqual(keys, ["category", "country", "customer", "macroarea", "product"]);
  });
});
