import { useEffect, useState } from "react";
import { api } from "./api.js";
import BudgetTable from "./BudgetTable.jsx";
import BudgetForm from "./BudgetForm.jsx";
import ConfirmModal from "./ConfirmModal.jsx";
import { IconSearch } from "../components/Icons.jsx";

export default function BudgetListPage({ onOpenBudget, onConfigureBudget, currentUser }) {
  const isViewer = currentUser?.role === "viewer";
  const [budgets, setBudgets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  const [deleteTarget, setDeleteTarget] = useState(null);
  const [statusTarget, setStatusTarget] = useState(null);

  async function load() {
    setLoading(true);
    try {
      const data = await api.listBudgets();
      setBudgets(data);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleSave(values) {
    try {
      if (editing) {
        await api.updateBudget(editing.id, values);
        setFormOpen(false);
        setEditing(null);
        load();
      } else {
        const created = await api.createBudget(values);
        setFormOpen(false);
        setEditing(null);
        load();
        onConfigureBudget?.(created);
      }
    } catch (err) {
      alert(`Errore: ${err.message}`);
    }
  }

  async function handleDeleteConfirm() {
    try {
      await api.deleteBudget(deleteTarget.id);
      setDeleteTarget(null);
      load();
    } catch (err) {
      alert(`Errore: ${err.message}`);
    }
  }

  async function handleStatusConfirm() {
    const newStatus = statusTarget.status === "Bozza" ? "Confermato" : "Bozza";
    try {
      await api.setBudgetStatus(statusTarget.id, newStatus);
      setStatusTarget(null);
      load();
    } catch (err) {
      alert(`Errore: ${err.message}`);
    }
  }

  const filteredBudgets = budgets.filter((b) =>
    b.budgetName.toLowerCase().includes(search.trim().toLowerCase())
  );

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h2>Gestione Budget</h2>
          <p className="page-subtitle">Crea, modifica e gestisci i cicli di budget aziendali</p>
        </div>
        {!isViewer && (
          <button
            className="btn btn-primary"
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            + Nuovo Budget
          </button>
        )}
      </div>

      <div className="search-bar">
        <IconSearch width={15} height={15} className="search-bar-icon" />
        <input
          type="text"
          placeholder="Cerca budget…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <span className="search-count">{filteredBudgets.length} budget</span>
      </div>

      {loading && <div className="empty-state">Caricamento…</div>}
      {error && <div className="error-banner">{error}</div>}

      {!loading && !error && (
        <BudgetTable
          budgets={filteredBudgets}
          onOpen={onOpenBudget}
          onEdit={(b) => {
            setEditing(b);
            setFormOpen(true);
          }}
          onStatus={setStatusTarget}
          onDelete={setDeleteTarget}
          onConfig={onConfigureBudget}
          readOnly={isViewer}
        />
      )}

      <BudgetForm
        open={formOpen}
        initial={editing}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
        }}
        onSave={handleSave}
      />

      <ConfirmModal
        open={!!deleteTarget}
        title="Elimina budget"
        message={`Eliminare definitivamente "${deleteTarget?.budgetName}" e tutte le sue righe?`}
        confirmLabel="Elimina"
        danger
        onConfirm={handleDeleteConfirm}
        onClose={() => setDeleteTarget(null)}
      />

      <ConfirmModal
        open={!!statusTarget}
        title="Cambia stato"
        message={
          statusTarget?.status === "Bozza"
            ? `Confermare il budget "${statusTarget?.budgetName}"?`
            : `Riportare "${statusTarget?.budgetName}" in stato Bozza?`
        }
        confirmLabel="Conferma"
        onConfirm={handleStatusConfirm}
        onClose={() => setStatusTarget(null)}
      />
    </div>
  );
}
