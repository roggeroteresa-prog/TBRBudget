# TBR Sales & Budget Agent — Progetto Finale

Agente AI ibrido e multi-tool per il reparto **Sales & Budget** di TBR Budget Group
(azienda fittizia, produttore di testate per la raccolta di mais, cereali,
girasole e foraggio — scenario e dati commerciali **fittizi** ai fini del progetto).

L'agente decide autonomamente se:
- interrogare la **knowledge base documentale** (RAG su ChromaDB) per domande
  su policy, procedure, calendario agricolo, catalogo prodotti, FAQ;
- oppure delegare l'analisi a un **agente Python** (pandas) che pulisce ed
  esplora il consuntivo vendite, calcola trend/KPI e genera grafici.

## Architettura

```
tbr-budget-agent/
├── data/                    # dataset CSV di consuntivo vendite (+ script di generazione)
├── knowledge_base/          # documento markdown usato come knowledge base RAG
├── frontend/                # interfaccia chat in React (Vite)
├── backend/                 # orchestratore Node.js/Express (function calling, RAG, session state)
├── data_agent/              # microservizio Python (FastAPI) con l'agente pandas
├── .env.example             # variabili d'ambiente necessarie
└── README.md
```

Flusso di una richiesta:

```
Utente (React) --POST /api/chat--> Back end Node.js (orchestratore)
                                        │
                     decide con function calling (LLM, ReAct)
                                        │
                     ┌──────────────────┴───────────────────┐
                     ▼                                       ▼
           query_knowledge_base                     analyze_sales_data
           (ChromaDB, retrieval)              (HTTP → FastAPI, agente pandas
                                                + generazione grafico)
                     │                                       │
                     └──────────────────┬───────────────────┘
                                        ▼
                     Il back end combina i risultati e risponde
                     al front end (testo + eventuale URL immagine)
```

## Prerequisiti

- Node.js ≥ 18 (per `fetch` nativo)
- Python ≥ 3.10
- Una API key OpenAI
- ChromaDB (server locale, vedi sotto)

## 1. Configurazione delle credenziali

Copia il file di esempio e inserisci la tua API key OpenAI:

```bash
cp .env.example .env
```

Il file `.env` viene letto sia dal back end (`backend/`) sia dal data_agent
(`data_agent/`): copialo (o crea un symlink) anche nella cartella `data_agent/`
se lo lanci da lì, oppure esporta le variabili nell'ambiente prima di avviare
i servizi.

## 2. Generazione del dataset (già incluso, rigenerabile)

Il CSV `data/tbr_sales.csv` è già presente nel repository. Per rigenerarlo:

```bash
cd data
pip install pandas numpy
python generate_data.py
```

## 3. Avvio di ChromaDB (server locale)

```bash
pip install chromadb
chroma run --path ./chroma_data --port 8001
```

Lascia questo terminale aperto: è il server vettoriale usato dal back end.

## 4. Back end Node.js

```bash
cd backend
npm install
npm run ingest   # indicizza knowledge_base/tbr_kb.md in ChromaDB (da rifare se il documento cambia)
npm run dev      # avvia il server su http://localhost:4000
```

## 5. Data agent Python (FastAPI)

In un nuovo terminale:

```bash
cd data_agent
python -m venv .venv
source .venv/bin/activate      # su Windows: .venv\Scripts\activate
pip install -r requirements.txt
python main.py                 # avvia su http://localhost:8000
```

## 6. Front end React

In un altro terminale:

```bash
cd frontend
npm install
npm run dev                    # avvia su http://localhost:5173
```

Apri http://localhost:5173 nel browser: i servizi comunicano tra loro tramite
le porte configurate (Vite proxy `/api` verso il back end sulla 4000; il back
end chiama il data_agent sulla 8000; il back end interroga ChromaDB sulla 8001).

## Ordine di avvio consigliato

1. ChromaDB (`chroma run ...`)
2. `npm run ingest` (una tantum / dopo modifiche alla knowledge base)
3. Back end Node.js (`npm run dev`)
4. Data agent Python (`python main.py`)
5. Front end React (`npm run dev`)

## Esempi di domande da provare

**Descrittive/analitiche** (RAG e/o data agent, sola lettura):
- *"Qual è la garanzia standard sulle testate TBR?"* → RAG
- *"Quali prodotti dovrei proporre in Brasile e in che periodo?"* → RAG
- *"Qual è il trend di fatturato di AltaResa in Italia negli ultimi 3 anni?"* → data agent (tabella + grafico)
- *"Confrontami le vendite di SolePieno tra Argentina e Sud Africa"* → data agent
- *"Basandoti sul calendario agricolo e sullo storico vendite, che budget consiglieresti per la Romania nel prossimo trimestre?"* → RAG + data agent combinati

**Esecutive** (creano/modificano dati — l'assistente chiede i parametri mancanti e conferma prima di agire):
- *"Vorrei creare un nuovo budget"*
- *"Crea un budget chiamato Export2027, anno 2027, periodo 01/01/2025-31/12/2025, fattore fisso prezzo"*
- *"Configuralo con le dimensioni paese e prodotto"*
- *"Genera la base budget con un importo target di 3 milioni di euro"*
- *"Spalma il budget di GranCampo in Polonia in base alla stagionalità"*
- *"In base ai periodi di raccolto per ogni macroarea, come distribuiresti il budget nei mesi?"*

## Modulo Budget (creazione, configurazione, modifica)

Il front end ha una **navbar scura** in alto e una **sidebar** con cinque sezioni:
Overview, Gestione Budget, Budget dei Ricavi, Report, Assistente. Tema colori:
nero/antracite con il **rosso TBR** come accento.

### Configurazione di un nuovo budget (3 step sequenziali)

Subito dopo la creazione si apre la Configurazione, che si sblocca in ordine:

1. **Dimensioni**: 5 slot ordinati ("Dimensione 1"...5) tra cui scegliere
   liberamente Macroarea, Paese, Cliente, Categoria Prodotto, Prodotto
   (derivate dai dati reali del consuntivo). **L'ordine scelto determina la
   gerarchia di drill-down** nella tabella di "Budget dei Ricavi".
2. **Currency & Tassi**: il sistema analizza il consuntivo del periodo
   selezionato, rileva le valute diverse dalla base effettivamente presenti
   nelle vendite di quel periodo, e propone sia un **tasso storico medio
   osservato nei dati** sia — dove disponibile — un **tasso live** dall'API
   pubblica e gratuita [Frankfurter](https://www.frankfurter.app) (dati BCE,
   nessuna API key). Valute come UAH, RUB, KZT, RSD, ARS non sono coperte da
   Frankfurter: in quel caso resta solo il suggerimento storico. Il tasso
   finale è comunque modificabile.
3. **Importo Iniziale**: il totale di consuntivo del periodo è mostrato come
   riferimento; l'utente inserisce un valore assoluto o una variazione
   (`+5%`, `-10%`, `+50000`, `-20000`). Alla conferma ("Genera base budget"),
   il sistema **riponera in modo proporzionale il consuntivo storico** — per
   ciascuna combinazione di dimensioni e per ciascun mese, preservando mix e
   stagionalità — generando la base di budget da cui partire.

### Budget dei Ricavi

- **Filtri multi-select** (stile "pill", con ricerca/Tutti/Pulisci) per ciascuna
  dimensione attiva, indipendenti dalla navigazione a tab
- **Tab per dimensione** (Budget → Macroarea → Paese → ...) per scegliere il
  livello di aggregazione della tabella; il **drill-down** tramite il pulsante
  a fine riga naviga più in profondità senza toccare i filtri in alto
- **Tabella pivot sempre editabile**: anche le righe aggregate si possono
  modificare — il nuovo valore viene **ridistribuito proporzionalmente** sulle
  righe di dettaglio sottostanti, in base al loro peso attuale (preservando la
  stagionalità già presente). Le colonne Importo/Quantità/Prezzo mostrano
  editabili le due misure indicate dal Fattore Fisso del budget, mentre la
  terza (calcolata) e le colonne di confronto storico (Cons. Importo/Qtà) sono
  in sola lettura, con sfondo dedicato
- Le modifiche si inviano in blocco con **"Invia Modifiche"**, con conferma
  esplicita; se si cambia vista/tab/drill-down con modifiche non salvate, un
  pannello chiede se inviarle prima o procedere senza salvarle
- **🤖 Chiedi all'assistente** nel form "+ Aggiungi Riga" (quando Paese e
  Prodotto sono entrambi dimensioni attive): combina RAG (calendario
  agricolo) e data agent (storico vendite) per proporre mesi/quantità/importo

### Gestione budget via chat (Assistente)

Oltre alle domande di analisi (RAG/data agent), l'assistente può **creare,
configurare e modificare i budget** in linguaggio naturale, con le stesse
funzioni usate dall'interfaccia (nessuna logica duplicata — vedi
`backend/src/services/budgetAgentTools.js`). Verifica sempre i parametri
necessari prima di agire (li chiede se mancanti), segue l'ordine di
configurazione Dimensioni → Currency → Importo, e chiede conferma prima di
azioni che creano o modificano dati. Sa anche riponderare la distribuzione
mensile di righe già esistenti in base al calendario agricolo, mantenendo
invariati i totali annui, mostrando la proposta prima di applicarla. Vedi
gli esempi nella sezione precedente.

Persistenza: `backend/src/data/budgets-store.json` (file JSON semplice,
nessun DB — coerente con la natura dimostrativa del progetto di tesi).
Le API REST sono in `backend/src/routes/budgets.js`. La lettura/pulizia del
CSV di consuntivo (per dimensioni, analisi valuta e generazione base budget)
è in `backend/src/services/salesDataService.js`.

## Report, Storico Attività e Impostazioni

- **Report**: per il budget selezionato mostra una barra informativa (nome,
  anno, valuta, stato, fattore fisso, dimensioni attive), KPI (totale
  budget/quantità/prezzo medio/totale consuntivo con delta %), grafici a
  barre per dimensione (con etichette valore), un grafico a torta (donut)
  di distribuzione sulla prima dimensione attiva, un confronto Consuntivo
  vs Budget raggruppato per dimensione, la distribuzione mensile, e una
  tabella di dettaglio riga per riga.
- **Storico Attività**: log di tutte le operazioni sui budget (creazione,
  configurazione, scrittura valori, cambio stato, eliminazione), con
  utente, data/ora e dettaglio. Scritto direttamente da
  `backend/src/services/budgetStore.js` ad ogni mutazione — copre quindi
  automaticamente sia le azioni da interfaccia sia quelle eseguite
  dall'assistente in chat. Persistenza: `backend/src/data/history-log.json`.
- **Impostazioni** (visibile solo agli amministratori): gestione utenti con
  tre ruoli — **Amministratore** (accesso completo), **Collaboratore** (vede
  e modifica solo i budget assegnati), **Visualizzatore** (solo visualizza i
  budget assegnati) — e assegnazione esplicita di quali budget ciascun
  utente può vedere. Persistenza: `backend/src/data/users-store.json`.

Un selettore utente nella navbar permette di cambiare "utente attivo"
(nessun vero login/autenticazione: è un meccanismo dimostrativo). L'utente
selezionato viene inviato ad ogni richiesta tramite l'header `x-user-id`, e
i permessi sono applicati realmente lato back end (`userStore.js`) sia per
le richieste dall'interfaccia sia per quelle dell'assistente in chat — non
è quindi solo un filtro visivo.

**Limite noto**: essendo un modello "a client fidato" (nessuna sessione
autenticata reale), un utente potrebbe in teoria selezionare un altro
utente dal menu. Adeguato allo scopo dimostrativo del progetto, ma da
menzionare in sede di discussione.

## Note su sicurezza

Nessuna API key è hardcodata: sia il back end sia il data_agent leggono
`OPENAI_API_KEY` da variabili d'ambiente tramite `.env` (escluso da Git,
vedi `.gitignore`).

## Possibili estensioni (non incluse in questa versione)

- Autenticazione utenti reale (login, sessioni server-side) al posto del
  selettore "utente attivo" dimostrativo
- Persistenza della cronologia chat su file/DB invece che in memoria
  (si perde ancora al riavvio del back end)
- Gating dei pulsanti di modifica anche nelle pagine "Gestione Budget" e
  "Configura" per il ruolo Visualizzatore (oggi il permesso è comunque
  applicato ed enforced dal back end, ma l'interfaccia in quelle due pagine
  non nasconde ancora proattivamente i pulsanti non permessi)
- Cache delle risposte RAG più frequenti
- Dockerizzazione dei tre servizi con `docker-compose`