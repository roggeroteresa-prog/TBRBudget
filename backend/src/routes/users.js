import { Router } from "express";
import * as users from "../services/userStore.js";

const router = Router();

router.get("/users", (_req, res) => {
  res.json(users.listUsers());
});

router.get("/users/:id", (req, res) => {
  const user = users.getUser(req.params.id);
  if (!user) return res.status(404).json({ error: "Utente non trovato." });
  res.json(user);
});

router.post("/users", (req, res) => {
  try {
    const user = users.createUser(req.body || {});
    res.status(201).json(user);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put("/users/:id", (req, res) => {
  const updated = users.updateUser(req.params.id, req.body || {});
  if (!updated) return res.status(404).json({ error: "Utente non trovato." });
  res.json(updated);
});

router.delete("/users/:id", (req, res) => {
  try {
    users.deleteUser(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
