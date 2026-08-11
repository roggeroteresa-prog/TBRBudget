import { useEffect, useState } from "react";
import { api } from "./api.js";
import StatusBadge from "./StatusBadge.jsx";
import { IconCheck, IconLock, IconCurrency, IconTarget, IconManage } from "../components/Icons.jsx";

const TABS = [
  { id: "dimensions", label: "Dimensioni" },
  { id: "currency", label: "Currency & Tassi" },
  { id: "amounts", label: "Importo Iniziale" },
];

const SLOT_COUNT = 5;

/** Interpreta l'input come valore assoluto, percentuale (+5%/-10%) o delta
 * (+50000/-20000) rispetto al valore di consuntivo — stessa logica di PWB. */
function applyDelta(base, raw) {
  const s = String(raw ?? "").trim().replace(/\s+/g, "").replace(/\.(?=\d{3})/g, "").replace(",", ".");
  if (!s) return base;
  const mPct = s.match(/^([+-])(\d+(?:\.\d+)?)%$/);
  if (mPct) return base * (1 + (mPct[1] === "-" ? -1 : 1) * Number(mPct[2]) / 100);
  const mDelta = s.match(/^([+-])(\d+(?:\.\d+)?)$/);
  if (mDelta) return base + (mDelta[1] === "-" ? -1 : 1) * Number(mDelta[2]);
  const mAbs = s.match(/^=?(\d+(?:\.\d+)?)$/);
  if (mAbs) return Number(mAbs[1]);
  return null;
}

function fmtNum(n, digits = 0) {
  if (n == null || !Number.isFinite(Number(n))) return "—";
  return Number(n).toLocaleString("it-IT", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export default function BudgetConfigPage({ budgetId, onDone, onCancel, currentUser }) {
  const isViewer = currentUser?.role === "viewer";
  const [budget, setBudget] = useState(null);
  const [dimDefs, setDimDefs] = useState([]);
  const [activeTab, setActiveTab] = useState("dimensions");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // ── Step 1: dimensioni in slot ordinati (Dimensione 1..5) ──
  const [slots, setSlots] = useState(Array(SLOT_COUNT).fill(""));

  // ── Step 2: valute rilevate nel periodo consuntivo (+ tasso live) ──
  const [currencyRows, setCurrencyRows] = useState([]); // [{code, sampleCount, rate, liveRate}]
  const [currencyLoading, setCurrencyLoading] = useState(false);

  // ── Step 3: consuntivo di riferimento + input (assoluto/%/delta) ──
  const [consAmount, setConsAmount] = useState(null);
  const [consQuantity, setConsQuantity] = useState(null);
  const [amountInput, setAmountInput] = useState("");
  const [quantityInput, setQuantityInput] = useState("");
  const [amountsLoading, setAmountsLoading] = useState(false);
  const [generateResult, setGenerateResult] = useState(null);

  useEffect(() => {
    Promise.all([api.getBudget(budgetId), api.getDimensions()]).then(([b, dims]) => {
      setBudget(b);
      setDimDefs(dims.defs);
      const initial = b.dimensions || [];
      setSlots(Array.from({ length: SLOT_COUNT }, (_, i) => initial[i] || ""));
      setActiveTab(!b.configStatus?.dimensions ? "dimensions" : !b.configStatus?.currency ? "currency" : "amounts");
      setLoading(false);
    });
  }, [budgetId]);

  // Quando si entra nel tab Currency, analizza il periodo consuntivo (+ tassi live)
  useEffect(() => {
    if (activeTab !== "currency" || !budget) return;
    setCurrencyLoading(true);
    api.getCurrencyAnalysis(budgetId).then(({ currencies }) => {
      const savedRates = budget.exchangeRates || {};
      setCurrencyRows(
        currencies.map((c) => ({
          code: c.code,
          sampleCount: c.sampleCount,
          liveRate: c.liveRate,
          rate: savedRates[c.code] ?? c.suggestedRate,
        }))
      );
      setCurrencyLoading(false);
    });
  }, [activeTab, budget, budgetId]);

  // Quando si entra nel tab Importo, recupera il consuntivo del periodo come riferimento
  useEffect(() => {
    if (activeTab !== "amounts" || !budget) return;
    setAmountsLoading(true);
    api.getConsolidato(budgetId, { viewDim: null, filters: {} }).then(({ consAmount: ca, consQuantity: cq }) => {
      setConsAmount(ca);
      setConsQuantity(cq);
      const savedAmount = budget.initialTargets?.totalAmount;
      const savedQuantity = budget.initialTargets?.totalQuantity;
      setAmountInput(savedAmount ? String(Math.round(savedAmount)) : "");
      setQuantityInput(savedQuantity ? String(Math.round(savedQuantity)) : "");
      setAmountsLoading(false);
    });
  }, [activeTab, budget, budgetId]);

  if (loading || !budget) return <div className="page"><div className="empty-state">Caricamento…</div></div>;

  const computedAmount = consAmount != null ? applyDelta(consAmount, amountInput) : null;
  const computedQuantity = consQuantity != null ? applyDelta(consQuantity, quantityInput) : null;

  const isCurrencyLocked = !budget.configStatus?.dimensions;
  const isAmountsLocked = !budget.configStatus?.currency;

  function tabLocked(id) {
    if (id === "currency") return isCurrencyLocked;
    if (id === "amounts") return isAmountsLocked;
    return false;
  }

  async function refreshBudget() {
    const b = await api.getBudget(budgetId);
    setBudget(b);
    return b;
  }

  function setSlot(index, value) {
    setSlots((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  }

  // Opzioni disponibili per uno slot: tutte le dimensioni non ancora scelte
  // in un altro slot, più il valore corrente dello slot stesso.
  function optionsForSlot(index) {
    const usedElsewhere = new Set(slots.filter((_, i) => i !== index).filter(Boolean));
    return dimDefs.filter((d) => !usedElsewhere.has(d.key));
  }

  const selectedDims = slots.filter(Boolean);

  async function saveDimensions() {
    if (selectedDims.length === 0) return;
    setSaving(true);
    try {
      await api.updateBudget(budgetId, { dimensions: selectedDims });
      await refreshBudget();
      setActiveTab("currency");
    } catch (err) {
      alert(`Errore: ${err.message}`);
    } finally {
      setSaving(false);
    }
  }

  async function saveCurrency() {
    setSaving(true);
    try {
      const rates = Object.fromEntries(currencyRows.map((r) => [r.code, Number(r.rate) || 0]));
      await api.updateBudget(budgetId, { exchangeRates: rates });
      await refreshBudget();
      setActiveTab("amounts");
    } catch (err) {
      alert(`Errore: ${err.message}`);
    } finally {
      setSaving(false);
    }
  }

  async function handleGenerate() {
    if (computedAmount == null && computedQuantity == null) return;
    setSaving(true);
    setGenerateResult(null);
    try {
      const result = await api.generateBaseBudget(budgetId, {
        totalAmount: computedAmount ?? 0,
        totalQuantity: computedQuantity ?? 0,
      });
      setGenerateResult(result);
      await refreshBudget();
    } catch (err) {
      alert(`Errore: ${err.message}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="page">
      <button className="link-button" onClick={onCancel}>← Torna ai budget</button>

      <div className="page-header" style={{ marginTop: 10 }}>
        <div>
          <h2>Configura: {budget.budgetName}</h2>
          <p className="page-subtitle">
            {budget.company} · {budget.budgetYear} · {budget.currencyCode} · Periodo consuntivo {budget.startDate} → {budget.endDate}
            {" "}<StatusBadge status={budget.status} />
          </p>
        </div>
      </div>

      <div className="config-tabs">
        {TABS.map((tab) => {
          const locked = tabLocked(tab.id);
          const done = budget.configStatus?.[tab.id];
          return (
            <button
              key={tab.id}
              className={`config-tab ${activeTab === tab.id ? "active" : ""} ${locked ? "locked" : ""}`}
              onClick={() => !locked && setActiveTab(tab.id)}
              disabled={locked}
            >
              {done && <IconCheck width={13} height={13} className="config-tab-check" />}
              {tab.label}
              {locked && <IconLock width={12} height={12} />}
            </button>
          );
        })}
      </div>

      {/* ── Step 1: Dimensioni (in ordine, come da PWB: 5 slot ordinati) ── */}
      {activeTab === "dimensions" && (
        <div className="config-panel">
          <div className="config-panel-title"><IconManage width={16} height={16} /> Dimensioni di analisi</div>
          <p className="config-panel-hint">
            Scegli le dimensioni <strong>in ordine</strong>: l'ordine determina la gerarchia di drill-down nella
            tabella di "Budget dei Ricavi" (Dimensione 1 = primo livello, e così via). Lascia vuoti gli slot non
            necessari.
          </p>

          <div className="nb-grid">
            {slots.map((value, i) => (
              <div className="form-field" key={i}>
                <label>Dimensione {i + 1}</label>
                <select value={value} onChange={(e) => setSlot(i, e.target.value)}>
                  <option value="">— non usata —</option>
                  {optionsForSlot(i).map((d) => (
                    <option key={d.key} value={d.key}>{d.label}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>

          {selectedDims.length === 0 && (
            <p className="form-hint" style={{ color: "#c8102e", marginTop: 10 }}>Seleziona almeno una dimensione.</p>
          )}
          {selectedDims.length > 0 && (
            <p className="form-hint" style={{ marginTop: 10 }}>
              Ordine di drill-down: {selectedDims.map((k) => dimDefs.find((d) => d.key === k)?.label).join(" → ")}
            </p>
          )}

          <div className="config-panel-footer">
            <button className="btn btn-ghost" style={{ marginRight: 10 }} onClick={() => setSlots(Array(SLOT_COUNT).fill(""))}>
              Reset
            </button>
            <button className="btn btn-primary" disabled={saving || selectedDims.length === 0 || budget.status === "Confermato" || isViewer} onClick={saveDimensions}>
              {saving ? "Salvataggio…" : "Salva e continua"}
            </button>
          </div>
        </div>
      )}

      {/* ── Step 2: Currency & Tassi ── */}
      {activeTab === "currency" && (
        <div className="config-panel">
          <div className="config-panel-title"><IconCurrency width={16} height={16} /> Currency &amp; Tassi di cambio</div>
          <p className="config-panel-hint">
            Valuta base del budget: <strong>{budget.currencyCode}</strong>. Il sistema ha analizzato il consuntivo
            del periodo <strong>{budget.startDate} → {budget.endDate}</strong> e rilevato le valute diverse da{" "}
            {budget.currencyCode} effettivamente usate nelle vendite, con un tasso medio storico osservato.
            Dove disponibile, viene mostrato anche il <strong>tasso attuale live</strong> (fonte:{" "}
            <a href="https://www.frankfurter.app" target="_blank" rel="noreferrer">Frankfurter API</a>, dati BCE) —
            puoi usarlo al posto di quello storico con un click. Il tasso finale resta comunque modificabile.
          </p>

          {currencyLoading ? (
            <div className="empty-state">Analisi del consuntivo in corso…</div>
          ) : currencyRows.length === 0 ? (
            <div className="empty-state">
              Nessuna valuta diversa da {budget.currencyCode} rilevata nel periodo consuntivo selezionato.
            </div>
          ) : (
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Valuta</th>
                    <th>Transazioni rilevate</th>
                    <th>Tasso storico (medio periodo)</th>
                    <th>Tasso live (Frankfurter)</th>
                    <th>Tasso finale (1 {budget.currencyCode} =)</th>
                  </tr>
                </thead>
                <tbody>
                  {currencyRows.map((r, i) => (
                    <tr key={r.code}>
                      <td><strong>{r.code}</strong></td>
                      <td>{r.sampleCount}</td>
                      <td className="cell-cons">{r.rate}</td>
                      <td>
                        {r.liveRate != null ? (
                          <button
                            className="btn btn-ghost btn-sm"
                            onClick={() => {
                              const next = [...currencyRows];
                              next[i] = { ...next[i], rate: r.liveRate };
                              setCurrencyRows(next);
                            }}
                          >
                            {r.liveRate.toFixed(4)} → usa
                          </button>
                        ) : (
                          <span className="cell-cons">non disponibile</span>
                        )}
                      </td>
                      <td>
                        <input
                          type="number"
                          step="0.0001"
                          value={r.rate}
                          onChange={(e) => {
                            const next = [...currencyRows];
                            next[i] = { ...next[i], rate: e.target.value };
                            setCurrencyRows(next);
                          }}
                          style={{ width: 120 }}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="config-panel-footer">
            <button className="btn btn-primary" disabled={saving || currencyLoading || budget.status === "Confermato" || isViewer} onClick={saveCurrency}>
              {saving ? "Salvataggio…" : "Salva e continua"}
            </button>
          </div>
        </div>
      )}

      {/* ── Step 3: Importo Iniziale ── */}
      {activeTab === "amounts" && (
        <div className="config-panel">
          <div className="config-panel-title"><IconTarget width={16} height={16} /> Importo iniziale target</div>
          <p className="config-panel-hint">
            L'importo consuntivo del periodo è il riferimento. Inserisci il valore assoluto desiderato oppure una
            variazione rispetto al consuntivo (es. <code>+5%</code>, <code>-10%</code>, <code>+50000</code>,{" "}
            <code>-20000</code>). Alla conferma, il sistema riponderà in modo proporzionale il consuntivo storico
            (per ciascuna combinazione di dimensioni e per ciascun mese, preservando mix e stagionalità) sul
            valore risultante.
          </p>

          {amountsLoading ? (
            <div className="empty-state">Caricamento importo consuntivo…</div>
          ) : (
            <div className="amounts-config">
              {/* Totale Consuntivo (sola lettura) */}
              <div className="amounts-card amounts-card--muted">
                <div className="amounts-card-title">
                  Totale Consuntivo · {budget.startDate} → {budget.endDate}
                </div>
                <div className="amounts-kpi-row">
                  <div>
                    <div className="amounts-kpi-label">Importo ({budget.currencyCode})</div>
                    <div className="amounts-kpi-value">{fmtNum(consAmount)} <span>{budget.currencyCode}</span></div>
                  </div>
                  <div>
                    <div className="amounts-kpi-label">Quantità</div>
                    <div className="amounts-kpi-value">{fmtNum(consQuantity)}</div>
                  </div>
                </div>
              </div>

              {/* Valori Budget (input) */}
              <div className="amounts-card">
                <div className="amounts-card-title">Valori Budget — modifica il valore o applica una variazione</div>
                <div className="form-grid">
                  <div className="form-field">
                    <label>Importo ({budget.currencyCode})</label>
                    <input
                      value={amountInput}
                      onChange={(e) => setAmountInput(e.target.value)}
                      placeholder={`${fmtNum(consAmount)} (consuntivo)`}
                    />
                    <button className="btn btn-ghost btn-sm" style={{ marginTop: 6 }} onClick={() => setAmountInput("")}>
                      Reset importo
                    </button>
                  </div>
                  <div className="form-field">
                    <label>Quantità</label>
                    <input
                      value={quantityInput}
                      onChange={(e) => setQuantityInput(e.target.value)}
                      placeholder={`${fmtNum(consQuantity)} (consuntivo)`}
                    />
                    <button className="btn btn-ghost btn-sm" style={{ marginTop: 6 }} onClick={() => setQuantityInput("")}>
                      Reset quantità
                    </button>
                  </div>
                </div>
                <p className="form-hint" style={{ marginTop: 10 }}>
                  Formati: valore assoluto <code>950000</code>, percentuale <code>+5%</code> <code>-10%</code>, delta{" "}
                  <code>+50000</code> <code>-20000</code>. Lasciando vuoto resta il valore di consuntivo.
                </p>
              </div>

              {/* Valori Risultanti */}
              {computedAmount != null && (
                <div className={`amounts-card ${computedAmount !== consAmount || computedQuantity !== consQuantity ? "amounts-card--highlight" : ""}`}>
                  <div className="amounts-card-title">Valori Budget Risultanti</div>
                  <div className="amounts-kpi-row">
                    <div>
                      <div className="amounts-kpi-label">Importo ({budget.currencyCode})</div>
                      <div className="amounts-kpi-value amounts-kpi-value--accent">
                        {fmtNum(computedAmount)} <span>{budget.currencyCode}</span>
                      </div>
                      {consAmount > 0 && Math.abs(computedAmount - consAmount) > 0.01 && (
                        <div className={`amounts-delta ${computedAmount > consAmount ? "up" : "down"}`}>
                          {computedAmount > consAmount ? "+" : ""}
                          {(((computedAmount - consAmount) / consAmount) * 100).toFixed(1)}% vs consuntivo
                        </div>
                      )}
                    </div>
                    {computedQuantity != null && (
                      <div>
                        <div className="amounts-kpi-label">Quantità</div>
                        <div className="amounts-kpi-value amounts-kpi-value--accent">{fmtNum(computedQuantity)}</div>
                        {consQuantity > 0 && Math.abs(computedQuantity - consQuantity) > 0.01 && (
                          <div className={`amounts-delta ${computedQuantity > consQuantity ? "up" : "down"}`}>
                            {computedQuantity > consQuantity ? "+" : ""}
                            {(((computedQuantity - consQuantity) / consQuantity) * 100).toFixed(1)}% vs consuntivo
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {generateResult && (
            <div className="generate-result-banner">
              <IconCheck width={15} height={15} />
              Generate <strong>{generateResult.linesGenerated}</strong> righe, basate su{" "}
              <strong>{generateResult.historicalRowsUsed}</strong> record storici del periodo consuntivo
              su <strong>{generateResult.historicalGroups}</strong> combinazioni di dimensioni.
            </div>
          )}

          <div className="config-panel-footer" style={{ display: "flex", gap: 10 }}>
            <button
              className="btn btn-primary"
              disabled={saving || amountsLoading || computedAmount == null || budget.status === "Confermato" || isViewer}
              onClick={handleGenerate}
            >
              {saving ? "Generazione…" : "Genera base budget"}
            </button>
            {generateResult && (
              <button className="btn btn-ghost" onClick={onDone}>
                Vai a Budget dei Ricavi →
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
