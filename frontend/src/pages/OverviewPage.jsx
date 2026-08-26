import { useEffect, useState } from "react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { api } from "../budget/api.js";
import {
  IconRevenue, IconReport, IconManage, IconAssistant, IconClock, IconSettings, IconChevron,
} from "../components/Icons.jsx";

const QUICK_AREAS = [
  { key: "gestione", Icon: IconManage, label: "Gestione Budget" },
  { key: "ricavi", Icon: IconRevenue, label: "Budget Ricavi" },
  { key: "report", Icon: IconReport, label: "Report" },
];

const SYSTEM_AREAS = [
  { key: "storico", Icon: IconClock, label: "Storico Attività" },
  { key: "impostazioni", Icon: IconSettings, label: "Impostazioni", adminOnly: true },
];

const ACTION_LABELS = {
  CREATE: "Creazione", UPDATE: "Modifica", DELETE: "Eliminazione",
  WRITEBACK: "Scrittura valori", STATUS: "Cambio stato", CONFIG: "Configurazione",
};

function timeAgo(ts) {
  const diffMs = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "adesso";
  if (mins < 60) return `${mins} min fa`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} h fa`;
  return `${Math.floor(hours / 24)} g fa`;
}

export default function OverviewPage({ onNavigate, isAdmin = true }) {
  
  const [budgets, setBudgets] = useState([]);
  const [recentEvents, setRecentEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.listBudgets(), api.getHistory({ page: 1 })])
      .then(([b, h]) => {
        setBudgets(b);
        setRecentEvents((h.events || []).slice(0, 5));
      })
      .finally(() => setLoading(false));
  }, []);

  const total = budgets.length;
  const draft = budgets.filter((b) => b.status === "Bozza").length;
  const confirmed = budgets.filter((b) => b.status === "Confermato").length;
  const pct = (n) => (total ? Math.round((n / total) * 100) : 0);

  const donutData = [
    { name: "Bozza", value: draft, color: "#f59e0b" },
    { name: "Confermato", value: confirmed, color: "#22c55e" },
  ].filter((d) => d.value > 0);

  return (
    <div className="page">
      <h2>Overview</h2>
      <p className="page-subtitle">Panoramica generale dei budget nel sistema.</p>

      <span className="section-label">Navigazione rapida</span>
      <div className="overview-grid">
        <div className="overview-card">
          <div className="overview-card-title">Aree Budget</div>
          {QUICK_AREAS.map((a) => (
            <button key={a.key} className="overview-link" onClick={() => onNavigate(a.key)}>
              <span className="overview-link-icon"><a.Icon width={16} height={16} /></span>
              <span className="overview-link-label">{a.label}</span>
              <span className="overview-link-chevron"><IconChevron width={14} height={14} /></span>
            </button>
          ))}
        </div>

        <div className="overview-card">
          <div className="overview-card-title">Assistente</div>
          <button className="overview-link" onClick={() => onNavigate("assistente")}>
            <span className="overview-link-icon"><IconAssistant width={16} height={16} /></span>
            <span className="overview-link-label">Assistente Sales &amp; Budget</span>
            <span className="overview-link-chevron"><IconChevron width={14} height={14} /></span>
          </button>
          <p className="form-hint" style={{ padding: "6px 10px 2px" }}>
            Chiedi analisi sui dati, oppure crea/configura/modifica budget in linguaggio naturale.
          </p>
        </div>

        <div className="overview-card">
          <div className="overview-card-title">Sistema</div>
          {SYSTEM_AREAS.filter((a) => !a.adminOnly || isAdmin).map((a) => (
            <button key={a.key} className="overview-link" onClick={() => onNavigate(a.key)}>
              <span className="overview-link-icon"><a.Icon width={16} height={16} /></span>
              <span className="overview-link-label">{a.label}</span>
              <span className="overview-link-chevron"><IconChevron width={14} height={14} /></span>
            </button>
          ))}
        </div>
      </div>

      <span className="section-label">Budget per stato</span>
      <div className="overview-grid">
        <div className="overview-card overview-status-card">
          {loading ? (
            <div className="empty-state">Caricamento…</div>
          ) : total === 0 ? (
            <div className="empty-state">Nessun budget creato ancora.</div>
          ) : (
            <>
              <div className="status-row">
                <span className="status-dot status-dot--draft" />
                <span className="status-row-label">Bozza</span>
                <span className="status-row-count">{draft}</span>
                <div className="status-bar"><div className="status-bar-fill status-bar-fill--draft" style={{ width: `${pct(draft)}%` }} /></div>
                <span className="status-row-pct">{pct(draft)}%</span>
              </div>
              <div className="status-row">
                <span className="status-dot status-dot--confirmed" />
                <span className="status-row-label">Confermato</span>
                <span className="status-row-count">{confirmed}</span>
                <div className="status-bar"><div className="status-bar-fill status-bar-fill--confirmed" style={{ width: `${pct(confirmed)}%` }} /></div>
                <span className="status-row-pct">{pct(confirmed)}%</span>
              </div>
              <div className="status-total">Totale budget: <strong>{total}</strong></div>
            </>
          )}
        </div>

        {!loading && total > 0 && (
          <div className="overview-card">
            <div className="overview-card-title">Distribuzione stati</div>
            <ResponsiveContainer width="100%" height={160}>
              <PieChart>
                <Pie data={donutData} dataKey="value" nameKey="name" innerRadius="55%" outerRadius="80%" paddingAngle={3}>
                  {donutData.map((d, i) => <Cell key={i} fill={d.color} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <span className="section-label">Ultime attività</span>
      <div className="overview-card">
        {loading ? (
          <div className="empty-state">Caricamento…</div>
        ) : recentEvents.length === 0 ? (
          <div className="empty-state">Nessuna attività registrata ancora.</div>
        ) : (
          <>
            {recentEvents.map((e) => (
              <div className="overview-activity-row" key={e.id}>
                <span className={`action-badge action-badge--${e.actionType.toLowerCase()}`}>
                  {ACTION_LABELS[e.actionType] || e.actionType}
                </span>
                <span className="overview-activity-text">
                  <strong>{e.budgetName || "—"}</strong> · {e.user}
                </span>
                <span className="overview-activity-time">{timeAgo(e.timestamp)}</span>
              </div>
            ))}
            <button className="overview-link" style={{ borderTop: "1px solid #f0f0f0", marginTop: 4 }} onClick={() => onNavigate("storico")}>
              <span className="overview-link-label">Vedi tutto lo storico</span>
              <span className="overview-link-chevron"><IconChevron width={14} height={14} /></span>
            </button>
          </>
        )}
      </div>
    </div>
  );
}
