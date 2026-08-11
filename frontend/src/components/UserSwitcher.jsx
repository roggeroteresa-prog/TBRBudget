import { useEffect, useRef, useState } from "react";
import { api } from "../budget/api.js";
import { getActiveUserId, setActiveUserId } from "../currentUser.js";
import { IconChevron } from "./Icons.jsx";

const ROLE_LABELS = { admin: "Amministratore", editor: "Collaboratore", viewer: "Visualizzatore" };

export default function UserSwitcher({ onUserChange }) {
  const [users, setUsers] = useState([]);
  const [activeId, setActiveId] = useState(getActiveUserId());
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    api.listUsers().then((list) => {
      setUsers(list);
      if (!activeId && list.length) {
        const admin = list.find((u) => u.role === "admin") || list[0];
        setActiveId(admin.id);
        setActiveUserId(admin.id);
      }
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    function handler(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const activeUser = users.find((u) => u.id === activeId);

  function selectUser(id) {
    setActiveId(id);
    setActiveUserId(id);
    setOpen(false);
    onUserChange?.(users.find((u) => u.id === id));
  }

  const initials = activeUser ? activeUser.name.slice(0, 1).toUpperCase() : "U";

  return (
    <div className="user-switcher" ref={ref}>
      <button className="user-switcher-trigger" onClick={() => setOpen((o) => !o)}>
        <span className="user-avatar user-avatar--nav">{initials}</span>
        <span className="user-switcher-info">
          <strong>{activeUser?.name || "Utente Demo"}</strong>
          <span>{ROLE_LABELS[activeUser?.role] || "—"}</span>
        </span>
        <IconChevron width={12} height={12} style={{ transform: "rotate(90deg)" }} />
      </button>

      {open && (
        <div className="user-switcher-panel">
          <div className="user-switcher-panel-title">Cambia utente attivo</div>
          {users.map((u) => (
            <button
              key={u.id}
              className={`user-switcher-option ${u.id === activeId ? "active" : ""}`}
              onClick={() => selectUser(u.id)}
            >
              <span className="user-avatar user-avatar--sm">{u.name.slice(0, 1).toUpperCase()}</span>
              <span className="user-switcher-option-info">
                <strong>{u.name}</strong>
                <span>{ROLE_LABELS[u.role]}</span>
              </span>
            </button>
          ))}
          <div className="user-switcher-hint">Nessun vero login: selettore dimostrativo per i permessi.</div>
        </div>
      )}
    </div>
  );
}
