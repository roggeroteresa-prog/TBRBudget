/**
 * Gestione della sessione autenticata: il token JWT emesso al login viene
 * conservato in localStorage e allegato come header Authorization ad ogni
 * chiamata API (vedi budget/api.js e components/ChatWindow.jsx). Sostituisce
 * il precedente selettore utente basato sull'header x-user-id (falsificabile
 * da chiunque) con un vero login verificato dal back end.
 */
const TOKEN_KEY = "tbr_auth_token";
const EVENT_NAME = "tbr:auth-changed";

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY) || null;
  } catch {
    return null;
  }
}

export function setToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // localStorage non disponibile: il token resta solo in memoria per questa sessione
  }
  window.dispatchEvent(new Event(EVENT_NAME));
}

export function clearToken() {
  setToken(null);
}

export function onAuthChanged(callback) {
  window.addEventListener(EVENT_NAME, callback);
  return () => window.removeEventListener(EVENT_NAME, callback);
}
