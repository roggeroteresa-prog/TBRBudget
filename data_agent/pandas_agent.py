"""
Agente pandas: riceve una domanda in linguaggio naturale sul dataset di vendite
TBR Budget Group, genera ed esegue codice Python per pulire i dati, calcolare la
risposta ed eventualmente produrre un grafico (matplotlib/seaborn) salvato
su disco. Restituisce una sintesi testuale + il nome del file del grafico
(se generato) al back end Node.js.
"""

import os
import glob
import time

import matplotlib
matplotlib.use("Agg")  # niente display, solo salvataggio su file

from langchain_openai import ChatOpenAI
from langchain_experimental.agents.agent_toolkits import create_pandas_dataframe_agent
import pandas as pd

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_PATH = os.path.join(BASE_DIR, "..", "data", "tbr_sales.csv")
CHARTS_DIR = os.path.join(BASE_DIR, "charts")
os.makedirs(CHARTS_DIR, exist_ok=True)

AGENT_PREFIX = """
Sei un data analyst del reparto Sales & Budget di TBR Budget Group (produttore di
testate per la raccolta di mais, cereali, girasole e foraggio).

Lavori su un DataFrame pandas `df` con il consuntivo vendite. Le colonne sono:
order_id, order_date, country, region, customer, product, crop, quantity,
unit_price_eur, revenue_eur, sales_channel, currency, fx_rate_used,
unit_price_local, revenue_local. Per le analisi di fatturato usa di norma le
colonne in EUR (unit_price_eur, revenue_eur), che sono già omogenee tra
tutti i paesi; le colonne "_local" riflettono la valuta di fatturazione
locale (vedi colonna currency) e vanno usate solo se esplicitamente richiesto.

IMPORTANTE — il dataset è "sporco", prima di qualsiasi analisi devi:
1. Convertire order_date in datetime gestendo formati misti (usa
   pd.to_datetime(df['order_date'], errors='coerce', format='mixed')).
2. Rimuovere righe duplicate (df.duplicated()).
3. Gestire i valori mancanti in modo sensato per l'analisi richiesta
   (es. escludere righe senza quantity/unit_price_eur se servono per calcoli,
   oppure imputare con cautela se richiesto esplicitamente).
4. Ripulire spazi/maiuscole incoerenti in colonne testuali (country, product)
   con .str.strip() e normalizzazione capitalizzazione.
5. Escludere o correggere valori fuori range palesemente errati (quantity <= 0
   o quantity > 50 per un singolo ordine macchina; unit_price_eur <= 0 o
   valori anomali rispetto alla mediana del prodotto).

Se la domanda si presta a una visualizzazione (trend, confronto tra paesi,
prodotti, periodi), genera SEMPRE un grafico con matplotlib o seaborn e
salvalo con:
    plt.tight_layout()
    plt.savefig(r"{chart_path}", dpi=150)
    plt.close()
Usa esattamente quel percorso. Se la domanda è puramente numerica/testuale
(es. "quanti ordini ha il cliente X"), non è necessario generare un grafico.

Alla fine rispondi SEMPRE con:
1. Una TABELLA in formato Markdown (sintassi GFM con | e header) contenente i
   dati numerici rilevanti per la domanda (es. valori per paese/prodotto/mese),
   con un massimo di 15-20 righe (se i dati grezzi sono più numerosi, aggrega
   o mostra solo le righe più rilevanti/i totali principali). Includi sempre
   un'intestazione chiara per ogni colonna. Se la domanda è puramente
   qualitativa e non ha dati tabellari sensati da mostrare (raro), puoi
   omettere la tabella.
2. Una sintesi testuale in italiano, chiara e orientata al business (parla di
   trend, stagionalità, paesi/prodotti, non solo di numeri grezzi), utile a
   chi deve decidere il budget commerciale.
Metti la tabella PRIMA della sintesi testuale.
"""


def _next_chart_path() -> str:
    filename = f"chart_{int(time.time() * 1000)}.png"
    return os.path.join(CHARTS_DIR, filename), filename


def analyze_question(question: str) -> dict:
    df = pd.read_csv(DATA_PATH)

    chart_path, chart_filename = _next_chart_path()
    existing_before = set(glob.glob(os.path.join(CHARTS_DIR, "*.png")))

    llm = ChatOpenAI(model="gpt-4o-mini", temperature=0)

    agent = create_pandas_dataframe_agent(
        llm,
        df,
        verbose=True,
        agent_type="openai-tools",
        allow_dangerous_code=True,  # necessario: l'agente esegue codice Python generato dall'LLM
        prefix=AGENT_PREFIX.format(chart_path=chart_path),
    )

    result = agent.invoke({"input": question})
    summary = result.get("output", "").strip()

    # Rileva se è stato effettivamente creato un nuovo grafico
    existing_after = set(glob.glob(os.path.join(CHARTS_DIR, "*.png")))
    new_charts = existing_after - existing_before
    chart_url = None
    if new_charts:
        newest = max(new_charts, key=os.path.getctime)
        chart_url = f"/charts/{os.path.basename(newest)}"
    elif os.path.exists(chart_path):
        chart_url = f"/charts/{chart_filename}"

    return {"summary": summary, "chart_url": chart_url}
