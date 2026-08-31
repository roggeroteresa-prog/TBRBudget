import rateLimit from "express-rate-limit";

/**
 * Limita il numero di chiamate alle rotte che invocano l'LLM (costo e
 * rischio di abuso altrimenti illimitati). Chiave per IP: è la scelta più
 * semplice e robusta indipendentemente dal meccanismo di autenticazione in
 * uso — con l'autenticazione reale si può affinare per-utente in aggiunta.
 */
export const chatLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minuti
  limit: 30, // max 30 messaggi in chat ogni 5 minuti per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Troppe richieste alla chat in poco tempo. Riprova tra qualche minuto." },
});

export const suggestLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: 15, // il suggerimento AI è più costoso (RAG + data agent combinati)
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Troppe richieste di suggerimento in poco tempo. Riprova tra qualche minuto." },
});
