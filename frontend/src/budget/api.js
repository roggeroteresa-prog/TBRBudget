import { getToken, clearToken } from "../currentUser.js";

// In sviluppo locale "/api" viene inoltrato al back end dal proxy di Vite
// (vedi vite.config.js). In produzione (es. GitHub Pages, hosting statico)
// non esiste un proxy: va indicato l'URL completo del back end pubblicato,
// impostando VITE_API_BASE_URL in fase di build.
const BASE = import.meta.env.VITE_API_BASE_URL || "/api";

async function request(path, options = {}) {
  const token = getToken();
  const res = await fetch(`${BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...options,
  });

  if (res.status === 401) {
    // Token mancante/scaduto/non valido: la sessione non è più utilizzabile,
    // si torna alla schermata di login.
    clearToken();
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Errore ${res.status}`);
  }
  return data;
}

export const api = {
  // ─── Autenticazione ────────────────────────────────────────────────
  login: (email, password) =>
    request("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),
  me: () => request("/auth/me"),

  getDimensions: () => request("/dimensions"),

  listBudgets: () => request("/budgets"),
  getBudget: (id) => request(`/budgets/${id}`),
  createBudget: (payload) => request("/budgets", { method: "POST", body: JSON.stringify(payload) }),
  updateBudget: (id, payload) =>
    request(`/budgets/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
  setBudgetStatus: (id, status) =>
    request(`/budgets/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }) }),
  deleteBudget: (id) => request(`/budgets/${id}`, { method: "DELETE" }),

  listLines: (budgetId) => request(`/budgets/${budgetId}/lines`),
  addLines: (budgetId, payload) =>
    request(`/budgets/${budgetId}/lines`, { method: "POST", body: JSON.stringify(payload) }),
  upsertLines: (budgetId, payload) =>
    request(`/budgets/${budgetId}/lines`, { method: "PUT", body: JSON.stringify(payload) }),
  deleteLine: (budgetId, lineId) =>
    request(`/budgets/${budgetId}/lines/${lineId}`, { method: "DELETE" }),

  getPivot: (budgetId) => request(`/budgets/${budgetId}/pivot`),

  getCurrencyAnalysis: (budgetId) => request(`/budgets/${budgetId}/currency-analysis`),
  generateBaseBudget: (budgetId, payload) =>
    request(`/budgets/${budgetId}/generate-base-budget`, { method: "POST", body: JSON.stringify(payload) }),
  getConsolidato: (budgetId, payload) =>
    request(`/budgets/${budgetId}/consolidato`, { method: "POST", body: JSON.stringify(payload) }),

  suggest: (payload) => request("/budgets/suggest", { method: "POST", body: JSON.stringify(payload) }),

  // ─── Utenti (ruoli e visibilità budget) ───────────────────────────
  listUsers: () => request("/users"),
  createUser: (payload) => request("/users", { method: "POST", body: JSON.stringify(payload) }),
  updateUser: (id, payload) => request(`/users/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
  deleteUser: (id) => request(`/users/${id}`, { method: "DELETE" }),

  // ─── Storico attività ──────────────────────────────────────────────
  getHistory: ({ search = "", actionType = "", page = 1 } = {}) =>
    request(`/history?search=${encodeURIComponent(search)}&actionType=${encodeURIComponent(actionType)}&page=${page}`),
};
