import { Router } from "express";
import * as store from "../services/budgetStore.js";
import * as userStore from "../services/userStore.js";
import { getDimensions } from "../services/dimensionsService.js";
import { suggestBudgetLine } from "../services/suggestionService.js";
import { getCurrencyAnalysis } from "../services/salesDataService.js";
import { generateBaseBudget, getConsolidatoAggregation } from "../services/baseBudgetService.js";
import { fetchLiveRates } from "../services/currencyRatesService.js";
import { suggestLimiter } from "../middleware/rateLimit.js";
import { validateBody } from "../middleware/validate.js";
import {
  createBudgetSchema,
  updateBudgetSchema,
  statusSchema,
  generateBaseBudgetSchema,
  lineBodySchema,
  consolidatoSchema,
  suggestSchema,
} from "../validation/schemas.js";

const router = Router();

function buildMonthlyLines(dims, { distribution, amount, quantity, monthlyAmounts, monthlyQuantities }) {
  const linesToCreate = [];
  if (distribution === "monthly") {
    for (let m = 1; m <= 12; m++) {
      const amt = Number(monthlyAmounts?.[m]) || 0;
      const qty = Number(monthlyQuantities?.[m]) || 0;
      if (amt > 0 || qty > 0) {
        linesToCreate.push({ dims, month: m, amount: amt, quantity: qty });
      }
    }
  } else {
    const totalAmount = Number(amount) || 0;
    const totalQuantity = Number(quantity) || 0;
    for (let m = 1; m <= 12; m++) {
      linesToCreate.push({ dims, month: m, amount: totalAmount / 12, quantity: totalQuantity / 12 });
    }
  }
  return linesToCreate;
}

// ─── Dimensioni (dropdown + filtri incrociati) ──────────────────────────
router.get("/dimensions", (_req, res) => {
  res.json(getDimensions());
});

// ─── Budget ─────────────────────────────────────────────────────────────
router.get("/budgets", (req, res) => {
  const user = req.user;
  const budgets = store.listBudgets().filter((b) => userStore.canViewBudget(user, b.id));
  res.json(budgets);
});

router.get("/budgets/:id", (req, res) => {
  const budget = store.getBudget(req.params.id);
  if (!budget) return res.status(404).json({ error: "Budget non trovato." });
  const user = req.user;
  if (!userStore.canViewBudget(user, budget.id)) return res.status(403).json({ error: "Non hai i permessi per vedere questo budget." });
  res.json(budget);
});

router.post("/budgets", validateBody(createBudgetSchema), (req, res) => {
  const user = req.user;
  if (user && user.role === "viewer") return res.status(403).json({ error: "Il tuo ruolo (Visualizzatore) non permette di creare budget." });

  const budget = store.createBudget(req.body, user?.name);
  res.status(201).json(budget);
});

router.put("/budgets/:id", validateBody(updateBudgetSchema), (req, res) => {
  const budget = store.getBudget(req.params.id);
  if (!budget) return res.status(404).json({ error: "Budget non trovato." });
  const user = req.user;
  if (!userStore.canEditBudget(user, budget.id)) return res.status(403).json({ error: "Non hai i permessi per modificare questo budget." });

  try {
    const updated = store.updateBudget(req.params.id, req.body || {}, user?.name);
    res.json(updated);
  } catch (err) {
    res.status(409).json({ error: err.message });
  }
});

router.patch("/budgets/:id/status", validateBody(statusSchema), (req, res) => {
  const budget = store.getBudget(req.params.id);
  if (!budget) return res.status(404).json({ error: "Budget non trovato." });
  const user = req.user;
  if (!userStore.canEditBudget(user, budget.id)) return res.status(403).json({ error: "Non hai i permessi per modificare questo budget." });

  const updated = store.setBudgetStatus(req.params.id, req.body.status, user?.name);
  res.json(updated);
});

router.delete("/budgets/:id", (req, res) => {
  const budget = store.getBudget(req.params.id);
  if (!budget) return res.status(404).json({ error: "Budget non trovato." });
  const user = req.user;
  if (!userStore.canEditBudget(user, budget.id)) return res.status(403).json({ error: "Non hai i permessi per eliminare questo budget." });

  store.deleteBudget(req.params.id, user?.name);
  res.json({ ok: true });
});

// ─── Configurazione: analisi valute nel periodo consuntivo (+ tasso live) ──
router.get("/budgets/:id/currency-analysis", async (req, res) => {
  const budget = store.getBudget(req.params.id);
  if (!budget) return res.status(404).json({ error: "Budget non trovato." });
  const user = req.user;
  if (!userStore.canViewBudget(user, budget.id)) return res.status(403).json({ error: "Non hai i permessi per vedere questo budget." });

  const analysis = getCurrencyAnalysis(budget.startDate, budget.endDate, budget.currencyCode);

  let liveRates = {};
  if (analysis.length) {
    try {
      liveRates = await fetchLiveRates(budget.currencyCode, analysis.map((a) => a.code));
    } catch (err) {
      console.warn("Tassi live non disponibili (Frankfurter API):", err.message);
    }
  }

  const currencies = analysis.map((a) => ({ ...a, liveRate: liveRates[a.code] ?? null }));
  res.json({ baseCurrency: budget.currencyCode, currencies });
});

// ─── Configurazione: generazione base budget (riponderazione proporzionale) ─
router.post("/budgets/:id/generate-base-budget", validateBody(generateBaseBudgetSchema), (req, res) => {
  const budget = store.getBudget(req.params.id);
  if (!budget) return res.status(404).json({ error: "Budget non trovato." });
  const user = req.user;
  if (!userStore.canEditBudget(user, budget.id)) return res.status(403).json({ error: "Non hai i permessi per modificare questo budget." });

  const { totalAmount, totalQuantity } = req.body;
  const { lines, meta } = generateBaseBudget(budget, { totalAmount, totalQuantity });
  try {
    store.replaceAllLines(budget.id, lines, user?.name);
    store.updateBudget(budget.id, { initialTargets: { totalAmount: totalAmount || 0, totalQuantity: totalQuantity || 0 } }, user?.name);
  } catch (err) {
    return res.status(409).json({ error: err.message });
  }

  res.json({ linesGenerated: lines.length, ...meta });
});

// ─── Righe di budget ──────────────────────────────────────────────────
router.get("/budgets/:id/lines", (req, res) => {
  const budget = store.getBudget(req.params.id);
  if (!budget) return res.status(404).json({ error: "Budget non trovato." });
  const user = req.user;
  if (!userStore.canViewBudget(user, budget.id)) return res.status(403).json({ error: "Non hai i permessi per vedere questo budget." });
  res.json(store.listLines(req.params.id));
});

router.post("/budgets/:id/lines", validateBody(lineBodySchema), (req, res) => {
  const budgetId = req.params.id;
  const budget = store.getBudget(budgetId);
  if (!budget) return res.status(404).json({ error: "Budget non trovato." });
  const user = req.user;
  if (!userStore.canEditBudget(user, budget.id)) return res.status(403).json({ error: "Non hai i permessi per modificare questo budget." });

  const { dims, ...rest } = req.body;
  if (store.lineExists(budgetId, dims)) {
    return res.status(409).json({
      error: "Questa combinazione di dimensioni esiste già in questo budget. Modificala dalla tabella.",
    });
  }

  const linesToCreate = buildMonthlyLines(dims, rest);
  if (linesToCreate.length === 0) {
    return res.status(400).json({ error: "Inserisci almeno un valore di importo/quantità." });
  }

  try {
    const created = store.addLines(budgetId, linesToCreate, user?.name);
    res.status(201).json(created);
  } catch (err) {
    res.status(409).json({ error: err.message });
  }
});

// Upsert: sostituisce le righe mensili esistenti per una combinazione di
// dimensioni (usato dalla tabella editabile in "Budget dei Ricavi").
router.put("/budgets/:id/lines", validateBody(lineBodySchema), (req, res) => {
  const budgetId = req.params.id;
  const budget = store.getBudget(budgetId);
  if (!budget) return res.status(404).json({ error: "Budget non trovato." });
  const user = req.user;
  if (!userStore.canEditBudget(user, budget.id)) return res.status(403).json({ error: "Non hai i permessi per modificare questo budget." });

  const { dims, ...rest } = req.body;
  const linesToCreate = buildMonthlyLines(dims, rest);
  try {
    const updated = store.upsertLines(budgetId, dims, linesToCreate, user?.name);
    res.json(updated);
  } catch (err) {
    res.status(409).json({ error: err.message });
  }
});

router.delete("/budgets/:id/lines/:lineId", (req, res) => {
  const budget = store.getBudget(req.params.id);
  if (!budget) return res.status(404).json({ error: "Budget non trovato." });
  const user = req.user;
  if (!userStore.canEditBudget(user, budget.id)) return res.status(403).json({ error: "Non hai i permessi per eliminare questo budget." });

  try {
    store.deleteLine(req.params.id, req.params.lineId, user?.name);
    res.json({ ok: true });
  } catch (err) {
    res.status(409).json({ error: err.message });
  }
});

// ─── Vista pivot aggregata ──────────────────────────────────────────────
router.get("/budgets/:id/pivot", (req, res) => {
  const budget = store.getBudget(req.params.id);
  if (!budget) return res.status(404).json({ error: "Budget non trovato." });
  const user = req.user;
  if (!userStore.canViewBudget(user, budget.id)) return res.status(403).json({ error: "Non hai i permessi per vedere questo budget." });
  res.json(store.getPivot(req.params.id));
});

// ─── Consolidato (storico) filtrato/raggruppato per il drill-down ──────
router.post("/budgets/:id/consolidato", validateBody(consolidatoSchema), (req, res) => {
  const budget = store.getBudget(req.params.id);
  if (!budget) return res.status(404).json({ error: "Budget non trovato." });
  const user = req.user;
  if (!userStore.canViewBudget(user, budget.id)) return res.status(403).json({ error: "Non hai i permessi per vedere questo budget." });
  const { viewDim, filters } = req.body;
  const result = getConsolidatoAggregation(budget, viewDim || null, filters || {});
  res.json(result);
});

// ─── Suggerimento AI (RAG + data agent combinati, per paese+prodotto) ──
router.post("/budgets/suggest", suggestLimiter, validateBody(suggestSchema), async (req, res) => {
  const { country, product } = req.body;
  try {
    const suggestion = await suggestBudgetLine({ country, product });
    res.json(suggestion);
  } catch (err) {
    console.error("Errore in /budgets/suggest:", err);
    res.status(500).json({ error: "Errore durante la generazione del suggerimento." });
  }
});

export default router;
