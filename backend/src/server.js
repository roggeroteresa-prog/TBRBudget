import "dotenv/config";
import express from "express";
import cors from "cors";
import chatRouter from "./routes/chat.js";
import budgetsRouter from "./routes/budgets.js";
import usersRouter from "./routes/users.js";
import historyRouter from "./routes/history.js";

const app = express();

app.use(cors());
app.use(express.json());

app.use("/api", chatRouter);
app.use("/api", budgetsRouter);
app.use("/api", usersRouter);
app.use("/api", historyRouter);

app.get("/health", (_req, res) => res.json({ status: "ok" }));

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Back end TBR Budget Agent in ascolto su http://localhost:${PORT}`);
});
