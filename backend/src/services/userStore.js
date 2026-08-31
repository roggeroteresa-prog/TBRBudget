/**
 * Gestione utenti: ruoli e visibilità per budget, ispirata al modello
 * accessSettings/rowLevelSecuritySettings di PWB. Le password sono
 * hashate (bcrypt) e mai esposte al front end — vedi authService.js per
 * l'emissione dei token JWT dopo il login. Persistito su SQLite (db.js).
 *
 * Ruoli:
 *  - admin:  accesso completo, incluse le Impostazioni, vede tutti i budget
 *  - editor:  può vedere/modificare solo i budget a cui è stato assegnato
 *  - viewer:  può solo vedere i budget a cui è assegnato
 */
import { randomUUID } from "crypto";
import { db } from "./db.js";
import { hashPassword, verifyPassword } from "./authService.js";

export const ROLES = ["admin", "editor", "viewer"];

const stmtListUsers = db.prepare("SELECT * FROM users ORDER BY name");
const stmtGetUser = db.prepare("SELECT * FROM users WHERE id = ?");
const stmtGetUserByEmail = db.prepare("SELECT * FROM users WHERE LOWER(email) = LOWER(?)");
const stmtInsertUser = db.prepare(`
  INSERT INTO users (id, name, email, passwordHash, role, allowedBudgetIds)
  VALUES (@id,@name,@email,@passwordHash,@role,@allowedBudgetIds)
`);
const stmtUpdateUser = db.prepare(`
  UPDATE users SET name=@name, email=@email, passwordHash=@passwordHash, role=@role, allowedBudgetIds=@allowedBudgetIds
  WHERE id=@id
`);
const stmtDeleteUser = db.prepare("DELETE FROM users WHERE id = ?");
const stmtCountAdmins = db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin'");

function rowToUser(row) {
  if (!row) return null;
  return {
    ...row,
    allowedBudgetIds: row.allowedBudgetIds == null ? null : JSON.parse(row.allowedBudgetIds),
  };
}

/** Non restituire mai l'hash della password al front end. */
function toPublicUser(user) {
  if (!user) return null;
  const { passwordHash, ...publicUser } = user;
  return publicUser;
}

export function listUsers() {
  return stmtListUsers.all().map(rowToUser).map(toPublicUser);
}

export function getUser(id) {
  return toPublicUser(rowToUser(stmtGetUser.get(id)));
}

/** Versione interna, CON l'hash — usata solo per verificare le credenziali al login. */
function getUserByEmailInternal(email) {
  return rowToUser(stmtGetUserByEmail.get(email));
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
  if (getUserByEmailInternal(email)) {
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

  stmtInsertUser.run({
    ...user,
    allowedBudgetIds: user.allowedBudgetIds == null ? null : JSON.stringify(user.allowedBudgetIds),
  });

  return toPublicUser(user);
}

export async function updateUser(id, patch) {
  const current = rowToUser(stmtGetUser.get(id));
  if (!current) return null;

  const { password, ...rest } = patch;
  const next = { ...current, ...rest };
  if (password) {
    if (password.length < 8) throw new Error("La password deve essere di almeno 8 caratteri.");
    next.passwordHash = await hashPassword(password);
  }
  if (next.role === "admin") next.allowedBudgetIds = null;

  stmtUpdateUser.run({
    id: next.id,
    name: next.name,
    email: next.email,
    passwordHash: next.passwordHash,
    role: next.role,
    allowedBudgetIds: next.allowedBudgetIds == null ? null : JSON.stringify(next.allowedBudgetIds),
  });

  return toPublicUser(next);
}

export function deleteUser(id) {
  const target = rowToUser(stmtGetUser.get(id));
  if (target?.role === "admin" && stmtCountAdmins.get().n <= 1) {
    throw new Error("Non puoi eliminare l'ultimo amministratore.");
  }
  stmtDeleteUser.run(id);
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
