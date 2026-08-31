/**
 * Connessione SQLite condivisa da budgetStore.js, userStore.js e
 * historyService.js. Sostituisce i tre file JSON separati (budgets-store,
 * users-store, history-log): con SQLite ogni scrittura è una transazione
 * atomica su righe specifiche, non più una riscrittura dell'intero file —
 * elimina la race condition per cui due scritture concorrenti (interfaccia
 * + assistente in chat) potevano sovrascriversi a vicenda.
 *
 * Se il database non esiste ancora ma sono presenti i vecchi file JSON,
 * vengono importati automaticamente una sola volta (nessun dato perso).
 */
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "data");
const DB_PATH = path.join(DATA_DIR, "tbr.db");

const BUDGETS_JSON = path.join(DATA_DIR, "budgets-store.json");
const USERS_JSON = path.join(DATA_DIR, "users-store.json");
const HISTORY_JSON = path.join(DATA_DIR, "history-log.json");

const isFreshDb = !fs.existsSync(DB_PATH);

export const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL"); // migliore concorrenza in lettura/scrittura
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS budgets (
    id TEXT PRIMARY KEY,
    company TEXT NOT NULL,
    budgetName TEXT NOT NULL,
    budgetYear INTEGER NOT NULL,
    currencyCode TEXT NOT NULL,
    startDate TEXT NOT NULL,
    endDate TEXT NOT NULL,
    fixedFactor TEXT NOT NULL,
    status TEXT NOT NULL,
    createdAt TEXT NOT NULL,
    createdBy TEXT,
    dimensions TEXT NOT NULL DEFAULT '[]',
    exchangeRates TEXT NOT NULL DEFAULT '{}',
    initialTargets TEXT NOT NULL DEFAULT '{"totalAmount":0,"totalQuantity":0}',
    configStatus TEXT NOT NULL DEFAULT '{"dimensions":false,"currency":false,"amounts":false}'
  );

  CREATE TABLE IF NOT EXISTS budget_lines (
    id TEXT PRIMARY KEY,
    budgetId TEXT NOT NULL REFERENCES budgets(id) ON DELETE CASCADE,
    dims TEXT NOT NULL,
    dimsKey TEXT NOT NULL,
    month INTEGER NOT NULL,
    amount REAL NOT NULL DEFAULT 0,
    quantity REAL NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_lines_budget ON budget_lines(budgetId);
  CREATE INDEX IF NOT EXISTS idx_lines_budget_dimskey ON budget_lines(budgetId, dimsKey);

  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    passwordHash TEXT,
    role TEXT NOT NULL,
    allowedBudgetIds TEXT
  );

  CREATE TABLE IF NOT EXISTS history_events (
    id TEXT PRIMARY KEY,
    timestamp TEXT NOT NULL,
    actionType TEXT NOT NULL,
    entity TEXT NOT NULL,
    budgetId TEXT,
    budgetName TEXT,
    user TEXT,
    detail TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_history_timestamp ON history_events(timestamp DESC);
`);

if (isFreshDb) {
  migrateFromJsonIfPresent();
}

/** Chiave canonica per una combinazione di dimensioni (indipendente dall'ordine delle chiavi). */
export function dimsKeyOf(dims) {
  return JSON.stringify(dims, Object.keys(dims).sort());
}

function migrateFromJsonIfPresent() {
  const insertBudget = db.prepare(`
    INSERT INTO budgets (id, company, budgetName, budgetYear, currencyCode, startDate, endDate, fixedFactor, status, createdAt, createdBy, dimensions, exchangeRates, initialTargets, configStatus)
    VALUES (@id,@company,@budgetName,@budgetYear,@currencyCode,@startDate,@endDate,@fixedFactor,@status,@createdAt,@createdBy,@dimensions,@exchangeRates,@initialTargets,@configStatus)
  `);
  const insertLine = db.prepare(`
    INSERT INTO budget_lines (id, budgetId, dims, dimsKey, month, amount, quantity)
    VALUES (@id,@budgetId,@dims,@dimsKey,@month,@amount,@quantity)
  `);
  const insertUser = db.prepare(`
    INSERT INTO users (id, name, email, passwordHash, role, allowedBudgetIds)
    VALUES (@id,@name,@email,@passwordHash,@role,@allowedBudgetIds)
  `);
  const insertEvent = db.prepare(`
    INSERT INTO history_events (id, timestamp, actionType, entity, budgetId, budgetName, user, detail)
    VALUES (@id,@timestamp,@actionType,@entity,@budgetId,@budgetName,@user,@detail)
  `);

  if (fs.existsSync(BUDGETS_JSON)) {
    try {
      const data = JSON.parse(fs.readFileSync(BUDGETS_JSON, "utf-8"));
      const tx = db.transaction(() => {
        for (const b of data.budgets || []) {
          insertBudget.run({
            ...b,
            createdBy: b.createdBy ?? null,
            dimensions: JSON.stringify(b.dimensions || []),
            exchangeRates: JSON.stringify(b.exchangeRates || {}),
            initialTargets: JSON.stringify(b.initialTargets || { totalAmount: 0, totalQuantity: 0 }),
            configStatus: JSON.stringify(b.configStatus || { dimensions: false, currency: false, amounts: false }),
          });
        }
        for (const l of data.lines || []) {
          insertLine.run({ ...l, dims: JSON.stringify(l.dims), dimsKey: dimsKeyOf(l.dims) });
        }
      });
      tx();
      console.log(`[db] Migrati ${data.budgets?.length || 0} budget e ${data.lines?.length || 0} righe da budgets-store.json`);
    } catch (err) {
      console.error("[db] Migrazione budgets-store.json fallita:", err.message);
    }
  }

  if (fs.existsSync(USERS_JSON)) {
    try {
      const data = JSON.parse(fs.readFileSync(USERS_JSON, "utf-8"));
      const tx = db.transaction(() => {
        for (const u of data.users || []) {
          insertUser.run({
            ...u,
            passwordHash: u.passwordHash ?? null,
            allowedBudgetIds: u.allowedBudgetIds == null ? null : JSON.stringify(u.allowedBudgetIds),
          });
        }
      });
      tx();
      console.log(`[db] Migrati ${data.users?.length || 0} utenti da users-store.json`);
    } catch (err) {
      console.error("[db] Migrazione users-store.json fallita:", err.message);
    }
  }

  if (fs.existsSync(HISTORY_JSON)) {
    try {
      const events = JSON.parse(fs.readFileSync(HISTORY_JSON, "utf-8"));
      const tx = db.transaction(() => {
        for (const e of events) {
          insertEvent.run({
            ...e,
            budgetId: e.budgetId ?? null,
            budgetName: e.budgetName ?? null,
          });
        }
      });
      tx();
      console.log(`[db] Migrati ${events.length} eventi storico da history-log.json`);
    } catch (err) {
      console.error("[db] Migrazione history-log.json fallita:", err.message);
    }
  }
}
