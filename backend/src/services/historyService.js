/**
 * Log storico delle azioni sui budget (creazione, configurazione, modifica
 * righe, cambio stato, eliminazione), con chi le ha compiute. Scritto da
 * budgetStore.js ad ogni mutazione, quindi copre automaticamente sia le
 * azioni da UI sia quelle eseguite dall'assistente in chat (stesso store
 * condiviso, nessuna logica duplicata).
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { randomUUID } from "crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOG_PATH = path.join(__dirname, "..", "data", "history-log.json");

export const ACTION_TYPES = {
  CREATE: "CREATE",
  UPDATE: "UPDATE",
  DELETE: "DELETE",
  WRITEBACK: "WRITEBACK",
  STATUS: "STATUS",
  CONFIG: "CONFIG",
};

function readLog() {
  if (!fs.existsSync(LOG_PATH)) return [];
  try {
    return JSON.parse(fs.readFileSync(LOG_PATH, "utf-8"));
  } catch {
    return [];
  }
}

function writeLog(events) {
  fs.writeFileSync(LOG_PATH, JSON.stringify(events, null, 2), "utf-8");
}

/**
 * Registra un evento nello storico.
 * @param {{ actionType: string, entity: string, budgetId?: string, budgetName?: string, user: string, detail: string }} event
 */
export function logEvent(event) {
  const events = readLog();
  events.unshift({
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    actionType: event.actionType,
    entity: event.entity,
    budgetId: event.budgetId || null,
    budgetName: event.budgetName || null,
    user: event.user || "Utente Demo",
    detail: event.detail || "",
  });
  // Limite di sicurezza per non far crescere il file all'infinito in demo lunghe
  writeLog(events.slice(0, 2000));
}

export function listEvents({ search = "", actionType = "", page = 1, pageSize = 50 } = {}) {
  let events = readLog();

  if (actionType) {
    events = events.filter((e) => e.actionType === actionType);
  }
  if (search) {
    const s = search.toLowerCase();
    events = events.filter(
      (e) =>
        (e.budgetName || "").toLowerCase().includes(s) ||
        (e.user || "").toLowerCase().includes(s) ||
        (e.entity || "").toLowerCase().includes(s) ||
        (e.detail || "").toLowerCase().includes(s)
    );
  }

  const total = events.length;
  const start = (page - 1) * pageSize;
  const pageRows = events.slice(start, start + pageSize);

  return { events: pageRows, total, page, pageSize, pages: Math.ceil(total / pageSize) };
}
