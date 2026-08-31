import "dotenv/config";
import express from "express";
import cors from "cors";
import authRouter from "./routes/auth.js";
import chatRouter from "./routes/chat.js";
import budgetsRouter from "./routes/budgets.js";
import usersRouter from "./routes/users.js";
import historyRouter from "./routes/history.js";
import { requireAuth } from "./middleware/auth.js";
import { ensureCollectionPopulated } from "./services/ragService.js";

const app = express();

app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => res.json({ status: "ok" }));

// Login pubblico (nessuna autenticazione necessaria per autenticarsi).
app.use("/api", authRouter);

// Tutto il resto richiede un token JWT valido: requireAuth verifica firma e
// scadenza del token, poi carica l'utente fresco (ruolo/permessi aggiornati)
// in req.user, usato da tutte le rotte sottostanti.
app.use("/api", requireAuth, chatRouter);
app.use("/api", requireAuth, budgetsRouter);
app.use("/api", requireAuth, usersRouter);
app.use("/api", requireAuth, historyRouter);

const PORT = process.env.PORT || 4000;
app.listen(PORT, async () => {
  console.log(`Back end TBR Budget Agent in ascolto su http://localhost:${PORT}`);
  // Controlla subito la knowledge base e la re-indicizza se risulta vuota
  // (es. ChromaDB ripartito senza disco persistente sul piano Free di Render).
  await ensureCollectionPopulated({ force: true });
});
