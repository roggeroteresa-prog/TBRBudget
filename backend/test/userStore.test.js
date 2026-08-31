import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { canViewBudget, canEditBudget, canAccessSettings } from "../src/services/userStore.js";

describe("userStore — permessi (RBAC)", () => {
  const admin = { role: "admin", allowedBudgetIds: null };
  const editorWithAccess = { role: "editor", allowedBudgetIds: ["b1", "b2"] };
  const editorNoAccess = { role: "editor", allowedBudgetIds: [] };
  const viewerWithAccess = { role: "viewer", allowedBudgetIds: ["b1"] };

  test("nessun utente attivo: nessuna restrizione (demo aperta)", () => {
    assert.equal(canViewBudget(null, "b1"), true);
    assert.equal(canEditBudget(null, "b1"), true);
  });

  test("admin vede e modifica sempre, qualunque budget", () => {
    assert.equal(canViewBudget(admin, "qualsiasi-id"), true);
    assert.equal(canEditBudget(admin, "qualsiasi-id"), true);
  });

  test("editor vede/modifica solo i budget assegnati esplicitamente", () => {
    assert.equal(canViewBudget(editorWithAccess, "b1"), true);
    assert.equal(canEditBudget(editorWithAccess, "b1"), true);
    assert.equal(canViewBudget(editorWithAccess, "b3-non-assegnato"), false);
  });

  test("editor senza budget assegnati non vede nulla", () => {
    assert.equal(canViewBudget(editorNoAccess, "b1"), false);
  });

  test("viewer può vedere ma mai modificare, anche sui budget assegnati", () => {
    assert.equal(canViewBudget(viewerWithAccess, "b1"), true);
    assert.equal(canEditBudget(viewerWithAccess, "b1"), false);
  });

  test("solo admin accede alle Impostazioni", () => {
    assert.equal(canAccessSettings(admin), true);
    assert.equal(canAccessSettings(editorWithAccess), false);
    assert.equal(canAccessSettings(viewerWithAccess), false);
    assert.equal(canAccessSettings(null), true); // nessun utente attivo: demo aperta
  });
});
