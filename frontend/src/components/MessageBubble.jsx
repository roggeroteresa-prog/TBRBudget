import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const SOURCE_BADGES = {
  knowledge_base: { label: "Documentazione", className: "source-badge--kb" },
  data_agent: { label: "Dati", className: "source-badge--data" },
  budget_action: { label: "Azione", className: "source-badge--action" },
};

export default function MessageBubble({ role, content, chartUrl, sources }) {
  const isUser = role === "user";
  const badges = (sources || []).map((s) => SOURCE_BADGES[s]).filter(Boolean);

  return (
    <div className={`message-row ${isUser ? "message-row--user" : "message-row--assistant"}`}>
      <div className={`message-bubble ${isUser ? "message-bubble--user" : "message-bubble--assistant"}`}>
        {badges.length > 0 && (
          <div className="source-badges">
            {badges.map((b, i) => (
              <span key={i} className={`source-badge ${b.className}`}>{b.label}</span>
            ))}
          </div>
        )}
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
        {chartUrl && (
          <img
            className="message-chart"
            src={chartUrl}
            alt="Grafico generato dall'agente dati"
          />
        )}
      </div>
    </div>
  );
}
