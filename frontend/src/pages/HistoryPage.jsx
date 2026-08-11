import { useEffect, useState } from "react";
import { api } from "../budget/api.js";
import { IconSearch } from "../components/Icons.jsx";

const ACTION_CFG = {
  CREATE: { label: "Creazione", className: "action-badge--create" },
  UPDATE: { label: "Modifica", className: "action-badge--update" },
  DELETE: { label: "Eliminazione", className: "action-badge--delete" },
  WRITEBACK: { label: "Scrittura valori", className: "action-badge--writeback" },
  STATUS: { label: "Cambio stato", className: "action-badge--status" },
  CONFIG: { label: "Configurazione", className: "action-badge--config" },
};

function fmtTs(ts) {
  if (!ts) return "—";
  const d = new Date(ts);
  if (isNaN(d.getTime())) return ts;
  return d.toLocaleString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function HistoryPage() {
  const [data, setData] = useState({ events: [], total: 0, page: 1, pages: 1 });
  const [search, setSearch] = useState("");
  const [actionType, setActionType] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.getHistory({ search, actionType, page }).then((d) => {
      setData(d);
      setLoading(false);
    });
  }, [search, actionType, page]);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h2>Storico Attività</h2>
          <p className="page-subtitle">Log delle operazioni: creazione, configurazione, modifica valori, eliminazione.</p>
        </div>
      </div>

      <div className="search-bar">
        <IconSearch width={15} height={15} className="search-bar-icon" />
        <input
          type="text"
          placeholder="Cerca per budget, utente, dettaglio…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
        <select
          value={actionType}
          onChange={(e) => {
            setActionType(e.target.value);
            setPage(1);
          }}
          style={{ border: "none", background: "transparent", fontSize: "0.85rem", padding: "6px" }}
        >
          <option value="">Tutte le azioni</option>
          {Object.entries(ACTION_CFG).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>
        <span className="search-count">{data.total} eventi</span>
      </div>

      {loading ? (
        <div className="empty-state">Caricamento…</div>
      ) : data.events.length === 0 ? (
        <div className="empty-state">Nessun evento registrato ancora.</div>
      ) : (
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Data / Ora</th>
                <th>Azione</th>
                <th>Entità</th>
                <th>Budget</th>
                <th>Utente</th>
                <th>Dettaglio</th>
              </tr>
            </thead>
            <tbody>
              {data.events.map((e) => {
                const cfg = ACTION_CFG[e.actionType] || { label: e.actionType, className: "" };
                return (
                  <tr key={e.id}>
                    <td style={{ whiteSpace: "nowrap", fontSize: "0.8rem", color: "#777" }}>{fmtTs(e.timestamp)}</td>
                    <td><span className={`action-badge ${cfg.className}`}>{cfg.label}</span></td>
                    <td>{e.entity}</td>
                    <td className="budget-info-accent" style={{ fontWeight: 700 }}>{e.budgetName || "—"}</td>
                    <td>{e.user}</td>
                    <td style={{ maxWidth: 340, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={e.detail}>
                      {e.detail}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {data.pages > 1 && (
        <div className="pagination-bar">
          <span>{data.total} eventi · pagina {data.page}/{data.pages}</span>
          <button className="btn btn-ghost btn-sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>‹ Precedente</button>
          <button className="btn btn-ghost btn-sm" disabled={page >= data.pages} onClick={() => setPage((p) => p + 1)}>Successiva ›</button>
        </div>
      )}
    </div>
  );
}
