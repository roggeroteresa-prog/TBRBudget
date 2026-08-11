import { IconCheck, IconClock } from "../components/Icons.jsx";

export default function StatusBadge({ status }) {
  const isConfirmed = status === "Confermato";
  return (
    <span className={`status-badge ${isConfirmed ? "status-badge--confirmed" : "status-badge--draft"}`}>
      {isConfirmed ? <IconCheck width={12} height={12} /> : <IconClock width={12} height={12} />}
      {isConfirmed ? "Confermato" : "Bozza"}
    </span>
  );
}
