import { useEffect, useRef, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import MessageBubble from "./MessageBubble.jsx";
import TypingIndicator from "./TypingIndicator.jsx";
import { getActiveUserId } from "../currentUser.js";

// Stesso meccanismo di budget/api.js: "/api" in sviluppo (proxy Vite),
// URL completo del back end pubblicato in produzione via VITE_API_BASE_URL.
const API_BASE = import.meta.env.VITE_API_BASE_URL || "/api";

const WELCOME_MESSAGE = {
  role: "assistant",
  content:
    "Ciao! Sono l'assistente Sales & Budget di TBR Budget Group. Posso rispondere a domande su policy/procedure e sul consuntivo vendite, oppure aiutarti a creare, configurare e modificare i budget direttamente da qui.",
};

export default function ChatWindow() {
  const [messages, setMessages] = useState([WELCOME_MESSAGE]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const sessionIdRef = useRef(uuidv4()); // memoria conversazionale lato back end
  const scrollRef = useRef(null);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  async function sendMessage(e) {
    e.preventDefault();
    const text = input.trim();
    if (!text || isLoading) return;

    const userMessage = { role: "user", content: text };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    try {
      const res = await fetch(`${API_BASE}/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(getActiveUserId() ? { "x-user-id": getActiveUserId() } : {}),
        },
        body: JSON.stringify({ sessionId: sessionIdRef.current, message: text }),
      });

      if (!res.ok) throw new Error(`Errore server: ${res.status}`);

      const data = await res.json();
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.reply, chartUrl: data.chartUrl || null, sources: data.sources || [] },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            "Si è verificato un errore nel contattare il back end. Verifica che i servizi siano avviati (vedi README).",
        },
      ]);
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleNewConversation() {
    if (isLoading) return;
    try {
      await fetch(`${API_BASE}/chat/reset`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: sessionIdRef.current }),
      });
    } catch (err) {
      console.error(err);
    }
    sessionIdRef.current = uuidv4();
    setMessages([WELCOME_MESSAGE]);
  }

  return (
    <div className="chat-window">
      <div className="chat-header">
        <span className="chat-header-title">Assistente Sales &amp; Budget</span>
        <button className="chat-reset-btn" onClick={handleNewConversation} disabled={isLoading}>
          + Nuova conversazione
        </button>
      </div>

      <div className="chat-messages">
        {messages.map((m, i) => (
          <MessageBubble key={i} role={m.role} content={m.content} chartUrl={m.chartUrl} sources={m.sources} />
        ))}
        {isLoading && <TypingIndicator />}
        <div ref={scrollRef} />
      </div>

      <form className="chat-input-bar" onSubmit={sendMessage}>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Scrivi un messaggio..."
          disabled={isLoading}
        />
        <button type="submit" disabled={isLoading || !input.trim()}>
          Invia
        </button>
      </form>
    </div>
  );
}