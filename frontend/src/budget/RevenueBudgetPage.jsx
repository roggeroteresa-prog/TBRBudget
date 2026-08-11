import { useEffect, useMemo, useState } from "react";
import { api } from "./api.js";
import StatusBadge from "./StatusBadge.jsx";
import PivotDrilldownTable from "./PivotDrilldownTable.jsx";
import AddRowModal from "./AddRowModal.jsx";
import ConfirmModal from "./ConfirmModal.jsx";
import FilterDropdownPill from "../components/FilterDropdownPill.jsx";
import { IconSend, IconPlus, IconFilter, IconCalendar } from "../components/Icons.jsx";

const DIM_ORDER = ["macroarea", "country", "customer", "category", "product"];
const DIM_LABELS = {
  macroarea: "Macroarea",
  country: "Paese",
  customer: "Cliente",
  category: "Categoria Prodotto",
  product: "Prodotto",
};
const FACTOR_LABELS = { IMPORTO: "Importo", QUANTITA: "Quantità", PREZZO: "Prezzo" };

function cloneRows(rows) {
  return rows.map((r) => ({
    ...r,
    monthlyAmount: [...r.monthlyAmount],
    monthlyQuantity: [...r.monthlyQuantity],
  }));
}

function toMonthMap(arr) {
  return Object.fromEntries(arr.map((v, i) => [i + 1, v]));
}

function leafKey(dims) {
  const sorted = Object.keys(dims).sort();
  return JSON.stringify(dims, sorted);
}

function fmtDate(iso) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

/** Applica la modifica di una misura (Importo/Quantità/Prezzo) rispettando
 * il Fattore Fisso: le due misure editabili sono indipendenti, la terza
 * (quella fissa) viene sempre ricalcolata di conseguenza. */
function applyMeasureEdit({ amount, quantity }, fixedFactor, field, rawValue) {
  const num = parseFloat(rawValue) || 0;
  const price = quantity ? amount / quantity : 0;

  if (fixedFactor === "QUANTITA") {
    const newAmount = field === "amount" ? num : amount;
    const newPrice = field === "price" ? num : price;
    return { amount: newAmount, quantity: newPrice ? newAmount / newPrice : 0 };
  }
  if (fixedFactor === "IMPORTO") {
    const newQuantity = field === "quantity" ? num : quantity;
    const newPrice = field === "price" ? num : price;
    return { amount: newQuantity * newPrice, quantity: newQuantity };
  }
  return {
    amount: field === "amount" ? num : amount,
    quantity: field === "quantity" ? num : quantity,
  };
}

function sumField(rows, field, monthIndex) {
  return rows.reduce((s, r) => {
    const arr = field === "amount" ? r.monthlyAmount : r.monthlyQuantity;
    return s + (monthIndex === null ? arr.reduce((a, b) => a + b, 0) : arr[monthIndex]);
  }, 0);
}

/**
 * Applica una modifica a un gruppo (eventualmente aggregato) di righe leaf,
 * ridistribuendo il nuovo valore in modo proporzionale al peso attuale di
 * ciascuna riga leaf sottostante (come in PWB: editare un'aggregazione
 * ridistribuisce sui figli, non tocca i "fratelli").
 */
function redistributeGroup(matchingLeaves, fixedFactor, field, rawValue, monthIndex) {
  const curAmount = sumField(matchingLeaves, "amount", monthIndex);
  const curQuantity = sumField(matchingLeaves, "quantity", monthIndex);
  const { amount: newAmount, quantity: newQuantity } = applyMeasureEdit(
    { amount: curAmount, quantity: curQuantity },
    fixedFactor,
    field,
    rawValue
  );

  function shareOf(leaf, f) {
    const arr = f === "amount" ? leaf.monthlyAmount : leaf.monthlyQuantity;
    return monthIndex === null ? arr.reduce((a, b) => a + b, 0) : arr[monthIndex];
  }

  function applyTarget(f, newTotal) {
    const shares = matchingLeaves.map((l) => shareOf(l, f));
    const shareSum = shares.reduce((a, b) => a + b, 0);
    matchingLeaves.forEach((leaf, i) => {
      const ratio = shareSum !== 0 ? shares[i] / shareSum : i === 0 ? 1 : 0;
      const leafNewTotal = newTotal * ratio;
      const arr = f === "amount" ? leaf.monthlyAmount : leaf.monthlyQuantity;
      if (monthIndex === null) {
        const leafCurTotal = arr.reduce((a, b) => a + b, 0);
        const scale = leafCurTotal !== 0 ? leafNewTotal / leafCurTotal : null;
        for (let m = 0; m < 12; m++) arr[m] = scale !== null ? arr[m] * scale : leafNewTotal / 12;
      } else {
        arr[monthIndex] = leafNewTotal;
      }
    });
  }

  applyTarget("amount", newAmount);
  applyTarget("quantity", newQuantity);
}

export default function RevenueBudgetPage({ selectedBudgetId, onSelectBudget, currentUser }) {
  const [budgets, setBudgets] = useState([]);
  const [budget, setBudget] = useState(null);
  const [leafRows, setLeafRows] = useState([]); // clone editabile di pivot.rows (granularità piena)
  const [originalRows, setOriginalRows] = useState([]); // riferimento per capire cosa è cambiato

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [view, setView] = useState("totale");

  const [viewDim, setViewDim] = useState(null); // null = livello radice "Budget"
  const [drillPath, setDrillPath] = useState([]); // [{dimKey, value}] — navigazione interna, indipendente dai filtri
  const [topFilters, setTopFilters] = useState({}); // { dimKey: string[] } — filtri utente in alto
  const [consolidato, setConsolidato] = useState({ consAmount: 0, consQuantity: 0, groups: [] });
  const [dimensionsData, setDimensionsData] = useState({ defs: [], options: {}, filters: {} });

  const [addOpen, setAddOpen] = useState(false);
  const [deleteRowTarget, setDeleteRowTarget] = useState(null);
  const [sendConfirmOpen, setSendConfirmOpen] = useState(false);
  const [unsavedPrompt, setUnsavedPrompt] = useState(null); // { action: fn } | null

  useEffect(() => {
    api.listBudgets().then((list) => {
      setBudgets(list);
      if (!selectedBudgetId && list.length) onSelectBudget(list[0].id);
    });
    api.getDimensions().then(setDimensionsData);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadDetail(id) {
    setLoading(true);
    const [b, p] = await Promise.all([api.getBudget(id), api.getPivot(id)]);
    setBudget(b);
    setLeafRows(cloneRows(p.rows));
    setOriginalRows(cloneRows(p.rows));
    setViewDim(null);
    setDrillPath([]);
    setTopFilters({});
    setDirty(false);
    setLoading(false);
  }

  useEffect(() => {
    if (selectedBudgetId) loadDetail(selectedBudgetId);
  }, [selectedBudgetId]);

  const activeDims = budget?.dimensions || [];
  const orderedActiveDims = DIM_ORDER.filter((d) => activeDims.includes(d));

  // Filtri effettivi passati al back end per il consolidato: solo i "pin"
  // del drill-down (valore singolo); i filtri multi-select in alto vengono
  // applicati lato client (il consolidato via drill-path resta comunque
  // corretto per il confronto storico del livello corrente).
  const drillFiltersObj = useMemo(
    () => Object.fromEntries(drillPath.map((p) => [p.dimKey, p.value])),
    [drillPath]
  );

  useEffect(() => {
    if (!selectedBudgetId || !budget?.configStatus?.dimensions) return;
    api.getConsolidato(selectedBudgetId, { viewDim, filters: drillFiltersObj }).then(setConsolidato);
  }, [selectedBudgetId, viewDim, drillFiltersObj, budget?.configStatus?.dimensions]);

  // Righe leaf che rispettano sia i filtri multi-select in alto sia il
  // percorso di drill-down interno.
  const filteredLeaf = useMemo(() => {
    return leafRows.filter((r) => {
      const passesTopFilters = Object.entries(topFilters).every(
        ([k, values]) => !values?.length || values.includes(r.dims[k])
      );
      const passesDrill = drillPath.every((p) => r.dims[p.dimKey] === p.value);
      return passesTopFilters && passesDrill;
    });
  }, [leafRows, topFilters, drillPath]);

  const displayRows = useMemo(() => {
    const consByValue = new Map(consolidato.groups.map((g) => [g.value, g]));
    const availableNextDims = orderedActiveDims.filter(
      (d) => d !== viewDim && !drillPath.some((p) => p.dimKey === d)
    );
    const nextDim = availableNextDims[0];

    function buildRow(value, matching, cons) {
      const monthlyAmount = Array(12).fill(0);
      const monthlyQuantity = Array(12).fill(0);
      matching.forEach((r) => {
        r.monthlyAmount.forEach((v, i) => (monthlyAmount[i] += v));
        r.monthlyQuantity.forEach((v, i) => (monthlyQuantity[i] += v));
      });
      const totalAmount = monthlyAmount.reduce((a, b) => a + b, 0);
      const totalQuantity = monthlyQuantity.reduce((a, b) => a + b, 0);
      const isUnique = matching.length === 1;

      return {
        key: String(value),
        value: value ?? "Totale",
        label: viewDim ? DIM_LABELS[viewDim] : "Budget",
        matchingLeaves: matching,
        isUnique,
        canDrill: !isUnique && !!nextDim,
        nextDim,
        nextDimLabel: nextDim ? `${DIM_LABELS[nextDim]} ›` : null,
        monthlyAmount,
        monthlyQuantity,
        totalAmount,
        totalQuantity,
        consAmount: cons?.consAmount || 0,
        consQuantity: cons?.consQuantity || 0,
      };
    }

    if (!viewDim) {
      return [buildRow(null, filteredLeaf, consolidato)];
    }

    const groups = new Map();
    filteredLeaf.forEach((r) => {
      const v = r.dims[viewDim];
      if (!groups.has(v)) groups.set(v, []);
      groups.get(v).push(r);
    });

    return Array.from(groups.entries())
      .map(([value, matching]) => buildRow(value, matching, consByValue.get(value)))
      .sort((a, b) => String(a.value).localeCompare(String(b.value), "it"));
  }, [filteredLeaf, viewDim, drillPath, consolidato, orderedActiveDims]);

  // Clic su una tab dimensione: ripartiziona la vista corrente. Solo la tab
  // "Budget" azzera la navigazione; le altre tab troncano il drill-path a
  // ciò che precede la dimensione scelta (comportamento "breadcrumb"), MA
  // non toccano mai i filtri in alto.
  function guardedNavigate(action) {
    if (dirty) {
      setUnsavedPrompt({ action });
    } else {
      action();
    }
  }

  function goToTab(dim) {
    if (dim === null) {
      setDrillPath([]);
      setViewDim(null);
      return;
    }
    const idx = orderedActiveDims.indexOf(dim);
    setDrillPath((prev) => prev.filter((p) => orderedActiveDims.indexOf(p.dimKey) < idx));
    setViewDim(dim);
  }

  function handleDrill(row) {
    if (viewDim) setDrillPath((prev) => [...prev, { dimKey: viewDim, value: row.value }]);
    setViewDim(row.nextDim);
  }

  function handleCellChange(row, field, monthIndex, rawValue) {
    setDirty(true);
    const keys = new Set(row.matchingLeaves.map((l) => leafKey(l.dims)));
    setLeafRows((prev) => {
      const clones = prev.map((r) => (keys.has(leafKey(r.dims)) ? { ...r, monthlyAmount: [...r.monthlyAmount], monthlyQuantity: [...r.monthlyQuantity] } : r));
      const matchingClones = clones.filter((r) => keys.has(leafKey(r.dims)));
      redistributeGroup(matchingClones, budget.fixedFactor, field, rawValue, monthIndex);
      return clones;
    });
  }

  async function handleSaveChanges() {
    setSaving(true);
    try {
      const originalByKey = Object.fromEntries(originalRows.map((r) => [leafKey(r.dims), r]));
      const changed = leafRows.filter((r) => {
        const orig = originalByKey[leafKey(r.dims)];
        if (!orig) return false;
        return (
          JSON.stringify(r.monthlyAmount) !== JSON.stringify(orig.monthlyAmount) ||
          JSON.stringify(r.monthlyQuantity) !== JSON.stringify(orig.monthlyQuantity)
        );
      });

      await Promise.all(
        changed.map((r) =>
          api.upsertLines(selectedBudgetId, {
            dims: r.dims,
            distribution: "monthly",
            monthlyAmounts: toMonthMap(r.monthlyAmount),
            monthlyQuantities: toMonthMap(r.monthlyQuantity),
          })
        )
      );
      await loadDetail(selectedBudgetId);
    } catch (err) {
      alert(`Errore durante il salvataggio: ${err.message}`);
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteRowConfirm() {
    const keys = new Set(deleteRowTarget.matchingLeaves.map((l) => leafKey(l.dims)));
    const lines = await api.listLines(selectedBudgetId);
    const toRemove = lines.filter((l) => keys.has(leafKey(l.dims)));
    try {
      await Promise.all(toRemove.map((l) => api.deleteLine(selectedBudgetId, l.id)));
      setDeleteRowTarget(null);
      loadDetail(selectedBudgetId);
    } catch (err) {
      alert(`Errore: ${err.message}`);
    }
  }

  function resetFilters() {
    setTopFilters({});
  }

  if (!budgets.length && !loading) {
    return (
      <div className="page">
        <h2>Budget dei Ricavi</h2>
        <div className="empty-state">Nessun budget disponibile. Crea prima un budget in "Gestione Budget".</div>
      </div>
    );
  }

  const kpiAmount = filteredLeaf.reduce((s, r) => s + r.monthlyAmount.reduce((a, b) => a + b, 0), 0);
  const kpiQuantity = filteredLeaf.reduce((s, r) => s + r.monthlyQuantity.reduce((a, b) => a + b, 0), 0);
  const kpiAvgPrice = kpiQuantity > 0 ? kpiAmount / kpiQuantity : 0;
  const dimsReady = !!budget?.configStatus?.dimensions;
  const isConfirmed = budget?.status === "Confermato";
  const isViewer = currentUser?.role === "viewer";
  const isReadOnly = isConfirmed || isViewer;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h2>Budget Ricavi</h2>
          <p className="page-subtitle">Visualizza e modifica i dati di budget per dimensione</p>
        </div>
        <div className="ricavi-header-actions">
          <button className="btn btn-primary" disabled={!dirty || saving || isReadOnly} onClick={() => setSendConfirmOpen(true)}>
            <IconSend width={14} height={14} /> {saving ? "Invio…" : "Invia Modifiche"}
          </button>
        </div>
      </div>

      <div className="filters-bar">
        <div className="filters-bar-title"><IconFilter width={13} height={13} /> Filtri</div>
        <div className="filters-bar-row">
          <div className="form-field">
            <label>Company</label>
            <input value="TBR Budget Group" disabled />
          </div>
          <div className="form-field">
            <label>Budget</label>
            <select value={selectedBudgetId || ""} onChange={(e) => guardedNavigate(() => onSelectBudget(e.target.value))}>
              {budgets.map((b) => (
                <option key={b.id} value={b.id}>{b.budgetName} ({b.budgetYear})</option>
              ))}
            </select>
          </div>
          {dimsReady && orderedActiveDims.map((d) => (
            <FilterDropdownPill
              key={d}
              label={DIM_LABELS[d]}
              values={Array.from(new Set(leafRows.map((r) => r.dims[d]))).sort()}
              selected={topFilters[d] || []}
              onChange={(vals) => setTopFilters((prev) => ({ ...prev, [d]: vals }))}
            />
          ))}
          {dimsReady && (
            <button className="btn btn-ghost" style={{ alignSelf: "flex-end" }} onClick={resetFilters}>
              Reset filtri
            </button>
          )}
        </div>
      </div>

      {loading || !budget ? (
        <div className="empty-state">Caricamento…</div>
      ) : !dimsReady ? (
        <div className="empty-state">
          Questo budget non è ancora configurato. Completa la configurazione dalla sezione "Gestione Budget".
        </div>
      ) : (
        <>
          <div className="kpi-row">
            <div className="kpi-card">
              <span className="kpi-label">Totale budget</span>
              <span className="kpi-value">{kpiAmount.toLocaleString("it-IT", { maximumFractionDigits: 0 })} {budget.currencyCode}</span>
            </div>
            <div className="kpi-card">
              <span className="kpi-label">Totale quantità</span>
              <span className="kpi-value">{kpiQuantity.toLocaleString("it-IT")}</span>
            </div>
            <div className="kpi-card">
              <span className="kpi-label">Prezzo medio</span>
              <span className="kpi-value">{kpiAvgPrice.toLocaleString("it-IT", { maximumFractionDigits: 2 })} {budget.currencyCode}</span>
            </div>
          </div>

          <div className="budget-info-bar">
            <div>
              <span className="budget-info-label">Budget</span>
              <strong className="budget-info-accent">{budget.budgetName}</strong>
            </div>
            <div>
              <span className="budget-info-label">Company</span>
              <strong>{budget.company}</strong>
            </div>
            <div>
              <span className="budget-info-label">Anno</span>
              <strong>{budget.budgetYear}</strong>
            </div>
            <div>
              <span className="budget-info-label"><IconCalendar width={11} height={11} /> Periodo Consuntivo</span>
              <strong>{fmtDate(budget.startDate)} → {fmtDate(budget.endDate)}</strong>
            </div>
            <div>
              <span className="budget-info-label">Currency</span>
              <span className="badge-pill">{budget.currencyCode}</span>
            </div>
            <div>
              <span className="budget-info-label">Stato</span>
              <StatusBadge status={budget.status} />
            </div>
            <div>
              <span className="budget-info-label">Fattore Fisso</span>
              <span className="badge-pill badge-pill--neutral">{FACTOR_LABELS[budget.fixedFactor] || budget.fixedFactor}</span>
            </div>
            <button className="btn btn-primary" onClick={() => setAddOpen(true)} disabled={isReadOnly}>
              <IconPlus width={14} height={14} /> Aggiungi Riga
            </button>
          </div>

          {isReadOnly && (
            <div className="confirmed-notice">
              {isConfirmed
                ? <>Questo budget è <strong>Confermato</strong> e non è modificabile. Riportalo in "Bozza" da Gestione Budget per poterlo modificare.</>
                : <>Il tuo ruolo (<strong>Visualizzatore</strong>) permette solo la visualizzazione di questo budget.</>}
            </div>
          )}

          <div className="dim-tabs">
            <button className={`dim-tab ${viewDim === null ? "active" : ""}`} onClick={() => guardedNavigate(() => goToTab(null))}>Budget</button>
            {orderedActiveDims.map((d) => (
              <button key={d} className={`dim-tab ${viewDim === d ? "active" : ""}`} onClick={() => guardedNavigate(() => goToTab(d))}>
                {DIM_LABELS[d]}
              </button>
            ))}
            <div className="mode-pills" style={{ marginLeft: "auto" }}>
              <button className={`mode-pill ${view === "totale" ? "active" : ""}`} onClick={() => guardedNavigate(() => setView("totale"))}>Totale</button>
              <button className={`mode-pill ${view === "mensile" ? "active" : ""}`} onClick={() => guardedNavigate(() => setView("mensile"))}>Mensile</button>
            </div>
          </div>

          {drillPath.length > 0 && (
            <div className="drill-breadcrumb">
              Drill-down: {drillPath.map((p) => `${DIM_LABELS[p.dimKey]}: ${p.value}`).join(" → ")}
            </div>
          )}

          <PivotDrilldownTable
            rows={displayRows}
            view={view}
            currencyCode={budget.currencyCode}
            fixedFactor={budget.fixedFactor}
            readOnly={isReadOnly}
            onDrill={(row) => guardedNavigate(() => handleDrill(row))}
            onCellChange={handleCellChange}
            onDeleteRow={setDeleteRowTarget}
          />

          <AddRowModal
            open={addOpen}
            onClose={() => setAddOpen(false)}
            onSaved={() => {
              setAddOpen(false);
              loadDetail(selectedBudgetId);
            }}
            budgetId={selectedBudgetId}
            currencyCode={budget.currencyCode}
            activeDims={activeDims}
            dimensionsData={dimensionsData}
          />

          <ConfirmModal
            open={!!deleteRowTarget}
            title="Rimuovi riga di budget"
            message={
              deleteRowTarget
                ? `Rimuovere ${deleteRowTarget.matchingLeaves?.length || 1} riga/e di dettaglio per questa combinazione?`
                : ""
            }
            confirmLabel="Rimuovi"
            danger
            onConfirm={handleDeleteRowConfirm}
            onClose={() => setDeleteRowTarget(null)}
          />

          <ConfirmModal
            open={sendConfirmOpen}
            title="Invia modifiche"
            message="Confermi l'invio delle modifiche al budget? I valori verranno salvati definitivamente."
            confirmLabel="Invia"
            onConfirm={() => {
              setSendConfirmOpen(false);
              handleSaveChanges();
            }}
            onClose={() => setSendConfirmOpen(false)}
          />

          {unsavedPrompt && (
            <div className="modal-overlay">
              <div className="modal-box modal-box--small">
                <div className="modal-header">
                  <h3>Modifiche non salvate</h3>
                  <button className="modal-close" onClick={() => setUnsavedPrompt(null)}>✖</button>
                </div>
                <div className="modal-body">
                  <p>Ci sono modifiche non ancora inviate. Vuoi inviarle prima di continuare, oppure procedere senza salvarle?</p>
                </div>
                <div className="modal-footer">
                  <button className="btn btn-ghost" onClick={() => setUnsavedPrompt(null)}>Annulla</button>
                  <button
                    className="btn btn-ghost"
                    onClick={() => {
                      const { action } = unsavedPrompt;
                      setLeafRows(cloneRows(originalRows));
                      setDirty(false);
                      setUnsavedPrompt(null);
                      action();
                    }}
                  >
                    Continua senza salvare
                  </button>
                  <button
                    className="btn btn-primary"
                    onClick={async () => {
                      const { action } = unsavedPrompt;
                      setUnsavedPrompt(null);
                      await handleSaveChanges();
                      action();
                    }}
                  >
                    Invia modifiche
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
