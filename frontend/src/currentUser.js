const STORAGE_KEY = "tbr_active_user_id";
const EVENT_NAME = "tbr:active-user-changed";

export function getActiveUserId() {
  try {
    return localStorage.getItem(STORAGE_KEY) || null;
  } catch {
    return null;
  }
}

export function setActiveUserId(id) {
  try {
    if (id) localStorage.setItem(STORAGE_KEY, id);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // localStorage non disponibile: l'utente attivo resta solo in memoria per questa sessione
  }
  window.dispatchEvent(new Event(EVENT_NAME));
}

export function onActiveUserChanged(callback) {
  window.addEventListener(EVENT_NAME, callback);
  return () => window.removeEventListener(EVENT_NAME, callback);
}

export const ACTIVE_USER_EVENT = EVENT_NAME;
