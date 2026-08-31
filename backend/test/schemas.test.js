import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  createBudgetSchema,
  statusSchema,
  generateBaseBudgetSchema,
  lineBodySchema,
} from "../src/validation/schemas.js";

describe("validazione schemi budget (Zod)", () => {
  test("crea budget: accetta un payload valido", () => {
    const result = createBudgetSchema.safeParse({
      budgetName: "Export2027",
      budgetYear: 2027,
      startDate: "2025-01-01",
      endDate: "2025-12-31",
      fixedFactor: "PREZZO",
    });
    assert.equal(result.success, true);
  });

  test("crea budget: respinge fattore fisso non ammesso", () => {
    const result = createBudgetSchema.safeParse({
      budgetName: "X",
      budgetYear: 2027,
      startDate: "2025-01-01",
      endDate: "2025-12-31",
      fixedFactor: "PIPPO",
    });
    assert.equal(result.success, false);
  });

  test("crea budget: respinge data di fine precedente alla data di inizio", () => {
    const result = createBudgetSchema.safeParse({
      budgetName: "X",
      budgetYear: 2027,
      startDate: "2025-12-31",
      endDate: "2025-01-01",
      fixedFactor: "PREZZO",
    });
    assert.equal(result.success, false);
  });

  test("stato: accetta solo Bozza o Confermato", () => {
    assert.equal(statusSchema.safeParse({ status: "Bozza" }).success, true);
    assert.equal(statusSchema.safeParse({ status: "Eliminato" }).success, false);
  });

  test("importo target: richiede almeno un valore maggiore di zero", () => {
    assert.equal(generateBaseBudgetSchema.safeParse({}).success, false);
    assert.equal(generateBaseBudgetSchema.safeParse({ totalAmount: -100 }).success, false);
    assert.equal(generateBaseBudgetSchema.safeParse({ totalAmount: 1000 }).success, true);
  });

  test("riga di budget: respinge una dimensione inventata", () => {
    const result = lineBodySchema.safeParse({ dims: { pianeta: "Marte" }, distribution: "total" });
    assert.equal(result.success, false);
  });

  test("riga di budget: accetta una distribuzione mensile valida", () => {
    const result = lineBodySchema.safeParse({
      dims: { country: "Italia", product: "AltaResa" },
      distribution: "monthly",
      monthlyAmounts: { "1": 1000, "6": 2000 },
    });
    assert.equal(result.success, true);
  });
});
