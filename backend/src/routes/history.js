import { Router } from "express";
import { listEvents } from "../services/historyService.js";

const router = Router();

// GET /api/history?search=...&actionType=...&page=1
router.get("/history", (req, res) => {
  const { search = "", actionType = "", page = "1" } = req.query;
  res.json(listEvents({ search, actionType, page: Number(page) || 1 }));
});

export default router;
