import { Router } from "express";
import { z } from "zod";
import * as userStore from "../services/userStore.js";
import { signToken, verifyToken } from "../services/authService.js";
import { validateBody } from "../middleware/validate.js";
import rateLimit from "express-rate-limit";

const router = Router();

// Limita i tentativi di login (protezione minima contro il brute-force)
const loginLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Troppi tentativi di accesso. Riprova tra qualche minuto." },
});

const loginSchema = z.object({
  email: z.string().trim().email("Email non valida."),
  password: z.string().min(1, "La password è obbligatoria."),
});

// POST /api/auth/login  { email, password }
router.post("/auth/login", loginLimiter, validateBody(loginSchema), async (req, res) => {
  const { email, password } = req.body;
  const user = await userStore.verifyCredentials(email, password);
  if (!user) {
    return res.status(401).json({ error: "Email o password non corrette." });
  }
  const token = signToken(user);
  res.json({ token, user });
});

// GET /api/auth/me — usata dal front end per ripristinare la sessione al refresh
router.get("/auth/me", (req, res) => {
  const header = req.header("Authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Nessun token." });

  const payload = verifyToken(token);
  if (!payload?.sub) return res.status(401).json({ error: "Sessione non valida." });

  const user = userStore.getUser(payload.sub);
  if (!user) return res.status(401).json({ error: "Utente non trovato." });
  res.json({ user });
});

export default router;
