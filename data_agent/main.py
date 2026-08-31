"""
Microservizio FastAPI del data_agent.
Espone POST /analyze, chiamato dal back end Node.js quando l'utente pone una
domanda che richiede analisi numeriche sul dataset di vendite.
Serve inoltre i grafici generati come file statici su /charts/<file>.png.

All'avvio precarica e pulisce il dataset (cache calda, vedi pandas_agent.py)
e avvia un task in background che rimuove periodicamente i grafici più
vecchi di qualche ora, per evitare che si accumulino su disco.
"""

import asyncio
import os
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from pandas_agent import analyze_question, get_data, cleanup_old_charts, CHARTS_DIR

load_dotenv()  # legge OPENAI_API_KEY dal file .env nella root del progetto o locale

CHART_CLEANUP_INTERVAL_SECONDS = 30 * 60  # ogni 30 minuti


async def _periodic_chart_cleanup():
    while True:
        await asyncio.sleep(CHART_CLEANUP_INTERVAL_SECONDS)
        removed = cleanup_old_charts()
        if removed:
            print(f"[cleanup] rimossi {removed} grafici obsoleti da {CHARTS_DIR}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    get_data()  # precarica e pulisce il dataset una volta all'avvio (cache calda)
    cleanup_task = asyncio.create_task(_periodic_chart_cleanup())
    yield
    cleanup_task.cancel()


app = FastAPI(title="TBR Data Agent", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # in produzione: limitare all'origine del back end
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/charts", StaticFiles(directory=CHARTS_DIR), name="charts")


class AnalyzeRequest(BaseModel):
    question: str


class AnalyzeResponse(BaseModel):
    summary: str
    chart_url: str | None = None


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/analyze", response_model=AnalyzeResponse)
def analyze(req: AnalyzeRequest):
    result = analyze_question(req.question)
    return AnalyzeResponse(**result)


if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("DATA_AGENT_PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
