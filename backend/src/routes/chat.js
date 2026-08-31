import { Router } from "express";
import { handleChatMessage, resetSession } from "../services/orchestrator.js";
import { chatLimiter } from "../middleware/rateLimit.js";

const router = Router();

// POST /api/chat  { sessionId: string, message: string }
// req.user è impostato dal middleware requireAuth (token JWT verificato)
router.post("/chat", chatLimiter, async (req, res) => {
  const { sessionId, message } = req.body || {};

  if (!sessionId || !message) {
    return res.status(400).json({ error: "sessionId e message sono obbligatori." });
  }

  try {
    const { reply, chartUrl, sources } = await handleChatMessage(sessionId, message, req.user);
    res.json({ reply, chartUrl, sources });
  } catch (err) {
    console.error("Errore in /api/chat:", err);
    res.status(500).json({ error: "Errore interno durante l'elaborazione del messaggio." });
  }
});

// POST /api/chat/reset  { sessionId: string }
router.post("/chat/reset", (req, res) => {
  const { sessionId } = req.body || {};
  if (sessionId) resetSession(sessionId);
  res.json({ ok: true });
});

export default router;
