/**
 * Gestione utenti "leggera" per il progetto di tesi: ruoli e visibilità per
 * budget, ispirata al modello accessSettings/rowLevelSecuritySettings di
 * PWB, semplificata (nessun vero login/autenticazione — l'utente attivo è
 * scelto dal selettore nella navbar e passato ad ogni richiesta tramite
 * l'header x-user-id).
 *
 * Ruoli:
 *  - admin:  accesso completo, incluse le Impostazioni, vede tutti i budget
 *  - editor:  può vedere/modificare solo i budget a cui è stato assegnato
 *  - viewer:  può solo vedere (sola lettura) i budget a cui è assegnato
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { randomUUID } from "crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STORE_PATH = path.join(__dirname, "..", "data", "users-store.json");

export const ROLES = ["admin", "editor", "viewer"];

function readStore() {
  if (!fs.existsSync(STORE_PATH)) return { users: [] };
  try {
    return JSON.parse(fs.readFileSync(STORE_PATH, "utf-8"));
  } catch {
    return { users: [] };
  }
}

function writeStore(store) {
  fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), "utf-8");
}

export function listUsers() {
  return readStore().users;
}

export function getUser(id) {
  return readStore().users.find((u) => u.id === id) || null;
}

/** Utente "di sistema" usato quando la richiesta non specifica un utente attivo. */
export function getDefaultUser() {
  const users = listUsers();
  return users.find((u) => u.role === "admin") || users[0] || null;
}

export function createUser({ name, email, role, allowedBudgetIds }) {
  if (!name || !email || !ROLES.includes(role)) {
    throw new Error("Servono nome, email e ruolo valido (admin, editor, viewer).");
  }
  const store = readStore();
  const user = {
    id: randomUUID(),
    name,
    email,
    role,
    allowedBudgetIds: role === "admin" ? null : allowedBudgetIds || [],
  };
  store.users.push(user);
  writeStore(store);
  return user;
}

export function updateUser(id, patch) {
  const store = readStore();
  const idx = store.users.findIndex((u) => u.id === id);
  if (idx === -1) return null;
  const next = { ...store.users[idx], ...patch };
  if (next.role === "admin") next.allowedBudgetIds = null;
  store.users[idx] = next;
  writeStore(store);
  return next;
}

export function deleteUser(id) {
  const store = readStore();
  const target = store.users.find((u) => u.id === id);
  if (target?.role === "admin" && store.users.filter((u) => u.role === "admin").length <= 1) {
    throw new Error("Non puoi eliminare l'ultimo amministratore.");
  }
  store.users = store.users.filter((u) => u.id !== id);
  writeStore(store);
}

/** Verifica se un utente può VEDERE un dato budget. */
export function canViewBudget(user, budgetId) {
  if (!user) return true; // nessun utente attivo configurato: nessuna restrizione (demo aperta)
  if (user.role === "admin") return true;
  if (!user.allowedBudgetIds) return false;
  return user.allowedBudgetIds.includes(budgetId);
}

/** Verifica se un utente può MODIFICARE un dato budget (implica poterlo vedere). */
export function canEditBudget(user, budgetId) {
  if (!user) return true;
  if (user.role === "viewer") return false;
  return canViewBudget(user, budgetId);
}

export function canAccessSettings(user) {
  return !user || user.role === "admin";
}
