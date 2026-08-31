/**
 * Gestione utenti: ruoli e visibilità per budget, ispirata al modello
 * accessSettings/rowLevelSecuritySettings di PWB. Le password sono
 * hashate (bcrypt) e mai esposte al front end — vedi authService.js per
 * l'emissione dei token JWT dopo il login.
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
import { hashPassword, verifyPassword } from "./authService.js";

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

/** Non restituire mai l'hash della password al front end. */
function toPublicUser(user) {
  if (!user) return null;
  const { passwordHash, ...publicUser } = user;
  return publicUser;
}

export function listUsers() {
  return readStore().users.map(toPublicUser);
}

export function getUser(id) {
  const user = readStore().users.find((u) => u.id === id) || null;
  return toPublicUser(user);
}

/** Versione interna, CON l'hash — usata solo per verificare le credenziali al login. */
function getUserByEmailInternal(email) {
  return readStore().users.find((u) => u.email.toLowerCase() === email.toLowerCase()) || null;
}

/** Utente "di sistema" usato quando la richiesta non specifica un utente attivo. */
export function getDefaultUser() {
  const users = listUsers();
  return users.find((u) => u.role === "admin") || users[0] || null;
}

export async function createUser({ name, email, password, role, allowedBudgetIds }) {
  if (!name || !email || !password || !ROLES.includes(role)) {
    throw new Error("Servono nome, email, password e ruolo valido (admin, editor, viewer).");
  }
  if (password.length < 8) {
    throw new Error("La password deve essere di almeno 8 caratteri.");
  }
  const store = readStore();
  if (store.users.some((u) => u.email.toLowerCase() === email.toLowerCase())) {
    throw new Error("Esiste già un utente con questa email.");
  }
  const passwordHash = await hashPassword(password);
  const user = {
    id: randomUUID(),
    name,
    email,
    passwordHash,
    role,
    allowedBudgetIds: role === "admin" ? null : allowedBudgetIds || [],
  };
  store.users.push(user);
  writeStore(store);
  return toPublicUser(user);
}

export async function updateUser(id, patch) {
  const store = readStore();
  const idx = store.users.findIndex((u) => u.id === id);
  if (idx === -1) return null;

  const { password, ...rest } = patch;
  const next = { ...store.users[idx], ...rest };
  if (password) {
    if (password.length < 8) throw new Error("La password deve essere di almeno 8 caratteri.");
    next.passwordHash = await hashPassword(password);
  }
  if (next.role === "admin") next.allowedBudgetIds = null;

  store.users[idx] = next;
  writeStore(store);
  return toPublicUser(next);
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

/**
 * Verifica email+password. Restituisce l'utente (senza hash) se valide,
 * altrimenti null — usata solo dalla rotta di login.
 */
export async function verifyCredentials(email, password) {
  const user = getUserByEmailInternal(email);
  if (!user) return null;
  const valid = await verifyPassword(password, user.passwordHash);
  return valid ? toPublicUser(user) : null;
}

/** Verifica se un utente può VEDERE un dato budget. */
export function canViewBudget(user, budgetId) {
  if (!user) return true; // nessun utente autenticato: nessuna restrizione (demo aperta)
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
