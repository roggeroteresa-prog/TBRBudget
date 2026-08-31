import { useEffect, useRef, useState } from "react";
import { clearToken } from "../currentUser.js";
import { IconChevron } from "./Icons.jsx";

const ROLE_LABELS = { admin: "Amministratore", editor: "Collaboratore", viewer: "Visualizzatore" };

/**
 * Sostituisce il precedente UserSwitcher: con un vero login non ha più senso
 * "cambiare utente attivo" da un menu — ogni persona accede con le proprie
 * credenziali. Qui si mostra solo chi è autenticato, con l'opzione di uscire.
 */
export default function UserMenu({ user, onLogout }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function handler(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const initials = user?.name ? user.name.slice(0, 1).toUpperCase() : "U";

  return (
    <div className="user-switcher" ref={ref}>
      <button className="user-switcher-trigger" onClick={() => setOpen((o) => !o)}>
        <span className="user-avatar user-avatar--nav">{initials}</span>
        <span className="user-switcher-info">
          <strong>{user?.name || "—"}</strong>
          <span>{ROLE_LABELS[user?.role] || "—"}</span>
        </span>
        <IconChevron width={12} height={12} style={{ transform: "rotate(90deg)" }} />
      </button>

      {open && (
        <div className="user-switcher-panel">
          <div className="user-switcher-panel-title">{user?.email}</div>
          <button className="user-switcher-option" onClick={onLogout}>
            <span className="user-switcher-option-info">
              <strong>Esci</strong>
            </span>
          </button>
        </div>
      )}
    </div>
  );
}
