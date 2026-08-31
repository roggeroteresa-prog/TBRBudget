import { useEffect, useState } from "react";
import { api } from "../budget/api.js";
import ConfirmModal from "../budget/ConfirmModal.jsx";
import { IconEdit, IconTrash, IconPlus } from "../components/Icons.jsx";

const ROLE_OPTIONS = [
  { value: "admin", label: "Amministratore", hint: "Accesso completo, incluse le Impostazioni" },
  { value: "editor", label: "Collaboratore", hint: "Può vedere e modificare i budget assegnati" },
  { value: "viewer", label: "Visualizzatore", hint: "Può solo vedere i budget assegnati" },
];

const EMPTY_FORM = { name: "", email: "", password: "", role: "editor", allowedBudgetIds: [] };

function UserForm({ open, initial, budgets, onClose, onSave }) {
  const [values, setValues] = useState(initial || EMPTY_FORM);

  useEffect(() => {
    setValues(initial || EMPTY_FORM);
  }, [initial, open]);

  if (!open) return null;
  const isAdmin = values.role === "admin";

  function toggleBudget(id) {
    setValues((v) => {
      const set = new Set(v.allowedBudgetIds || []);
      if (set.has(id)) set.delete(id);
      else set.add(id);
      return { ...v, allowedBudgetIds: Array.from(set) };
    });
  }

  const canSave =
    values.name?.trim() &&
    values.email?.trim() &&
    values.role &&
    (initial ? !values.password || values.password.length >= 8 : (values.password || "").length >= 8);

  return (
    <div className="modal-overlay">
      <div className="modal-box">
        <div className="modal-header">
          <h3>{initial ? "Modifica utente" : "Nuovo utente"}</h3>
          <button className="modal-close" onClick={onClose}>✖</button>
        </div>
        <div className="modal-body form-grid">
          <div className="form-field">
            <label>Nome</label>
            <input value={values.name} onChange={(e) => setValues({ ...values, name: e.target.value })} />
          </div>
          <div className="form-field">
            <label>Email</label>
            <input value={values.email} onChange={(e) => setValues({ ...values, email: e.target.value })} />
          </div>
          <div className="form-field">
            <label>Password{initial ? " (lascia vuoto per non cambiarla)" : ""}</label>
            <input
              type="password"
              value={values.password}
              onChange={(e) => setValues({ ...values, password: e.target.value })}
              placeholder={initial ? "••••••••" : "Almeno 8 caratteri"}
              autoComplete="new-password"
            />
          </div>
          <div className="form-field form-field--wide">
            <label>Ruolo</label>
            <div className="factor-buttons">
              {ROLE_OPTIONS.map((r) => (
                <button
                  key={r.value}
                  type="button"
                  className={`btn btn-sm ${values.role === r.value ? "btn-primary" : "btn-ghost"}`}
                  onClick={() => setValues({ ...values, role: r.value })}
                >
                  {r.label}
                </button>
              ))}
            </div>
            <small className="form-hint">{ROLE_OPTIONS.find((r) => r.value === values.role)?.hint}</small>
          </div>

          {!isAdmin && (
            <div className="form-field form-field--wide">
              <label>Budget visibili</label>
              <div className="user-budget-checklist">
                {budgets.length === 0 && <p className="form-hint">Nessun budget disponibile ancora.</p>}
                {budgets.map((b) => (
                  <label key={b.id} className="filter-pill-option">
                    <input
                      type="checkbox"
                      checked={(values.allowedBudgetIds || []).includes(b.id)}
                      onChange={() => toggleBudget(b.id)}
                    />
                    {b.budgetName} ({b.budgetYear})
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Annulla</button>
          <button className="btn btn-primary" disabled={!canSave} onClick={() => onSave(values)}>Salva</button>
        </div>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const [users, setUsers] = useState([]);
  const [budgets, setBudgets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  async function load() {
    setLoading(true);
    const [u, b] = await Promise.all([api.listUsers(), api.listBudgets()]);
    setUsers(u);
    setBudgets(b);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleSave(values) {
    try {
      if (editing) await api.updateUser(editing.id, values);
      else await api.createUser(values);
      setFormOpen(false);
      setEditing(null);
      load();
    } catch (err) {
      alert(`Errore: ${err.message}`);
    }
  }

  async function handleDeleteConfirm() {
    try {
      await api.deleteUser(deleteTarget.id);
      setDeleteTarget(null);
      load();
    } catch (err) {
      alert(`Errore: ${err.message}`);
    }
  }

  const roleLabel = (r) => ROLE_OPTIONS.find((o) => o.value === r)?.label || r;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h2>Impostazioni</h2>
          <p className="page-subtitle">Utenti, ruoli e visibilità dei budget.</p>
        </div>
        <button className="btn btn-primary" onClick={() => { setEditing(null); setFormOpen(true); }}>
          <IconPlus width={14} height={14} /> Nuovo utente
        </button>
      </div>

      {loading ? (
        <div className="empty-state">Caricamento…</div>
      ) : (
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Nome</th>
                <th>Email</th>
                <th>Ruolo</th>
                <th>Budget visibili</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td style={{ fontWeight: 700 }}>{u.name}</td>
                  <td>{u.email}</td>
                  <td><span className={`role-badge role-badge--${u.role}`}>{roleLabel(u.role)}</span></td>
                  <td>
                    {u.role === "admin" ? (
                      <span style={{ color: "#999" }}>Tutti</span>
                    ) : (u.allowedBudgetIds || []).length === 0 ? (
                      <span style={{ color: "#c8102e" }}>Nessuno</span>
                    ) : (
                      `${u.allowedBudgetIds.length} budget`
                    )}
                  </td>
                  <td>
                    <div className="row-actions">
                      <button className="btn-icon-only" onClick={() => { setEditing(u); setFormOpen(true); }}>
                        <IconEdit width={15} height={15} />
                      </button>
                      <button className="btn-icon-only" onClick={() => setDeleteTarget(u)}>
                        <IconTrash width={15} height={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <UserForm
        open={formOpen}
        initial={editing}
        budgets={budgets}
        onClose={() => { setFormOpen(false); setEditing(null); }}
        onSave={handleSave}
      />

      <ConfirmModal
        open={!!deleteTarget}
        title="Elimina utente"
        message={`Eliminare l'utente "${deleteTarget?.name}"?`}
        confirmLabel="Elimina"
        danger
        onConfirm={handleDeleteConfirm}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
}
