import { Fragment, useEffect, useRef, useState } from "react";
import { IconChevron } from "../components/Icons.jsx";

const MONTH_LABELS = ["Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic"];

function editableFieldsFor(fixedFactor) {
  if (fixedFactor === "QUANTITA") return ["amount", "price"];
  if (fixedFactor === "IMPORTO") return ["quantity", "price"];
  return ["amount", "quantity"]; // PREZZO fisso (default)
}

function fixedFieldFor(fixedFactor) {
  if (fixedFactor === "QUANTITA") return "quantity";
  if (fixedFactor === "IMPORTO") return "amount";
  return "price";
}

function fmt(n, digits = 0) {
  return Number(n || 0).toLocaleString("it-IT", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function priceOf(amount, quantity) {
  return quantity ? amount / quantity : 0;
}

/** Arrotonda per la visualizzazione negli input, evitando artefatti di
 * floating point (es. 999.9999999999999) generati dalla ridistribuzione. */
function roundFor(field, value) {
  const digits = field === "price" ? 3 : 2;
  const factor = 10 ** digits;
  return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
}

/** Formatta un numero con punti delle migliaia e virgola decimale (stile it-IT). */
function formatItNumber(n, digits) {
  return Number(n || 0).toLocaleString("it-IT", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

/** Converte il testo digitato (con eventuali punti/virgola it-IT) in una
 * stringa numerica "pulita" (punto come separatore decimale). */
function parseItNumber(raw) {
  return String(raw ?? "").replace(/\./g, "").replace(",", ".");
}

/**
 * Input numerico con punti delle migliaia: mostra il valore formattato
 * (es. 6.679.363,47) quando non è a fuoco; mentre l'utente digita mostra
 * il testo "semplice" così com'è scritto (niente mascheramento live, per
 * evitare che i punti già inseriti confondano la formattazione al
 * carattere successivo), e riformatta appena il campo perde il focus.
 */
function NumericCellInput({ value, digits, onCommit }) {
  const [text, setText] = useState(() => (value ? formatItNumber(value, digits) : ""));
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setText(value ? formatItNumber(value, digits) : "");
  }, [value, digits]);

  return (
    <input
      type="text"
      inputMode="decimal"
      value={text}
      onFocus={(e) => {
        focused.current = true;
        e.target.select();
      }}
      onBlur={() => {
        focused.current = false;
        setText(value ? formatItNumber(value, digits) : "");
      }}
      onChange={(e) => {
        setText(e.target.value);
        onCommit(parseItNumber(e.target.value));
      }}
    />
  );
}

function sumArrays(rows, field) {
  const totals = Array(12).fill(0);
  rows.forEach((r) => {
    const arr = field === "amount" ? r.monthlyAmount : r.monthlyQuantity;
    arr.forEach((v, i) => (totals[i] += v));
  });
  return totals;
}

/**
 * Tabella pivot con drill-down. Tutte le righe sono sempre editabili
 * (Importo/Quantità/Prezzo, tranne il Fattore Fisso che è calcolato):
 * modificando una riga aggregata, il nuovo valore viene ridistribuito in
 * modo proporzionale sulle righe di dettaglio sottostanti (gestito dal
 * chiamante in onCellChange).
 */
export default function PivotDrilldownTable({ rows, view, currencyCode, fixedFactor, readOnly, onDrill, onCellChange }) {
  const editableFields = editableFieldsFor(fixedFactor);
  const fixedField = fixedFieldFor(fixedFactor);

  if (!rows.length) {
    return <div className="empty-state">Nessuna riga di budget in questo livello/filtro. Usa "+ Aggiungi Riga".</div>;
  }

  function renderCell(row, field, value, monthIndex = null) {
    if (!editableFields.includes(field) || readOnly) {
      return <span>{fmt(value, field === "price" ? 3 : 0)}</span>;
    }
    const digits = field === "price" ? 3 : 2;
    const rounded = roundFor(field, value);
    return (
      <NumericCellInput
        value={rounded}
        digits={digits}
        onCommit={(raw) => onCellChange(row, field, monthIndex, raw)}
      />
    );
  }

  const cellClass = (field) => (field === fixedField ? "cell-fixed" : "");

  // ── Totali di riepilogo in fondo alla tabella ──
  const totalConsAmount = rows.reduce((s, r) => s + r.consAmount, 0);
  const totalConsQuantity = rows.reduce((s, r) => s + r.consQuantity, 0);
  const totalAmount = rows.reduce((s, r) => s + r.totalAmount, 0);
  const totalQuantity = rows.reduce((s, r) => s + r.totalQuantity, 0);
  const totalPrice = priceOf(totalAmount, totalQuantity);

  if (view === "totale") {
    return (
      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th>{rows[0].label}</th>
              <th>Cons. Importo</th>
              <th>Cons. Qtà</th>
              <th className={cellClass("amount")}>Importo ({currencyCode})</th>
              <th className={cellClass("quantity")}>Quantità</th>
              <th className={cellClass("price")}>Prezzo</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const price = priceOf(r.totalAmount, r.totalQuantity);
              return (
                <tr key={r.key}>
                  <td>{r.value}</td>
                  <td className="num cell-cons">{fmt(r.consAmount)}</td>
                  <td className="num cell-cons">{fmt(r.consQuantity)}</td>
                  <td className={`num ${cellClass("amount")}`}>{renderCell(r, "amount", r.totalAmount)}</td>
                  <td className={`num ${cellClass("quantity")}`}>{renderCell(r, "quantity", r.totalQuantity)}</td>
                  <td className={`num ${cellClass("price")}`}>{renderCell(r, "price", price)}</td>
                  <td>
                    {r.canDrill && (
                      <button className="drill-btn" onClick={() => onDrill(r)}>
                        {r.nextDimLabel} <IconChevron width={12} height={12} />
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="pivot-totals-row">
              <td>TOTALE</td>
              <td className="num cell-cons">{fmt(totalConsAmount)}</td>
              <td className="num cell-cons">{fmt(totalConsQuantity)}</td>
              <td className="num">{fmt(totalAmount)}</td>
              <td className="num">{fmt(totalQuantity)}</td>
              <td className="num">{fmt(totalPrice, 3)}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>
    );
  }

  // Vista mensile: 3 sotto-righe (Importo/Quantità/Prezzo) per gruppo
  const totalsAmountByMonth = sumArrays(rows, "amount");
  const totalsQuantityByMonth = sumArrays(rows, "quantity");
  const totalsPriceByMonth = totalsAmountByMonth.map((a, i) => priceOf(a, totalsQuantityByMonth[i]));

  return (
    <div className="table-scroll">
      <table className="pivot-table editable-pivot">
        <thead>
          <tr>
            <th>{rows[0].label}</th>
            <th>Cons. Importo</th>
            <th>Cons. Qtà</th>
            <th>Misura</th>
            {MONTH_LABELS.map((m) => <th key={m}>{m}</th>)}
            <th className="pivot-total-col">Totale</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const priceByMonth = r.monthlyAmount.map((a, i) => priceOf(a, r.monthlyQuantity[i]));
            const totalPriceRow = priceOf(r.totalAmount, r.totalQuantity);
            return (
              <Fragment key={r.key}>
                <tr>
                  <td rowSpan={3}>{r.value}</td>
                  <td rowSpan={3} className="num cell-cons">{fmt(r.consAmount)}</td>
                  <td rowSpan={3} className="num cell-cons">{fmt(r.consQuantity)}</td>
                  <td className={`row-label ${cellClass("amount")}`}>Importo</td>
                  {r.monthlyAmount.map((v, i) => (
                    <td key={i} className={cellClass("amount")}>{renderCell(r, "amount", v, i)}</td>
                  ))}
                  <td className="num pivot-total-col"><strong>{fmt(r.totalAmount)}</strong></td>
                  <td rowSpan={3}>
                    {r.canDrill && (
                      <button className="drill-btn" onClick={() => onDrill(r)}>
                        {r.nextDimLabel} <IconChevron width={12} height={12} />
                      </button>
                    )}
                  </td>
                </tr>
                <tr>
                  <td className={`row-label ${cellClass("quantity")}`}>Quantità</td>
                  {r.monthlyQuantity.map((v, i) => (
                    <td key={i} className={cellClass("quantity")}>{renderCell(r, "quantity", v, i)}</td>
                  ))}
                  <td className="num pivot-total-col"><strong>{fmt(r.totalQuantity)}</strong></td>
                </tr>
                <tr>
                  <td className={`row-label ${cellClass("price")}`}>Prezzo</td>
                  {priceByMonth.map((v, i) => (
                    <td key={i} className={cellClass("price")}>{renderCell(r, "price", v, i)}</td>
                  ))}
                  <td className="num pivot-total-col"><strong>{fmt(totalPriceRow, 3)}</strong></td>
                </tr>
              </Fragment>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="pivot-totals-row">
            <td rowSpan={3}>TOTALE</td>
            <td rowSpan={3} className="num cell-cons">{fmt(totalConsAmount)}</td>
            <td rowSpan={3} className="num cell-cons">{fmt(totalConsQuantity)}</td>
            <td className="row-label">Importo</td>
            {totalsAmountByMonth.map((v, i) => <td key={i} className="num">{fmt(v)}</td>)}
            <td className="num pivot-total-col"><strong>{fmt(totalAmount)}</strong></td>
            <td></td>
          </tr>
          <tr className="pivot-totals-row">
            <td className="row-label">Quantità</td>
            {totalsQuantityByMonth.map((v, i) => <td key={i} className="num">{fmt(v)}</td>)}
            <td className="num pivot-total-col"><strong>{fmt(totalQuantity)}</strong></td>
          </tr>
          <tr className="pivot-totals-row">
            <td className="row-label">Prezzo</td>
            {totalsPriceByMonth.map((v, i) => <td key={i} className="num">{fmt(v, 3)}</td>)}
            <td className="num pivot-total-col"><strong>{fmt(totalPrice, 3)}</strong></td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
