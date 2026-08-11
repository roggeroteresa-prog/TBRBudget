import StatusBadge from "./StatusBadge.jsx";
import { IconEdit, IconClock, IconTrash, IconSettings } from "../components/Icons.jsx";

function formatDate(date) {
  if (!date) return "—";
  const [y, m, d] = date.split("-");
  return `${d}/${m}/${y}`;
}

export default function BudgetTable({ budgets, onOpen, onEdit, onStatus, onDelete, onConfig, readOnly = false }) {
  if (!budgets.length) {
    return <div className="empty-state">Nessun budget creato. Crea il primo con "Nuovo Budget".</div>;
  }

  return (
    <div className="table-scroll">
      <table className="data-table">
        <thead>
          <tr>
            <th>Budget</th>
            <th>Anno</th>
            <th>Periodo</th>
            <th>Valuta</th>
            <th>Fattore fisso</th>
            <th>Stato</th>
            <th>Creato il</th>
            {!readOnly && <th></th>}
          </tr>
        </thead>
        <tbody>
          {budgets.map((b) => (
            <tr key={b.id}>
              <td>
                <button className="link-button" onClick={() => onOpen(b)}>
                  {b.budgetName}
                </button>
              </td>
              <td>{b.budgetYear}</td>
              <td>
                {formatDate(b.startDate)} → {formatDate(b.endDate)}
              </td>
              <td>{b.currencyCode}</td>
              <td>{b.fixedFactor}</td>
              <td><StatusBadge status={b.status} /></td>
              <td>{formatDate(b.createdAt?.slice(0, 10))}</td>
              {!readOnly && (
                <td>
                  <div className="row-actions">
                    <button className="btn-icon-only" title="Modifica" onClick={() => onEdit(b)}><IconEdit width={15} height={15} /></button>
                    <button className="btn-icon-only" title="Stato" onClick={() => onStatus(b)}><IconClock width={15} height={15} /></button>
                    <button className="btn-icon-only" title="Elimina" onClick={() => onDelete(b)}><IconTrash width={15} height={15} /></button>
                    <button className="btn-icon-only btn-icon-only--accent" title="Configura" onClick={() => onConfig(b)}><IconSettings width={15} height={15} /></button>
                  </div>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
