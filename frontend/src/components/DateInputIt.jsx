import { useEffect, useState } from "react";

function isoToDisplay(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return "";
  return `${d}/${m}/${y}`;
}

function displayToIso(display) {
  const match = display.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return null;
  const [, d, m, y] = match;
  return `${y}-${m}-${d}`;
}

/** Applica automaticamente le "/" mentre l'utente digita i soli numeri. */
function autoFormat(raw) {
  const digits = raw.replace(/\D/g, "").slice(0, 8);
  const parts = [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4, 8)].filter(Boolean);
  return parts.join("/");
}

/**
 * Campo data con formato italiano gg/mm/aaaa, indipendente dal locale del
 * browser (a differenza di <input type="date"> il cui formato dipende dalle
 * impostazioni di sistema). Il valore scambiato con il resto dell'app resta
 * in formato ISO (yyyy-mm-dd), come richiesto dal back end.
 */
export default function DateInputIt({ value, onChange, placeholder = "gg/mm/aaaa" }) {
  const [text, setText] = useState(isoToDisplay(value));

  useEffect(() => {
    setText(isoToDisplay(value));
  }, [value]);

  function handleChange(e) {
    const formatted = autoFormat(e.target.value);
    setText(formatted);
    const iso = displayToIso(formatted);
    if (iso) onChange(iso);
  }

  function handleBlur() {
    const iso = displayToIso(text);
    if (!iso) setText(isoToDisplay(value)); // ripristina se incompleta/non valida
  }

  return (
    <input
      type="text"
      inputMode="numeric"
      placeholder={placeholder}
      value={text}
      onChange={handleChange}
      onBlur={handleBlur}
      maxLength={10}
    />
  );
}
