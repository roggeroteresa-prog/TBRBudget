import { useEffect, useState } from "react";
import Sidebar from "./components/Sidebar.jsx";
import ChatWindow from "./components/ChatWindow.jsx";
import UserSwitcher from "./components/UserSwitcher.jsx";
import OverviewPage from "./pages/OverviewPage.jsx";
import ReportPage from "./pages/ReportPage.jsx";
import HistoryPage from "./pages/HistoryPage.jsx";
import SettingsPage from "./pages/SettingsPage.jsx";
import BudgetListPage from "./budget/BudgetListPage.jsx";
import RevenueBudgetPage from "./budget/RevenueBudgetPage.jsx";
import BudgetConfigPage from "./budget/BudgetConfigPage.jsx";
import { api } from "./budget/api.js";
import { getActiveUserId, onActiveUserChanged } from "./currentUser.js";
import "./App.css";
import "./budget/budget.css";

export default function App() {
  const [activePage, setActivePage] = useState("overview");
  const [selectedBudgetId, setSelectedBudgetId] = useState(null);
  const [configBudgetId, setConfigBudgetId] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);

  async function refreshCurrentUser() {
    const id = getActiveUserId();
    if (!id) return setCurrentUser(null);
    try {
      const users = await api.listUsers();
      setCurrentUser(users.find((u) => u.id === id) || null);
    } catch {
      setCurrentUser(null);
    }
  }

  useEffect(() => {
    refreshCurrentUser();
    return onActiveUserChanged(refreshCurrentUser);
  }, []);

  const isAdmin = !currentUser || currentUser.role === "admin";

  function openBudgetInRicavi(budget) {
    setSelectedBudgetId(budget.id);
    setActivePage("ricavi");
  }

  function openBudgetConfig(budget) {
    setConfigBudgetId(budget.id);
    setActivePage("config");
  }

  function navigate(page) {
    if (page === "impostazioni" && !isAdmin) return; // accesso riservato agli amministratori
    setActivePage(page);
  }

  return (
    <div className="shell-root">
      <header className="top-navbar">
        <div className="top-navbar-brand">
          <div className="brand-mark">T</div>
          <span className="brand-wordmark">TBR</span>
        </div>
        <div className="top-navbar-title">Budget App</div>
        <UserSwitcher onUserChange={setCurrentUser} />
      </header>

      <div className="shell-body">
        <Sidebar active={activePage === "config" ? "gestione" : activePage} onNavigate={navigate} isAdmin={isAdmin} />

        <main className="main-content">
          {activePage === "overview" && <OverviewPage onNavigate={navigate} isAdmin={isAdmin} />}
          {activePage === "gestione" && (
            <BudgetListPage onOpenBudget={openBudgetInRicavi} onConfigureBudget={openBudgetConfig} currentUser={currentUser} />
          )}
          {activePage === "config" && (
            <BudgetConfigPage
              budgetId={configBudgetId}
              currentUser={currentUser}
              onDone={() => {
                setSelectedBudgetId(configBudgetId);
                setActivePage("ricavi");
              }}
              onCancel={() => setActivePage("gestione")}
            />
          )}
          {activePage === "ricavi" && (
            <RevenueBudgetPage
              selectedBudgetId={selectedBudgetId}
              onSelectBudget={setSelectedBudgetId}
              currentUser={currentUser}
            />
          )}
          {activePage === "report" && <ReportPage />}
          {activePage === "storico" && <HistoryPage />}
          {activePage === "impostazioni" && isAdmin && <SettingsPage />}

          {/* ChatWindow resta sempre montato (solo nascosto via CSS quando non attivo):
              se venisse smontato e rimontato ad ogni cambio pagina, sessionId e
              cronologia messaggi andrebbero persi ogni volta. */}
          <div className="page page--chat" style={{ display: activePage === "assistente" ? "flex" : "none" }}>
            <ChatWindow />
          </div>
        </main>
      </div>
    </div>
  );
}
