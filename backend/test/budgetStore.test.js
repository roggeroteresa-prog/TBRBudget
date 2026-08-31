import { test, describe, after } from "node:test";
import assert from "node:assert/strict";
import { db, dimsKeyOf } from "../src/services/db.js";
import * as store from "../src/services/budgetStore.js";

// Ogni test crea ed elimina i propri budget: non lascia dati residui nel
// database (che comunque non è tracciato da Git, vedi .gitignore).
const createdIds = [];
function makeTestBudget(name) {
  const b = store.createBudget(
    { budgetName: name, budgetYear: 2027, startDate: "2025-01-01", endDate: "2025-12-31", fixedFactor: "PREZZO" },
    "Test Runner"
  );
  createdIds.push(b.id);
  return b;
}

after(() => {
  for (const id of createdIds) {
    try {
      store.deleteBudget(id, "Test Runner");
    } catch {
      // già eliminato da un test specifico: va bene così
    }
  }
});

describe("budgetStore — persistenza SQLite", () => {
  test("dimsKeyOf è indipendente dall'ordine delle chiavi", () => {
    const k1 = dimsKeyOf({ country: "Italia", product: "AltaResa" });
    const k2 = dimsKeyOf({ product: "AltaResa", country: "Italia" });
    assert.equal(k1, k2);
  });

  test("pivot aggrega correttamente righe mensili sulla stessa combinazione di dimensioni", () => {
    const budget = makeTestBudget("Test_Pivot");
    const lines = Array.from({ length: 12 }, (_, i) => ({
      dims: { country: "Italia", product: "AltaResa" },
      month: i + 1,
      amount: 1000,
      quantity: 1,
    }));
    store.addLines(budget.id, lines, "Test Runner");

    const pivot = store.getPivot(budget.id);
    assert.equal(pivot.grandTotal, 12000);
    assert.equal(pivot.rows.length, 1);
  });

  test("upsertLines sostituisce le righe esistenti in un'unica transazione atomica", () => {
    const budget = makeTestBudget("Test_Upsert");
    store.addLines(budget.id, [{ dims: { country: "Italia" }, month: 1, amount: 100, quantity: 1 }], "Test Runner");
    store.upsertLines(budget.id, { country: "Italia" }, [{ dims: { country: "Italia" }, month: 1, amount: 5000, quantity: 2 }], "Test Runner");

    const lines = store.listLines(budget.id);
    assert.equal(lines.length, 1);
    assert.equal(lines[0].amount, 5000);
  });

  test("un budget Confermato blocca l'aggiunta di righe, ma non il cambio di stato", () => {
    const budget = makeTestBudget("Test_Guardia");
    store.setBudgetStatus(budget.id, "Confermato", "Test Runner");

    assert.throws(() => {
      store.addLines(budget.id, [{ dims: { country: "Francia" }, month: 1, amount: 100, quantity: 1 }], "Test Runner");
    });

    const reverted = store.setBudgetStatus(budget.id, "Bozza", "Test Runner");
    assert.equal(reverted.status, "Bozza");
  });

  test("eliminare un budget elimina anche tutte le sue righe (ON DELETE CASCADE)", () => {
    const budget = makeTestBudget("Test_Cascade");
    store.addLines(budget.id, [{ dims: { country: "Italia" }, month: 1, amount: 100, quantity: 1 }], "Test Runner");

    store.deleteBudget(budget.id, "Test Runner");
    createdIds.splice(createdIds.indexOf(budget.id), 1); // già eliminato qui

    assert.equal(store.getBudget(budget.id), null);
    const orphanRows = db.prepare("SELECT COUNT(*) AS n FROM budget_lines WHERE budgetId = ?").get(budget.id);
    assert.equal(orphanRows.n, 0);
  });
});
