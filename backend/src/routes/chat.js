import { Router } from "express";
import { handleChatMessage, resetSession } from "../services/orchestrator.js";
import * as userStore from "../services/userStore.js";

const router = Router();

function getActingUser(req) {
  const userId = req.header("x-user-id");
  const user = userId ? userStore.getUser(userId) : null;
  return user || userStore.getDefaultUser();
}

// POST /api/chat  { sessionId: string, message: string }
router.post("/chat", async (req, res) => {
  const { sessionId, message } = req.body || {};

  if (!sessionId || !message) {
    return res.status(400).json({ error: "sessionId e message sono obbligatori." });
  }

  try {
    const actingUser = getActingUser(req);
    const { reply, chartUrl, sources } = await handleChatMessage(sessionId, message, actingUser);
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
