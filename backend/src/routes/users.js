import { Router } from "express";
import * as users from "../services/userStore.js";

const router = Router();

// Tutte le rotte utenti sono riservate agli amministratori: la gestione di
// ruoli e credenziali altrui non deve essere accessibile a nessun altro,
// applicato qui lato back end (non solo nascosto lato interfaccia).
function requireAdmin(req, res, next) {
  if (req.user?.role !== "admin") {
    return res.status(403).json({ error: "Solo un amministratore può gestire gli utenti." });
  }
  next();
}

router.get("/users", requireAdmin, (_req, res) => {
  res.json(users.listUsers());
});

router.get("/users/:id", requireAdmin, (req, res) => {
  const user = users.getUser(req.params.id);
  if (!user) return res.status(404).json({ error: "Utente non trovato." });
  res.json(user);
});

router.post("/users", requireAdmin, async (req, res) => {
  try {
    const user = await users.createUser(req.body || {});
    res.status(201).json(user);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put("/users/:id", requireAdmin, async (req, res) => {
  try {
    const updated = await users.updateUser(req.params.id, req.body || {});
    if (!updated) return res.status(404).json({ error: "Utente non trovato." });
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete("/users/:id", requireAdmin, (req, res) => {
  try {
    users.deleteUser(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
