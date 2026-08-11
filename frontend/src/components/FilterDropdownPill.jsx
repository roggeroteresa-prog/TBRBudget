import { useEffect, useRef, useState } from "react";
import { IconChevron } from "./Icons.jsx";

export default function FilterDropdownPill({ label, values, selected, onChange }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef(null);

  useEffect(() => {
    function handler(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filtered = search ? values.filter((v) => v.toLowerCase().includes(search.toLowerCase())) : values;

  function toggle(v) {
    if (selected.includes(v)) onChange(selected.filter((x) => x !== v));
    else onChange([...selected, v]);
  }

  const valueLabel =
    selected.length === 0 ? "— tutti —" : selected.length === 1 ? selected[0] : `${selected.length} selezionati`;

  return (
    <div className={`filter-pill ${open ? "open" : ""}`} ref={ref}>
      <label>{label}</label>
      <div className="filter-pill-head" onClick={() => setOpen((o) => !o)}>
        <span className="filter-pill-value">{valueLabel}</span>
        <IconChevron width={12} height={12} className="filter-pill-caret" />
      </div>

      {open && (
        <div className="filter-pill-panel">
          <input
            type="text"
            className="filter-pill-search"
            placeholder="Cerca…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="filter-pill-actions">
            <button onClick={() => onChange(values)}>Tutti</button>
            <button onClick={() => onChange([])}>Pulisci</button>
          </div>
          <div className="filter-pill-list">
            {filtered.map((v) => (
              <label key={v} className="filter-pill-option">
                <input type="checkbox" checked={selected.includes(v)} onChange={() => toggle(v)} />
                {v}
              </label>
            ))}
            {filtered.length === 0 && <div className="filter-pill-empty">Nessun risultato</div>}
          </div>
        </div>
      )}
    </div>
  );
}
