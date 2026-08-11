import { useEffect, useMemo, useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell, LabelList,
  PieChart, Pie,
} from "recharts";
import { api } from "../budget/api.js";
import StatusBadge from "../budget/StatusBadge.jsx";
import FilterDropdownPill from "../components/FilterDropdownPill.jsx";
import { IconFilter } from "../components/Icons.jsx";

const MONTH_LABELS = ["Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic"];
const DIM_ORDER = ["macroarea", "country", "customer", "category", "product"];
const DIM_LABELS = {
  macroarea: "Macroarea",
  country: "Paese",
  customer: "Cliente",
  category: "Categoria Prodotto",
  product: "Prodotto",
};
const FACTOR_LABELS = { IMPORTO: "Importo", QUANTITA: "Quantità", PREZZO: "Prezzo" };
const RED = "#c8102e";
const DARK = "#1e1e1e";
const PALETTE = [RED, DARK, "#e07a86", "#555555", "#f2a5ad", "#8a8a8a", "#a8324a", "#8f8f8f"];

function numLabel(v) {
  return Number(v || 0).toLocaleString("it-IT", { maximumFractionDigits: 0 });
}

function aggregateByDim(rows, dimKey) {
  const map = new Map();
  rows.forEach((r) => {
    const label = r.dims[dimKey];
    map.set(label, (map.get(label) || 0) + r.totalAmount);
  });
  return Array.from(map.entries())
    .map(([name, value]) => ({ name, value: Math.round(value) }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 12);
}

export default function ReportPage() {
  const [budgets, setBudgets] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [pivot, setPivot] = useState(null);
  const [consolidatoRoot, setConsolidatoRoot] = useState(null);
  const [consolidatoByDim, setConsolidatoByDim] = useState(null);
  const [loading, setLoading] = useState(true);
  const [topFilters, setTopFilters] = useState({}); // { dimKey: string[] }

  useEffect(() => {
    api.listBudgets().then((data) => {
      setBudgets(data);
      if (data.length) setSelectedId(data[0].id);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    api.getPivot(selectedId).then(setPivot);
    setTopFilters({});
  }, [selectedId]);

  const dimKeys = pivot?.rows.length ? Object.keys(pivot.rows[0].dims) : [];
  const orderedDimKeys = DIM_ORDER.filter((d) => dimKeys.includes(d));
  const firstDim = orderedDimKeys[0];

  // Righe filtrate secondo i filtri per dimensione selezionati
  const filteredRows = useMemo(() => {
    if (!pivot) return [];
    return pivot.rows.filter((r) =>
      Object.entries(topFilters).every(([k, values]) => !values?.length || values.includes(r.dims[k]))
    );
  }, [pivot, topFilters]);

  useEffect(() => {
    if (!selectedId) return;
    api.getConsolidato(selectedId, { viewDim: null, filters: topFilters }).then(setConsolidatoRoot);
  }, [selectedId, topFilters]);

  useEffect(() => {
    if (!selectedId || !firstDim) {
      setConsolidatoByDim(null);
      return;
    }
    api.getConsolidato(selectedId, { viewDim: firstDim, filters: topFilters }).then(setConsolidatoByDim);
  }, [selectedId, firstDim, topFilters]);

  const dimCharts = useMemo(() => {
    return orderedDimKeys.map((key) => ({ key, label: DIM_LABELS[key] || key, data: aggregateByDim(filteredRows, key) }));
  }, [filteredRows, orderedDimKeys]); // eslint-disable-line react-hooks/exhaustive-deps

  const byMonth = useMemo(() => {
    const totals = Array(12).fill(0);
    filteredRows.forEach((r) => r.monthlyAmount.forEach((v, i) => (totals[i] += v)));
    return totals.map((v, i) => ({ name: MONTH_LABELS[i], value: Math.round(v) }));
  }, [filteredRows]);

  // Confronto Consuntivo vs Budget, raggruppato per la prima dimensione attiva
  const comparisonData = useMemo(() => {
    if (!dimCharts.length || !consolidatoByDim) return [];
    const consByValue = new Map(consolidatoByDim.groups.map((g) => [g.value, Math.round(g.consAmount)]));
    return dimCharts[0].data.map((d) => ({
      name: d.name,
      budget: d.value,
      consuntivo: consByValue.get(d.name) || 0,
    }));
  }, [dimCharts, consolidatoByDim]);

  const detailRows = useMemo(() => {
    return [...filteredRows]
      .sort((a, b) => b.totalAmount - a.totalAmount)
      .slice(0, 30)
      .map((r) => ({
        ...r,
        price: r.totalQuantity ? r.totalAmount / r.totalQuantity : 0,
      }));
  }, [filteredRows]);

  const selectedBudget = budgets.find((b) => b.id === selectedId);

  if (loading) return <div className="page"><div className="empty-state">Caricamento…</div></div>;

  if (!budgets.length) {
    return (
      <div className="page">
        <h2>Report</h2>
        <div className="empty-state">Nessun budget disponibile. Crea prima un budget in "Gestione Budget".</div>
      </div>
    );
  }

  const budgetTotal = filteredRows.reduce((s, r) => s + r.totalAmount, 0);
  const budgetQty = filteredRows.reduce((s, r) => s + r.totalQuantity, 0);
  const avgPrice = budgetQty ? budgetTotal / budgetQty : 0;
  const consAmount = consolidatoRoot?.consAmount || 0;
  const deltaPct = consAmount ? ((budgetTotal - consAmount) / consAmount) * 100 : null;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h2>Report</h2>
          <p className="page-subtitle">Analisi aggregata e confronto consuntivo vs budget.</p>
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
            <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
              {budgets.map((b) => (
                <option key={b.id} value={b.id}>{b.budgetName} ({b.budgetYear})</option>
              ))}
            </select>
          </div>
          {orderedDimKeys.map((d) => (
            <FilterDropdownPill
              key={d}
              label={DIM_LABELS[d]}
              values={Array.from(new Set((pivot?.rows || []).map((r) => r.dims[d]))).sort()}
              selected={topFilters[d] || []}
              onChange={(vals) => setTopFilters((prev) => ({ ...prev, [d]: vals }))}
            />
          ))}
          {orderedDimKeys.length > 0 && (
            <button className="btn btn-ghost" style={{ alignSelf: "flex-end" }} onClick={() => setTopFilters({})}>
              Reset filtri
            </button>
          )}
        </div>
      </div>

      {selectedBudget && (
        <div className="budget-info-bar">
          <div>
            <span className="budget-info-label">Budget</span>
            <strong className="budget-info-accent">{selectedBudget.budgetName}</strong>
          </div>
          <div>
            <span className="budget-info-label">Anno</span>
            <strong>{selectedBudget.budgetYear}</strong>
          </div>
          <div>
            <span className="budget-info-label">Currency</span>
            <span className="badge-pill">{selectedBudget.currencyCode}</span>
          </div>
          <div>
            <span className="budget-info-label">Stato</span>
            <StatusBadge status={selectedBudget.status} />
          </div>
          <div>
            <span className="budget-info-label">Fattore Fisso</span>
            <span className="badge-pill badge-pill--neutral">{FACTOR_LABELS[selectedBudget.fixedFactor] || selectedBudget.fixedFactor}</span>
          </div>
          <div>
            <span className="budget-info-label">Dimensioni</span>
            <strong>{orderedDimKeys.length ? orderedDimKeys.map((k) => DIM_LABELS[k] || k).join(" → ") : "—"}</strong>
          </div>
        </div>
      )}

      {!pivot || pivot.rows.length === 0 ? (
        <div className="empty-state">
          Questo budget non ha ancora righe. Generale la base o aggiungile dalla sezione "Budget dei Ricavi".
        </div>
      ) : filteredRows.length === 0 ? (
        <div className="empty-state">Nessuna riga corrisponde ai filtri selezionati.</div>
      ) : (
        <>
          <div className="kpi-row">
            <div className="kpi-card">
              <span className="kpi-label">Totale budget</span>
              <span className="kpi-value">{numLabel(budgetTotal)} {selectedBudget?.currencyCode}</span>
            </div>
            <div className="kpi-card">
              <span className="kpi-label">Totale quantità</span>
              <span className="kpi-value">{numLabel(budgetQty)}</span>
            </div>
            <div className="kpi-card">
              <span className="kpi-label">Prezzo medio</span>
              <span className="kpi-value">{avgPrice.toLocaleString("it-IT", { maximumFractionDigits: 2 })} {selectedBudget?.currencyCode}</span>
            </div>
            <div className="kpi-card">
              <span className="kpi-label">Totale consuntivo (periodo)</span>
              <span className="kpi-value">{numLabel(consAmount)} {selectedBudget?.currencyCode}</span>
              {deltaPct != null && (
                <span className={`amounts-delta ${deltaPct >= 0 ? "up" : "down"}`} style={{ marginTop: 4 }}>
                  {deltaPct >= 0 ? "+" : ""}{deltaPct.toFixed(1)}% budget vs consuntivo
                </span>
              )}
            </div>
          </div>

          <div className="report-charts-grid">
            {dimCharts.map((chart, ci) => (
              <div className="chart-card" key={chart.key}>
                <div className="chart-card-title">Fatturato per {chart.label.toLowerCase()}</div>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={chart.data} layout="vertical" margin={{ left: 20, right: 40 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                    <XAxis type="number" tick={{ fontSize: 11 }} />
                    <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v) => v.toLocaleString("it-IT")} />
                    <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                      {chart.data.map((_, i) => <Cell key={i} fill={PALETTE[(i + ci) % PALETTE.length]} />)}
                      <LabelList dataKey="value" position="right" formatter={numLabel} style={{ fontSize: 10, fill: "#555" }} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ))}

            {dimCharts.length > 0 && (
              <div className="chart-card">
                <div className="chart-card-title">Distribuzione per {dimCharts[0].label.toLowerCase()}</div>
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie
                      data={dimCharts[0].data}
                      dataKey="value"
                      nameKey="name"
                      innerRadius="45%"
                      outerRadius="75%"
                      paddingAngle={2}
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      labelLine={false}
                    >
                      {dimCharts[0].data.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v) => v.toLocaleString("it-IT")} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}

            {comparisonData.length > 0 && (
              <div className="chart-card chart-card--wide">
                <div className="chart-card-title">Consuntivo vs Budget — per {dimCharts[0].label.toLowerCase()}</div>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={comparisonData} margin={{ top: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v) => v.toLocaleString("it-IT")} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="consuntivo" name="Consuntivo" fill={DARK} radius={[4, 4, 0, 0]}>
                      <LabelList dataKey="consuntivo" position="top" formatter={numLabel} style={{ fontSize: 10, fill: "#555" }} />
                    </Bar>
                    <Bar dataKey="budget" name="Budget" fill={RED} radius={[4, 4, 0, 0]}>
                      <LabelList dataKey="budget" position="top" formatter={numLabel} style={{ fontSize: 10, fill: "#555" }} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            <div className="chart-card chart-card--wide">
              <div className="chart-card-title">Distribuzione mensile</div>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={byMonth} margin={{ top: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v) => v.toLocaleString("it-IT")} />
                  <Bar dataKey="value" fill={RED} radius={[4, 4, 0, 0]}>
                    <LabelList dataKey="value" position="top" formatter={numLabel} style={{ fontSize: 10, fill: "#555" }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="chart-card-title" style={{ margin: "22px 0 10px" }}>
            Dettaglio righe {detailRows.length < filteredRows.length ? `(prime ${detailRows.length} di ${filteredRows.length})` : ""}
          </div>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  {orderedDimKeys.map((k) => <th key={k}>{DIM_LABELS[k] || k}</th>)}
                  <th>Importo ({selectedBudget?.currencyCode})</th>
                  <th>Quantità</th>
                  <th>Prezzo</th>
                </tr>
              </thead>
              <tbody>
                {detailRows.map((r) => (
                  <tr key={JSON.stringify(r.dims)}>
                    {orderedDimKeys.map((k) => <td key={k}>{r.dims[k]}</td>)}
                    <td className="num">{numLabel(r.totalAmount)}</td>
                    <td className="num">{numLabel(r.totalQuantity)}</td>
                    <td className="num">{r.price.toLocaleString("it-IT", { maximumFractionDigits: 3 })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}