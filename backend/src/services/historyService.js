/**
 * Log storico delle azioni sui budget (creazione, configurazione, modifica
 * righe, cambio stato, eliminazione), con chi le ha compiute. Scritto da
 * budgetStore.js ad ogni mutazione, quindi copre automaticamente sia le
 * azioni da UI sia quelle eseguite dall'assistente in chat (stesso store
 * condiviso, nessuna logica duplicata). Persistito su SQLite (vedi db.js).
 */
import { randomUUID } from "crypto";
import { db } from "./db.js";

export const ACTION_TYPES = {
  CREATE: "CREATE",
  UPDATE: "UPDATE",
  DELETE: "DELETE",
  WRITEBACK: "WRITEBACK",
  STATUS: "STATUS",
  CONFIG: "CONFIG",
};

const MAX_EVENTS = 2000; // limite di sicurezza per non far crescere la tabella all'infinito in demo lunghe

const stmtInsert = db.prepare(`
  INSERT INTO history_events (id, timestamp, actionType, entity, budgetId, budgetName, user, detail)
  VALUES (@id,@timestamp,@actionType,@entity,@budgetId,@budgetName,@user,@detail)
`);
const stmtPruneOld = db.prepare(`
  DELETE FROM history_events WHERE id NOT IN (
    SELECT id FROM history_events ORDER BY timestamp DESC LIMIT ?
  )
`);
const stmtCount = db.prepare("SELECT COUNT(*) AS n FROM history_events");

/**
 * Registra un evento nello storico.
 * @param {{ actionType: string, entity: string, budgetId?: string, budgetName?: string, user: string, detail: string }} event
 */
export function logEvent(event) {
  stmtInsert.run({
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    actionType: event.actionType,
    entity: event.entity,
    budgetId: event.budgetId || null,
    budgetName: event.budgetName || null,
    user: event.user || "Utente Demo",
    detail: event.detail || "",
  });

  // Pruning solo occasionale (non ad ogni scrittura) per restare economico.
  if (stmtCount.get().n > MAX_EVENTS) {
    stmtPruneOld.run(MAX_EVENTS);
  }
}

export function listEvents({ search = "", actionType = "", page = 1, pageSize = 50 } = {}) {
  const conditions = [];
  const params = {};

  if (actionType) {
    conditions.push("actionType = @actionType");
    params.actionType = actionType;
  }
  if (search) {
    conditions.push(`(
      LOWER(COALESCE(budgetName, '')) LIKE @search OR
      LOWER(COALESCE(user, '')) LIKE @search OR
      LOWER(COALESCE(entity, '')) LIKE @search OR
      LOWER(COALESCE(detail, '')) LIKE @search
    )`);
    params.search = `%${search.toLowerCase()}%`;
  }
  const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const total = db.prepare(`SELECT COUNT(*) AS n FROM history_events ${whereClause}`).get(params).n;

  const offset = (page - 1) * pageSize;
  const events = db
    .prepare(`SELECT * FROM history_events ${whereClause} ORDER BY timestamp DESC LIMIT @pageSize OFFSET @offset`)
    .all({ ...params, pageSize, offset });

  return { events, total, page, pageSize, pages: Math.ceil(total / pageSize) };
}
