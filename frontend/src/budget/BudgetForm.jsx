import { useEffect, useMemo, useState } from "react";
import DateInputIt from "../components/DateInputIt.jsx";

const FACTOR_OPTIONS = [
  { value: "IMPORTO", label: "Importo" },
  { value: "QUANTITA", label: "Quantità" },
  { value: "PREZZO", label: "Prezzo" },
];
const FACTOR_VALUES = FACTOR_OPTIONS.map((f) => f.value);

function factorLabel(value) {
  return FACTOR_OPTIONS.find((f) => f.value === value)?.label || "—";
}

const EMPTY_FORM = {
  budgetName: "",
  budgetYear: new Date().getFullYear() + 1,
  currencyCode: "EUR",
  startDate: "",
  endDate: "",
  fixedFactor: "IMPORTO",
};

export default function BudgetForm({ open, onClose, onSave, initial }) {
  const isEdit = !!initial;
  const [values, setValues] = useState(initial || EMPTY_FORM);
  const [selectedFactors, setSelectedFactors] = useState(
    FACTOR_VALUES.filter((f) => f !== (initial?.fixedFactor || "IMPORTO"))
  );

  useEffect(() => {
    setValues(initial || EMPTY_FORM);
    if (!initial) setSelectedFactors(FACTOR_VALUES.filter((f) => f !== "IMPORTO"));
  }, [initial, open]);

  const inferredFactor = useMemo(() => {
    if (selectedFactors.length !== 2) return "";
    return FACTOR_VALUES.find((f) => !selectedFactors.includes(f)) || "";
  }, [selectedFactors]);

  useEffect(() => {
    if (isEdit) return;
    setValues((v) => ({ ...v, fixedFactor: inferredFactor }));
  }, [inferredFactor]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!open) return null;

  function toggleFactor(factor) {
    if (isEdit) return;
    setSelectedFactors((prev) => {
      if (prev.includes(factor)) return prev.filter((f) => f !== factor);
      if (prev.length >= 2) return prev;
      return [...prev, factor];
    });
  }

  const canSave =
    values.budgetName?.trim() &&
    values.budgetYear &&
    values.startDate &&
    values.endDate &&
    (isEdit || inferredFactor);

  return (
    <div className="modal-overlay">
      <div className="modal-box">
        <div className="modal-header">
          <h3>{isEdit ? "Modifica Budget" : "Nuovo Budget"}</h3>
          <button className="modal-close" onClick={onClose}>✖</button>
        </div>

        <div className="modal-body form-grid">
          <div className="form-field">
            <label>Company</label>
            <input value="TBR Budget Group" disabled />
          </div>

          <div className="form-field">
            <label>Nome Budget</label>
            <input
              value={values.budgetName}
              disabled={isEdit}
              onChange={(e) => setValues({ ...values, budgetName: e.target.value })}
              placeholder="es. Budget Export 2027"
            />
          </div>

          <div className="form-field">
            <label>Anno Budget</label>
            <input
              type="number"
              value={values.budgetYear}
              onChange={(e) => setValues({ ...values, budgetYear: e.target.value })}
            />
          </div>

          <div className="form-field">
            <label>Valuta</label>
            <input
              value={values.currencyCode}
              onChange={(e) => setValues({ ...values, currencyCode: e.target.value.toUpperCase() })}
            />
          </div>

          <div className="form-field">
            <label>Data inizio periodo consuntivo</label>
            <DateInputIt value={values.startDate} onChange={(iso) => setValues({ ...values, startDate: iso })} />
          </div>

          <div className="form-field">
            <label>Data fine periodo consuntivo</label>
            <DateInputIt value={values.endDate} onChange={(iso) => setValues({ ...values, endDate: iso })} />
          </div>

          <div className="form-field form-field--wide">
            <label>{isEdit ? "Fattore Fisso" : "Valori editabili (scegline 2 — il terzo sarà il Fattore Fisso)"}</label>
            {isEdit ? (
              <input value={factorLabel(values.fixedFactor)} disabled />
            ) : (
              <div className="factor-buttons">
                {FACTOR_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    className={`btn btn-sm ${selectedFactors.includes(opt.value) ? "btn-primary" : "btn-ghost"}`}
                    onClick={() => toggleFactor(opt.value)}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
            {!isEdit && inferredFactor && (
              <small className="form-hint">Fattore Fisso: {factorLabel(inferredFactor)}</small>
            )}
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Annulla</button>
          <button className="btn btn-primary" disabled={!canSave} onClick={() => onSave(values)}>
            Salva Budget
          </button>
        </div>
      </div>
    </div>
  );
}
