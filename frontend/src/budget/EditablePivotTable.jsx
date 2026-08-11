import { Fragment } from "react";
import { IconTrash } from "../components/Icons.jsx";

const MONTH_LABELS = ["Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic"];
const DIM_ORDER = ["macroarea", "country", "customer", "category", "product"];
const DIM_LABELS = {
  macroarea: "Macroarea",
  country: "Paese",
  customer: "Cliente",
  category: "Categoria Prodotto",
  product: "Prodotto",
};

function fmt(n, digits = 0) {
  return Number(n || 0).toLocaleString("it-IT", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function rowKey(r) {
  const sortedKeys = Object.keys(r.dims).sort();
  return JSON.stringify(r.dims, sortedKeys);
}

export default function EditablePivotTable({ rows, view, currencyCode, activeDims, onCellChange, onDeleteRow }) {
  const orderedDims = DIM_ORDER.filter((k) => activeDims.includes(k));

  if (!rows.length) {
    return <div className="empty-state">Nessuna riga di budget ancora inserita. Usa "+ Aggiungi Riga".</div>;
  }

  if (view === "totale") {
    return (
      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              {orderedDims.map((k) => <th key={k}>{DIM_LABELS[k]}</th>)}
              <th>Importo ({currencyCode})</th>
              <th>Quantità</th>
              <th>Prezzo medio</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const avg = r.totalQuantity > 0 ? r.totalAmount / r.totalQuantity : 0;
              return (
                <tr key={rowKey(r)}>
                  {orderedDims.map((k) => <td key={k}>{r.dims[k]}</td>)}
                  <td className="num">{fmt(r.totalAmount)}</td>
                  <td className="num">{fmt(r.totalQuantity)}</td>
                  <td className="num">{fmt(avg, 2)}</td>
                  <td><button className="btn-icon-only" onClick={() => onDeleteRow(r)}><IconTrash width={14} height={14} /></button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  // Vista mensile: griglia editabile Importo/Quantità per ciascun gruppo
  return (
    <div className="table-scroll">
      <table className="pivot-table editable-pivot">
        <thead>
          <tr>
            {orderedDims.map((k) => <th key={k}>{DIM_LABELS[k]}</th>)}
            <th>Misura</th>
            {MONTH_LABELS.map((m) => <th key={m}>{m}</th>)}
            <th className="pivot-total-col">Totale</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const key = rowKey(r);
            const totalAmt = r.monthlyAmount.reduce((a, b) => a + b, 0);
            const totalQty = r.monthlyQuantity.reduce((a, b) => a + b, 0);
            return (
              <Fragment key={key}>
                <tr>
                  {orderedDims.map((k) => <td rowSpan={2} key={k}>{r.dims[k]}</td>)}
                  <td className="row-label">Importo</td>
                  {r.monthlyAmount.map((v, i) => (
                    <td key={i}>
                      <input type="number" value={v || ""} onChange={(e) => onCellChange(key, "amount", i, e.target.value)} />
                    </td>
                  ))}
                  <td className="num pivot-total-col"><strong>{fmt(totalAmt)}</strong></td>
                  <td rowSpan={2}><button className="btn-icon-only" onClick={() => onDeleteRow(r)}><IconTrash width={14} height={14} /></button></td>
                </tr>
                <tr>
                  <td className="row-label">Quantità</td>
                  {r.monthlyQuantity.map((v, i) => (
                    <td key={i}>
                      <input type="number" value={v || ""} onChange={(e) => onCellChange(key, "quantity", i, e.target.value)} />
                    </td>
                  ))}
                  <td className="num pivot-total-col"><strong>{fmt(totalQty)}</strong></td>
                </tr>
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
