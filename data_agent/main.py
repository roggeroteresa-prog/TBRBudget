"""
Microservizio FastAPI del data_agent.
Espone POST /analyze, chiamato dal back end Node.js quando l'utente pone una
domanda che richiede analisi numeriche sul dataset di vendite.
Serve inoltre i grafici generati come file statici su /charts/<file>.png
"""

import os

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from pandas_agent import analyze_question, CHARTS_DIR

load_dotenv()  # legge OPENAI_API_KEY dal file .env nella root del progetto o locale

app = FastAPI(title="TBR Data Agent")

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
