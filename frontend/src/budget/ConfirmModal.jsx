export default function ConfirmModal({ open, title, message, confirmLabel = "Conferma", onConfirm, onClose, danger = false }) {
  if (!open) return null;
  return (
    <div className="modal-overlay">
      <div className="modal-box modal-box--small">
        <div className="modal-header">
          <h3>{title}</h3>
          <button className="modal-close" onClick={onClose}>✖</button>
        </div>
        <div className="modal-body">
          <p>{message}</p>
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Annulla</button>
          <button className={`btn ${danger ? "btn-danger" : "btn-primary"}`} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
