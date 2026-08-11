import { IconOverview, IconManage, IconRevenue, IconReport, IconAssistant, IconClock, IconSettings } from "./Icons.jsx";

const GENERAL_ITEMS = [
  { key: "overview", label: "Overview", Icon: IconOverview },
  { key: "gestione", label: "Gestione Budget", Icon: IconManage },
  { key: "ricavi", label: "Budget Ricavi", Icon: IconRevenue },
];

const ANALYSIS_ITEMS = [
  { key: "report", label: "Report", Icon: IconReport },
  { key: "assistente", label: "Assistente", Icon: IconAssistant },
];

const SYSTEM_ITEMS = [
  { key: "storico", label: "Storico Attività", Icon: IconClock },
  { key: "impostazioni", label: "Impostazioni", Icon: IconSettings, adminOnly: true },
];

function NavButton({ item, active, onNavigate }) {
  const { Icon } = item;
  return (
    <button
      className={`nav-item ${active === item.key ? "active" : ""}`}
      onClick={() => onNavigate(item.key)}
    >
      <span className="nav-icon"><Icon width={16} height={16} /></span>
      <span className="nav-label">{item.label}</span>
    </button>
  );
}

export default function Sidebar({ active, onNavigate, isAdmin = true }) {
  return (
    <aside className="sidebar">
      <span className="nav-section">Generale</span>
      {GENERAL_ITEMS.map((item) => (
        <NavButton key={item.key} item={item} active={active} onNavigate={onNavigate} />
      ))}

      <span className="nav-section">Analisi</span>
      {ANALYSIS_ITEMS.map((item) => (
        <NavButton key={item.key} item={item} active={active} onNavigate={onNavigate} />
      ))}

      <span className="nav-section">Sistema</span>
      {SYSTEM_ITEMS.filter((item) => !item.adminOnly || isAdmin).map((item) => (
        <NavButton key={item.key} item={item} active={active} onNavigate={onNavigate} />
      ))}

      <div className="sidebar-footer">
        <span className="sidebar-footer-dot" /> Progetto Finale — Master AI
      </div>
    </aside>
  );
}
