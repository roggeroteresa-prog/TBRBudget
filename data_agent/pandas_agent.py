"""
Data agent: carica e pulisce UNA SOLA VOLTA (cache in memoria, invalidata solo
se il CSV cambia) il consuntivo vendite TBR Budget Group, registrandolo come
vista DuckDB. Le domande in linguaggio naturale vengono risolte da un ciclo di
function calling OpenAI in cui l'LLM scrive query SQL (dialetto DuckDB) sulla
vista già pulita, invece di generare ed eseguire codice Python pandas ad ogni
domanda. Rispetto all'approccio precedente questo:

- evita di rileggere il CSV da disco ad ogni chiamata (I/O ripetuto);
- separa la pulizia dei dati (deterministica, eseguita una volta) dall'analisi
  (dinamica, gestita dall'LLM), riducendo token consumati e rischio di
  allucinazioni nella fase di pulizia;
- esegue query SQL sandboxate invece di codice Python arbitrario generato
  dall'LLM, con evidenti vantaggi di sicurezza oltre che di velocità.

Include inoltre una cache in memoria (con TTL) delle risposte per domande
identiche/ripetute, e una routine di pulizia periodica dei grafici generati.
"""

import glob
import hashlib
import json
import os
import re
import threading
import time

import duckdb
import matplotlib

matplotlib.use("Agg")  # niente display, solo salvataggio su file
import matplotlib.pyplot as plt
import pandas as pd
from openai import OpenAI

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_PATH = os.path.join(BASE_DIR, "..", "data", "tbr_sales.csv")
CHARTS_DIR = os.path.join(BASE_DIR, "charts")
os.makedirs(CHARTS_DIR, exist_ok=True)

CHART_MAX_AGE_SECONDS = 2 * 60 * 60  # 2 ore: oltre questa età un grafico viene rimosso
ANSWER_CACHE_TTL_SECONDS = 15 * 60  # 15 minuti

client = OpenAI()


# ─────────────────────────────────────────────────────────────────────────
# Caricamento + pulizia dati — una sola volta, ricaricati solo se il CSV
# cambia (confronto sulla data di modifica del file, mtime).
# ─────────────────────────────────────────────────────────────────────────
_cache = {"mtime": None, "df": None, "con": None}
_cache_lock = threading.Lock()


def _clean_dataframe(raw: pd.DataFrame) -> pd.DataFrame:
    """Pulizia deterministica del dataset "sporco" (vedi data/generate_data.py
    per le anomalie introdotte volutamente): date in formati misti, righe
    duplicate, spazi/maiuscole incoerenti nei campi testuali, valori mancanti
    o fuori range. Eseguita una sola volta per caricamento, non ad ogni
    domanda: l'LLM lavora sempre su dati già puliti.
    """
    df = raw.copy()

    # Date in formati misti (ISO, dd/mm/yyyy, mm-dd-yyyy, dd-Mon-yyyy...)
    df["order_date"] = pd.to_datetime(df["order_date"], errors="coerce", format="mixed")

    # Spazi superflui nei campi testuali
    text_cols = ["country", "product", "region", "customer", "crop", "sales_channel", "currency"]
    for col in text_cols:
        if col in df.columns:
            df[col] = df[col].astype(str).str.strip()

    # Normalizza la capitalizzazione del paese preservando acronimi noti (USA)
    if "country" in df.columns:
        def _norm_country(v):
            if v.strip().lower() == "usa":
                return "USA"
            return v.title() if v else v
        df["country"] = df["country"].apply(_norm_country)

    # Righe duplicate esatte
    df = df.drop_duplicates()

    # Colonne numeriche: forza il tipo, poi scarta valori mancanti/fuori range
    for col in ["quantity", "unit_price_eur", "revenue_eur"]:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce")

    df = df[df["order_date"].notna()]
    df = df[df["quantity"].between(1, 50, inclusive="both")]
    df = df[(df["unit_price_eur"] > 0) & (df["revenue_eur"] > 0)]

    return df.reset_index(drop=True)


def get_data():
    """Restituisce (DataFrame pulito, connessione DuckDB con vista 'sales'),
    da cache se il CSV non è cambiato dall'ultimo caricamento (confronto sul
    mtime del file: se cresce o cambia, viene ricaricato e ripulito)."""
    mtime = os.path.getmtime(DATA_PATH)
    with _cache_lock:
        if _cache["df"] is not None and _cache["mtime"] == mtime:
            return _cache["df"], _cache["con"]

        raw = pd.read_csv(DATA_PATH)
        df = _clean_dataframe(raw)

        con = duckdb.connect(database=":memory:")
        con.register("sales", df)

        _cache.update({"mtime": mtime, "df": df, "con": con})
        return df, con


# ─────────────────────────────────────────────────────────────────────────
# Cache delle risposte per domande identiche/ripetute (TTL in memoria).
#
# Scelta consapevole rispetto a Redis: per un'app a istanza singola come
# questa, una cache in-process evita di aggiungere un servizio esterno da
# provisionare e gestire in fase di deploy, senza perdere il beneficio
# principale (evitare di richiamare l'LLM per la stessa domanda). Se il
# servizio venisse scalato su più repliche, la cache andrebbe promossa a un
# livello condiviso (Redis) per restare coerente tra le istanze.
# ─────────────────────────────────────────────────────────────────────────
_answer_cache = {}


def _cache_key(question: str) -> str:
    normalized = re.sub(r"\s+", " ", question.strip().lower())
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()


def _get_cached_answer(question: str):
    entry = _answer_cache.get(_cache_key(question))
    if not entry:
        return None
    if time.time() - entry["ts"] > ANSWER_CACHE_TTL_SECONDS:
        return None
    return entry["result"]


def _set_cached_answer(question: str, result: dict):
    _answer_cache[_cache_key(question)] = {"ts": time.time(), "result": result}


# ─────────────────────────────────────────────────────────────────────────
# Pulizia periodica dei grafici generati, per evitare l'accumulo di PNG su
# disco. Richiamata sia da un task in background (vedi main.py) sia — a
# costo trascurabile — ad ogni domanda, come rete di sicurezza.
# ─────────────────────────────────────────────────────────────────────────
def cleanup_old_charts(max_age_seconds: int = CHART_MAX_AGE_SECONDS) -> int:
    now = time.time()
    removed = 0
    for path in glob.glob(os.path.join(CHARTS_DIR, "*.png")):
        try:
            if now - os.path.getmtime(path) > max_age_seconds:
                os.remove(path)
                removed += 1
        except FileNotFoundError:
            pass
    return removed


# ─────────────────────────────────────────────────────────────────────────
# Strumenti esposti all'LLM: query SQL (DuckDB, sola lettura) e generazione
# grafico da dati già aggregati (mai codice arbitrario).
# ─────────────────────────────────────────────────────────────────────────
SCHEMA_DESCRIPTION = """
Tabella `sales` (vista DuckDB sul consuntivo vendite TBR Budget Group, GIÀ
pulita: date normalizzate, duplicati rimossi, testo normalizzato, righe con
valori mancanti/fuori range già escluse):

- order_id (VARCHAR)
- order_date (DATE)
- country (VARCHAR) — es. Italia, Brasile, USA...
- region (VARCHAR) — macroarea, es. Sud Europa, Sud America...
- customer (VARCHAR)
- product (VARCHAR) — es. AltaResa, GranCampo, PrimaRaccolta, TaglioFlex, SolePieno, FienoFacile
- crop (VARCHAR) — coltura di riferimento (Mais, Cereali, Girasole, Foraggio)
- quantity (DOUBLE)
- unit_price_eur (DOUBLE)
- revenue_eur (DOUBLE) — fatturato, usa questa colonna di norma (già in EUR, omogenea tra paesi)
- sales_channel (VARCHAR) — Dealer / Vendita diretta
- currency (VARCHAR) — valuta di fatturazione locale
- fx_rate_used, unit_price_local, revenue_local — solo se la domanda chiede esplicitamente la valuta locale
"""

TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "run_sql",
            "description": "Esegue una query SQL in sola lettura (dialetto DuckDB) sulla tabella 'sales' e restituisce le righe risultanti in JSON.",
            "parameters": {
                "type": "object",
                "properties": {
                    "sql": {"type": "string", "description": "Query SQL SELECT sulla tabella 'sales'."},
                },
                "required": ["sql"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "create_chart",
            "description": "Genera un grafico a barre o a linee da una serie di coppie etichetta/valore (ottenute da run_sql) e lo salva su disco. Usa quando la domanda si presta a una visualizzazione: trend nel tempo, confronto tra paesi/prodotti/periodi.",
            "parameters": {
                "type": "object",
                "properties": {
                    "chart_type": {"type": "string", "enum": ["bar", "line"]},
                    "title": {"type": "string"},
                    "x_label": {"type": "string"},
                    "y_label": {"type": "string"},
                    "labels": {"type": "array", "items": {"type": "string"}, "description": "Etichette asse X, in ordine."},
                    "values": {"type": "array", "items": {"type": "number"}, "description": "Valori asse Y, stesso ordine di labels."},
                },
                "required": ["chart_type", "title", "labels", "values"],
            },
        },
    },
]

SYSTEM_PROMPT = f"""Sei un data analyst del reparto Sales & Budget di TBR Budget Group
(produttore di testate per la raccolta di mais, cereali, girasole e foraggio).

{SCHEMA_DESCRIPTION}

Rispondi alle domande sul consuntivo vendite usando SOLO lo strumento run_sql
per interrogare la tabella 'sales' — non inventare mai numeri. Puoi chiamarlo
più volte se ti serve incrociare più aggregazioni. Se la domanda si presta a
una visualizzazione (trend, confronto tra paesi/prodotti/periodi), chiama
anche create_chart con i dati aggregati ottenuti da run_sql. Se la domanda è
puntuale (es. "quanti ordini ha il cliente X"), il grafico non è necessario.

Quando hai i dati che ti servono, rispondi SEMPRE con:
1. Una TABELLA in formato Markdown (sintassi GFM con | e header), max 15-20
   righe (aggrega o mostra le righe più rilevanti se i dati grezzi sono di più).
2. Una sintesi testuale in italiano, chiara e orientata al business (trend,
   stagionalità, paesi/prodotti — non solo numeri grezzi).
Mostra la tabella PRIMA della sintesi testuale.
"""


def _run_sql(con, sql: str) -> str:
    try:
        result = con.execute(sql).fetchdf()
    except Exception as e:
        return json.dumps({"error": str(e)})
    # limite di sicurezza: evita di rimandare all'LLM migliaia di righe
    truncated = result.head(200)
    return truncated.to_json(orient="records", date_format="iso", force_ascii=False)


def _next_chart_path():
    filename = f"chart_{int(time.time() * 1000)}.png"
    return os.path.join(CHARTS_DIR, filename), filename


def _create_chart(chart_type, title, labels, values, x_label="", y_label=""):
    path, filename = _next_chart_path()
    plt.figure(figsize=(8, 4.5))
    if chart_type == "line":
        plt.plot(labels, values, marker="o", color="#c8102e")
    else:
        plt.bar(labels, values, color="#c8102e")
    plt.title(title)
    if x_label:
        plt.xlabel(x_label)
    if y_label:
        plt.ylabel(y_label)
    plt.xticks(rotation=30, ha="right")
    plt.tight_layout()
    plt.savefig(path, dpi=150)
    plt.close()
    return f"/charts/{filename}"


def analyze_question(question: str) -> dict:
    cached = _get_cached_answer(question)
    if cached is not None:
        return cached

    cleanup_old_charts()  # pulizia "a costo zero" ad ogni domanda, oltre al task periodico

    df, con = get_data()

    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": question},
    ]
    chart_url = None

    for _ in range(6):
        completion = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=messages,
            tools=TOOLS,
            tool_choice="auto",
            temperature=0,
        )
        message = completion.choices[0].message

        assistant_msg = {"role": "assistant", "content": message.content}
        if message.tool_calls:
            assistant_msg["tool_calls"] = [tc.model_dump() for tc in message.tool_calls]
        messages.append(assistant_msg)

        if not message.tool_calls:
            summary = (message.content or "").strip()
            result = {"summary": summary, "chart_url": chart_url}
            _set_cached_answer(question, result)
            return result

        for tool_call in message.tool_calls:
            name = tool_call.function.name
            try:
                args = json.loads(tool_call.function.arguments)
            except json.JSONDecodeError:
                args = {}

            if name == "run_sql":
                tool_result = _run_sql(con, args.get("sql", ""))
            elif name == "create_chart":
                chart_url = _create_chart(
                    args.get("chart_type", "bar"),
                    args.get("title", ""),
                    args.get("labels", []),
                    args.get("values", []),
                    args.get("x_label", ""),
                    args.get("y_label", ""),
                )
                tool_result = json.dumps({"chart_url": chart_url})
            else:
                tool_result = json.dumps({"error": f"strumento sconosciuto: {name}"})

            messages.append({"role": "tool", "tool_call_id": tool_call.id, "content": tool_result})

    return {
        "summary": "Non sono riuscito a completare l'analisi in tempo utile. Prova a riformulare la domanda.",
        "chart_url": chart_url,
    }