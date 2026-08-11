import { useEffect, useMemo, useState } from "react";
import { api } from "./api.js";
import { IconBot } from "../components/Icons.jsx";

const MONTH_LABELS = ["Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic"];
const DIM_ORDER = ["macroarea", "country", "customer", "category", "product"];
const DIM_LABELS = {
  macroarea: "Macroarea",
  country: "Paese",
  customer: "Cliente",
  category: "Categoria Prodotto",
  product: "Prodotto",
};

const EMPTY_MONTHLY = () => Object.fromEntries(Array.from({ length: 12 }, (_, i) => [i + 1, ""]));

export default function AddRowModal({ open, onClose, onSaved, budgetId, currencyCode, activeDims, dimensionsData }) {
  const [selections, setSelections] = useState({});
  const [distribution, setDistribution] = useState("monthly");
  const [amount, setAmount] = useState("");
  const [quantity, setQuantity] = useState("");
  const [monthlyAmounts, setMonthlyAmounts] = useState(EMPTY_MONTHLY());
  const [monthlyQuantities, setMonthlyQuantities] = useState(EMPTY_MONTHLY());

  const [suggesting, setSuggesting] = useState(false);
  const [rationale, setRationale] = useState("");
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const orderedDims = DIM_ORDER.filter((k) => activeDims.includes(k));
  const isMonthly = distribution === "monthly";
  const canPickDims = orderedDims.length > 0 && orderedDims.every((k) => !!selections[k]);
  const canSuggest = activeDims.includes("country") && activeDims.includes("product") && selections.country && selections.product;

  const totals = useMemo(() => {
    if (isMonthly) {
      const totalAmt = Object.values(monthlyAmounts).reduce((s, v) => s + (parseFloat(v) || 0), 0);
      const totalQty = Object.values(monthlyQuantities).reduce((s, v) => s + (parseFloat(v) || 0), 0);
      return { totalAmt, totalQty };
    }
    return { totalAmt: parseFloat(amount) || 0, totalQty: parseFloat(quantity) || 0 };
  }, [isMonthly, monthlyAmounts, monthlyQuantities, amount, quantity]);

  useEffect(() => {
    if (open) reset();
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!open) return null;

  function reset() {
    setSelections({});
    setDistribution("monthly");
    setAmount("");
    setQuantity("");
    setMonthlyAmounts(EMPTY_MONTHLY());
    setMonthlyQuantities(EMPTY_MONTHLY());
    setRationale("");
    setErrorMsg("");
  }

  function handleClose() {
    reset();
    onClose();
  }

  function optionsFor(key) {
    const { options, filters } = dimensionsData;
    if (key === "macroarea") return options.macroarea;
    if (key === "country") {
      if (activeDims.includes("macroarea") && selections.macroarea) {
        return filters.macroareaToCountries[selections.macroarea] || [];
      }
      return options.country;
    }
    if (key === "customer") {
      if (activeDims.includes("country") && selections.country) {
        return filters.countryToCustomers[selections.country] || [];
      }
      return options.customer;
    }
    if (key === "category") return options.category;
    if (key === "product") {
      const all = options.product;
      if (activeDims.includes("category") && selections.category) {
        return all.filter((p) => p.category === selections.category).map((p) => p.code);
      }
      return all.map((p) => p.code);
    }
    return [];
  }

  function handleSelect(key, value) {
    setSelections((prev) => {
      const next = { ...prev, [key]: value };
      // Resetta le dimensioni "figlie" quando cambia una dimensione "genitore"
      if (key === "macroarea") next.country = "";
      if (key === "country") next.customer = "";
      if (key === "category") next.product = "";
      return next;
    });
  }

  async function handleSuggest() {
    if (!canSuggest) return;
    setSuggesting(true);
    setErrorMsg("");
    try {
      const suggestion = await api.suggest({ country: selections.country, product: selections.product });
      if (suggestion.months?.length) {
        const nextAmounts = EMPTY_MONTHLY();
        const nextQuantities = EMPTY_MONTHLY();
        suggestion.months.forEach((m) => {
          nextAmounts[m] = String(Math.round(suggestion.monthlyAmount));
          nextQuantities[m] = String(Math.round(suggestion.monthlyQuantity));
        });
        setDistribution("monthly");
        setMonthlyAmounts(nextAmounts);
        setMonthlyQuantities(nextQuantities);
      }
      setRationale(suggestion.rationale || "Nessuna spiegazione disponibile.");
    } catch (err) {
      setErrorMsg(`Suggerimento non disponibile: ${err.message}`);
    } finally {
      setSuggesting(false);
    }
  }

  async function handleSave() {
    if (!canPickDims || totals.totalAmt <= 0) return;
    setSaving(true);
    setErrorMsg("");
    try {
      const dims = Object.fromEntries(orderedDims.map((k) => [k, selections[k]]));
      await api.addLines(budgetId, { dims, distribution, amount, quantity, monthlyAmounts, monthlyQuantities });
      reset();
      onSaved();
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal-box modal-box--wide">
        <div className="modal-header">
          <h3>Aggiungi riga di budget</h3>
          <button className="modal-close" onClick={handleClose}>✖</button>
        </div>

        <div className="modal-body">
          {errorMsg && <div className="error-banner">{errorMsg}</div>}

          <div className="form-grid" style={{ marginBottom: 16 }}>
            {orderedDims.map((key) => (
              <div className="form-field" key={key}>
                <label>{DIM_LABELS[key]}</label>
                <select value={selections[key] || ""} onChange={(e) => handleSelect(key, e.target.value)}>
                  <option value="">— seleziona —</option>
                  {optionsFor(key).map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>

          {canSuggest && (
            <div className="assistant-suggest-bar">
              <button className="btn btn-ghost" disabled={suggesting} onClick={handleSuggest}>
                <IconBot width={14} height={14} style={{ marginRight: 6, verticalAlign: "text-bottom" }} />
                {suggesting ? "Sto pensando…" : "Chiedi all'assistente"}
              </button>
              {rationale && <p className="assistant-rationale">{rationale}</p>}
            </div>
          )}

          <div className="mode-pills">
            <button className={`mode-pill ${!isMonthly ? "active" : ""}`} onClick={() => setDistribution("total")}>Totale annuo</button>
            <button className={`mode-pill ${isMonthly ? "active" : ""}`} onClick={() => setDistribution("monthly")}>Mensile</button>
          </div>

          {!isMonthly && (
            <div className="form-grid">
              <div className="form-field">
                <label>Importo totale ({currencyCode})</label>
                <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
              </div>
              <div className="form-field">
                <label>Quantità totale</label>
                <input type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
              </div>
            </div>
          )}

          {isMonthly && (
            <div className="table-scroll">
              <table className="pivot-table">
                <thead>
                  <tr>
                    <th>Misura</th>
                    {MONTH_LABELS.map((m) => <th key={m}>{m}</th>)}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="row-label">Importo</td>
                    {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                      <td key={m}>
                        <input
                          type="number"
                          value={monthlyAmounts[m]}
                          onChange={(e) => setMonthlyAmounts({ ...monthlyAmounts, [m]: e.target.value })}
                        />
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="row-label">Quantità</td>
                    {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                      <td key={m}>
                        <input
                          type="number"
                          value={monthlyQuantities[m]}
                          onChange={(e) => setMonthlyQuantities({ ...monthlyQuantities, [m]: e.target.value })}
                        />
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          <div className="totals-recap">
            Totale: <strong>{totals.totalAmt.toLocaleString("it-IT", { maximumFractionDigits: 2 })} {currencyCode}</strong>
            {" · "}Quantità: <strong>{totals.totalQty.toLocaleString("it-IT")}</strong>
            {totals.totalQty > 0 && (
              <>
                {" · "}Prezzo medio: <strong>
                  {(totals.totalAmt / totals.totalQty).toLocaleString("it-IT", { maximumFractionDigits: 2 })} {currencyCode}
                </strong>
              </>
            )}
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={handleClose}>Annulla</button>
          <button className="btn btn-primary" disabled={!canPickDims || totals.totalAmt <= 0 || saving} onClick={handleSave}>
            {saving ? "Salvataggio…" : "Inserisci riga"}
          </button>
        </div>
      </div>
    </div>
  );
}
