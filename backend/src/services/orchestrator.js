import OpenAI from "openai";
import { queryKnowledgeBase } from "./ragService.js";
import { runDataAnalysis } from "./dataAgentService.js";
import {
  listBudgetsTool,
  createBudgetTool,
  getDimensionOptionsTool,
  configureDimensionsTool,
  getCurrencyAnalysisTool,
  configureCurrencyTool,
  getConsuntivoTotalsTool,
  generateBaseBudgetTool,
  getBudgetLinesSummaryTool,
  getAllBudgetLinesTool,
  suggestLineDistributionTool,
  upsertBudgetLineTool,
  deleteBudgetLineTool,
  setBudgetStatusTool,
} from "./budgetAgentTools.js";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Session state in memoria: sessionId -> array di messaggi (memoria conversazionale)
const sessions = new Map();

const SYSTEM_PROMPT = `Sei l'assistente virtuale del reparto Sales & Budget di TBR Budget Group,
produttore di testate per la raccolta di mais, cereali, girasole e foraggio.

Rispondi sempre in italiano. Hai due famiglie di capacità:

## A) Domande descrittive/di analisi (informative, non modificano nulla)
1. "query_knowledge_base": policy, procedure, calendario agricolo, catalogo prodotti, FAQ.
2. "analyze_sales_data": analisi del consuntivo vendite (numeri, trend, grafici).
Usa questi strumenti per rispondere a domande conoscitive. Se la domanda ne richiede
entrambi, chiamali entrambi e combina i risultati in una risposta unica e narrativa.

**Importante per analyze_sales_data**: il risultato dello strumento contiene di
norma una TABELLA in Markdown seguita da una sintesi testuale. Nella tua risposta
finale all'utente RIPORTA SEMPRE la tabella così com'è (non riscriverla, non
convertirla in prosa, non ometterla), seguita dal tuo commento/sintesi in linguaggio
naturale. L'eventuale immagine del grafico viene allegata automaticamente
dall'interfaccia: non devi descriverla a parole né inserirla tu nel testo, ti basta
sapere che se lo strumento ha generato un grafico comparirà accanto alla tua
risposta.

## B) Domande esecutive (creare/configurare/modificare budget)
Hai a disposizione strumenti per gestire i budget esattamente come fa l'utente
dall'interfaccia (Gestione Budget → Configurazione → Budget dei Ricavi):
- list_budgets, create_budget
- get_dimension_options, configure_dimensions
- get_currency_analysis, configure_currency
- get_consuntivo_totals, generate_base_budget
- get_budget_lines_summary, get_all_budget_lines, suggest_line_distribution
- upsert_budget_line, delete_budget_line, set_budget_status

REGOLE FONDAMENTALI per le richieste esecutive:
1. **Verifica sempre i parametri prima di agire, usando ESATTAMENTE i campi
   richiesti dallo strumento — mai domande generiche di pianificazione
   aziendale.** Ad esempio, quando l'utente esprime l'intenzione di creare un
   nuovo budget (es. "vorrei creare un nuovo budget", "crea un budget"), NON
   chiedere cose come obiettivo/mercato/risorse: chiedi solo ed esattamente i
   campi richiesti da create_budget:
   - Nome del budget
   - Anno di riferimento
   - Valuta (se l'utente non la specifica, proponi EUR e chiedi conferma)
   - Data di inizio del periodo consuntivo (gg/mm/aaaa)
   - Data di fine del periodo consuntivo (gg/mm/aaaa)
   - Fattore Fisso: Importo, Quantità o Prezzo — è il valore che NON sarà
     editabile direttamente nelle righe di budget (verrà dedotto dagli altri
     due); se l'utente non sa cosa scegliere, spiega brevemente questo
     concetto e suggerisci Prezzo come opzione più comune.
   Le informazioni su mercati/prodotti/paesi riguardano le DIMENSIONI e le
   RIGHE del budget, che si configurano DOPO la creazione (con
   configure_dimensions e upsert_budget_line) — non chiederle in fase di
   creazione.
2. **Non inventare valori mancanti** per nessuno strumento: se un parametro
   richiesto non è stato fornito, chiedilo esplicitamente prima di chiamare
   lo strumento (eccetto i default espliciti indicati, es. valuta EUR).
3. **Non confondere mai un riferimento a un budget con un ID.** Se l'utente nomina un
   budget per nome, usa prima list_budgets per trovare l'id corrispondente (o chiedi
   conferma se ci sono più budget con nomi simili/anno diverso).
4. **Segui l'ordine di configurazione**: un budget nuovo va prima creato
   (create_budget), poi configurato nell'ordine Dimensioni (configure_dimensions) →
   Currency (get_currency_analysis + configure_currency) → Importo Iniziale
   (get_consuntivo_totals + generate_base_budget). Non generare la base budget prima
   di aver configurato le dimensioni.
5. **Riepiloga e conferma prima di eseguire azioni che creano o modificano dati**
   (create_budget, configure_dimensions, configure_currency, generate_base_budget,
   upsert_budget_line, delete_budget_line, set_budget_status): esponi in una frase
   chiara cosa stai per fare con quali valori, e procedi solo se il messaggio
   dell'utente conferma esplicitamente oppure se l'utente aveva già fornito tutti i
   dettagli in modo inequivocabile nella richiesta originale (in quel caso puoi
   eseguire direttamente, ma comunica sempre cosa hai fatto).
6. **Distribuzione mensile per stagionalità/località**: quando l'utente chiede di
   "spalmare" o distribuire un budget su più mesi in base a stagionalità e area
   geografica (es. "in base alla stagionalità distribuisci il budget di AltaResa in
   Brasile"), usa prima suggest_line_distribution (combina calendario agricolo e
   storico vendite) per ottenere mesi/quantità/importo consigliati e la relativa
   motivazione, mostrala all'utente, e solo dopo conferma applica il risultato con
   upsert_budget_line (distribution: "monthly").
7. **Riponderazione stagionale sull'INTERO budget o su un raggruppamento** (es.
   "in base ai periodi di raccolto per ogni macroarea, come spalmeresti il budget nei
   mesi?"): qui l'utente NON vuole nuovi valori, vuole ridistribuire nei mesi giusti
   i valori GIÀ PRESENTI nel budget, mantenendo invariati i totali annui. Procedi così:
   a. get_all_budget_lines per vedere tutte le righe esistenti (dimensioni,
      categoria/coltura, totale importo/quantità attuali).
   b. query_knowledge_base per il calendario agricolo (semina/raccolta per
      emisfero e coltura) — ti serve per capire in quali mesi concentrare l'ordine
      per ciascuna area/coltura (l'ordine va anticipato di qualche mese rispetto
      alla raccolta, come indicato nel documento).
   c. Per ciascuna riga, proponi 2-4 mesi coerenti con la sua area/coltura e
      suddividi il TOTALE ATTUALE di quella riga (importo e quantità, invariati)
      su quei mesi (in parti uguali, salvo indicazioni diverse). Presenta la
      proposta in modo chiaro (una tabella per area/prodotto con i mesi scelti va
      benissimo) PRIMA di applicare qualunque modifica.
   d. Solo dopo conferma esplicita dell'utente, applica la nuova distribuzione
      chiamando upsert_budget_line (distribution: "monthly") per ciascuna riga
      interessata, con monthlyAmounts/monthlyQuantities che sommano esattamente
      al totale originale di quella riga.
   e. Se le righe da modificare sono molte (es. oltre 20), chiedi all'utente se
      vuole procedere su tutte o solo su un sottoinsieme (es. un paese o una
      macroarea alla volta), per evitare risposte troppo lunghe da verificare.
8. Le dimensioni valide sono: macroarea, country, customer, category, product. Le
   righe di budget (upsert_budget_line/delete_budget_line) richiedono un valore
   "dims" con ESATTAMENTE le dimensioni attive di quel budget (usa
   get_dimension_options per conoscere i valori validi di ciascuna dimensione).
9. Se un'azione fallisce per parametri mancanti o non validi, spiega chiaramente
   all'utente cosa manca o cosa correggere, senza tecnicismi superflui.
10. Non descrivere mai a parole i tuoi strumenti o i loro nomi tecnici
   all'utente (es. non dire "uso create_budget"): parla sempre in termini
   naturali di cosa stai facendo ("creo il budget con questi dati...").`;

const tools = [
  {
    type: "function",
    function: {
      name: "query_knowledge_base",
      description:
        "Cerca nella knowledge base documentale TBR (policy, calendario agricolo, catalogo prodotti, FAQ commerciali).",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "La domanda o gli argomenti da cercare nella documentazione." },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "analyze_sales_data",
      description:
        "Delega l'analisi del dataset di vendite (CSV) all'agente Python: pulizia dati, calcoli, trend, grafici.",
      parameters: {
        type: "object",
        properties: {
          question: { type: "string", description: "La domanda analitica da porre all'agente pandas, in linguaggio naturale." },
        },
        required: ["question"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_budgets",
      description: "Elenca tutti i budget esistenti con id, nome, anno, valuta, stato, dimensioni configurate.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "create_budget",
      description: "Crea un nuovo budget. Richiede tutti i parametri: non inventarli, chiedili se mancanti.",
      parameters: {
        type: "object",
        properties: {
          budgetName: { type: "string" },
          budgetYear: { type: "integer" },
          currencyCode: { type: "string", description: "Codice valuta a 3 lettere, es. EUR. Default EUR se non specificato." },
          startDate: { type: "string", description: "Data inizio periodo consuntivo, formato YYYY-MM-DD." },
          endDate: { type: "string", description: "Data fine periodo consuntivo, formato YYYY-MM-DD." },
          fixedFactor: { type: "string", enum: ["IMPORTO", "QUANTITA", "PREZZO"], description: "Il valore NON editabile tra i tre, dedotto dagli altri due." },
        },
        required: ["budgetName", "budgetYear", "startDate", "endDate", "fixedFactor"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_dimension_options",
      description: "Restituisce le dimensioni disponibili (macroarea, country, customer, category, product) e i valori validi di ciascuna.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "configure_dimensions",
      description: "Imposta le dimensioni di analisi di un budget, in ordine (determina la gerarchia di drill-down).",
      parameters: {
        type: "object",
        properties: {
          budgetId: { type: "string" },
          dimensions: {
            type: "array",
            items: { type: "string", enum: ["macroarea", "country", "customer", "category", "product"] },
            description: "In ordine di drill-down, es. [\"country\",\"product\"].",
          },
        },
        required: ["budgetId", "dimensions"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_currency_analysis",
      description: "Analizza il consuntivo del periodo del budget e rileva le valute diverse dalla base, con tasso storico e (se disponibile) tasso live.",
      parameters: {
        type: "object",
        properties: { budgetId: { type: "string" } },
        required: ["budgetId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "configure_currency",
      description: "Salva i tassi di cambio finali del budget (chiedi conferma dei tassi da usare prima di chiamarlo).",
      parameters: {
        type: "object",
        properties: {
          budgetId: { type: "string" },
          rates: { type: "object", description: "Mappa { CODICE_VALUTA: tasso }, es. { \"USD\": 1.08 }." },
        },
        required: ["budgetId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_consuntivo_totals",
      description: "Restituisce importo e quantità totali di consuntivo per il periodo del budget (riferimento per l'importo iniziale).",
      parameters: {
        type: "object",
        properties: { budgetId: { type: "string" } },
        required: ["budgetId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "generate_base_budget",
      description:
        "Genera la base budget riponderando in modo proporzionale il consuntivo storico sul nuovo importo/quantità target. Richiede dimensioni già configurate.",
      parameters: {
        type: "object",
        properties: {
          budgetId: { type: "string" },
          totalAmount: { type: "number" },
          totalQuantity: { type: "number" },
        },
        required: ["budgetId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_budget_lines_summary",
      description: "Riepiloga le righe di budget esistenti (totale, numero righe, prime 15 per importo) per un budget.",
      parameters: {
        type: "object",
        properties: { budgetId: { type: "string" } },
        required: ["budgetId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_all_budget_lines",
      description:
        "Restituisce TUTTE le righe di budget (dimensioni, categoria/coltura, totali e valori mensili), senza limite. Usa questo invece di get_budget_lines_summary quando devi ragionare o intervenire sull'intero budget (es. riponderazione stagionale su tutte le righe).",
      parameters: {
        type: "object",
        properties: { budgetId: { type: "string" } },
        required: ["budgetId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "suggest_line_distribution",
      description:
        "Suggerisce mesi/quantità/importo consigliati per una combinazione paese+prodotto, combinando calendario agricolo (RAG) e storico vendite (data agent). Usa questo prima di applicare una distribuzione basata su stagionalità/località.",
      parameters: {
        type: "object",
        properties: {
          country: { type: "string" },
          product: { type: "string" },
        },
        required: ["country", "product"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "upsert_budget_line",
      description:
        "Crea o sostituisce la riga di budget (tutti e 12 i mesi) per una combinazione di dimensioni. dims deve avere un valore per OGNI dimensione attiva del budget.",
      parameters: {
        type: "object",
        properties: {
          budgetId: { type: "string" },
          dims: { type: "object", description: "Es. { \"country\": \"Brasile\", \"product\": \"AltaResa\" }." },
          distribution: { type: "string", enum: ["monthly", "total"] },
          amount: { type: "number", description: "Importo totale annuo (solo se distribution=total)." },
          quantity: { type: "number", description: "Quantità totale annua (solo se distribution=total)." },
          monthlyAmounts: { type: "object", description: "Mappa { \"1\":.., ..., \"12\":.. } (solo se distribution=monthly)." },
          monthlyQuantities: { type: "object", description: "Mappa { \"1\":.., ..., \"12\":.. } (solo se distribution=monthly)." },
        },
        required: ["budgetId", "dims", "distribution"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_budget_line",
      description: "Elimina la riga di budget per una combinazione di dimensioni.",
      parameters: {
        type: "object",
        properties: {
          budgetId: { type: "string" },
          dims: { type: "object" },
        },
        required: ["budgetId", "dims"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "set_budget_status",
      description: "Cambia lo stato del budget (Bozza o Confermato).",
      parameters: {
        type: "object",
        properties: {
          budgetId: { type: "string" },
          status: { type: "string", enum: ["Bozza", "Confermato"] },
        },
        required: ["budgetId", "status"],
      },
    },
  },
];

const TOOL_HANDLERS = {
  query_knowledge_base: async (args) => {
    const docs = await queryKnowledgeBase(args.query);
    return docs.length ? docs.join("\n---\n") : "Nessun risultato rilevante trovato nella knowledge base.";
  },
  list_budgets: async (args, user) => listBudgetsTool(args, user),
  create_budget: async (args, user) => createBudgetTool(args, user),
  get_dimension_options: async () => getDimensionOptionsTool(),
  configure_dimensions: async (args, user) => configureDimensionsTool(args, user),
  get_currency_analysis: async (args, user) => getCurrencyAnalysisTool(args, user),
  configure_currency: async (args, user) => configureCurrencyTool(args, user),
  get_consuntivo_totals: async (args, user) => getConsuntivoTotalsTool(args, user),
  generate_base_budget: async (args, user) => generateBaseBudgetTool(args, user),
  get_budget_lines_summary: async (args, user) => getBudgetLinesSummaryTool(args, user),
  get_all_budget_lines: async (args, user) => getAllBudgetLinesTool(args, user),
  suggest_line_distribution: async (args) => suggestLineDistributionTool(args),
  upsert_budget_line: async (args, user) => upsertBudgetLineTool(args, user),
  delete_budget_line: async (args, user) => deleteBudgetLineTool(args, user),
  set_budget_status: async (args, user) => setBudgetStatusTool(args, user),
};

function getHistory(sessionId) {
  if (!sessions.has(sessionId)) {
    sessions.set(sessionId, [{ role: "system", content: SYSTEM_PROMPT }]);
  }
  return sessions.get(sessionId);
}

const BUDGET_ACTION_TOOLS = new Set([
  "list_budgets",
  "create_budget",
  "get_dimension_options",
  "configure_dimensions",
  "get_currency_analysis",
  "configure_currency",
  "get_consuntivo_totals",
  "generate_base_budget",
  "get_budget_lines_summary",
  "get_all_budget_lines",
  "suggest_line_distribution",
  "upsert_budget_line",
  "delete_budget_line",
  "set_budget_status",
]);

function categoryOf(toolName) {
  if (toolName === "query_knowledge_base") return "knowledge_base";
  if (toolName === "analyze_sales_data") return "data_agent";
  if (BUDGET_ACTION_TOOLS.has(toolName)) return "budget_action";
  return null;
}

/**
 * Gestisce un turno di conversazione: aggiorna la memoria di sessione,
 * esegue il ciclo ReAct (reason + act) con function calling (RAG, data
 * agent, gestione budget) e restituisce la risposta finale.
 */
export async function handleChatMessage(sessionId, userMessage, actingUser) {
  const history = getHistory(sessionId);
  history.push({ role: "user", content: userMessage });

  let chartUrl = null;
  const sources = new Set();
  const MAX_TOOL_ITERATIONS = 8;

  for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: history,
      tools,
      tool_choice: "auto",
      max_tokens: 1200, // tetto costo/abuso per singola risposta del modello
    });

    const choice = completion.choices[0];
    const message = choice.message;
    history.push(message);

    if (!message.tool_calls || message.tool_calls.length === 0) {
      // L'LLM ha prodotto una risposta finale, niente altro da eseguire
      return { reply: message.content, chartUrl, sources: Array.from(sources) };
    }

    // Esegue ogni tool richiesto (l'LLM può chiamarne più di uno in parallelo)
    for (const toolCall of message.tool_calls) {
      const { name, arguments: argsJson } = toolCall.function;
      let args = {};
      try {
        args = JSON.parse(argsJson);
      } catch {
        args = {};
      }

      const category = categoryOf(name);
      let toolResultContent;
      try {
        if (name === "analyze_sales_data") {
          const { summary, chartUrl: url } = await runDataAnalysis(args.question);
          if (url) chartUrl = url;
          toolResultContent = summary;
          sources.add(category);
        } else if (TOOL_HANDLERS[name]) {
          const result = await TOOL_HANDLERS[name](args, actingUser);
          toolResultContent = JSON.stringify(result);
          sources.add(category);
        } else {
          toolResultContent = `Strumento sconosciuto: ${name}`;
        }
      } catch (err) {
        toolResultContent = `Errore durante l'esecuzione dello strumento ${name}: ${err.message}`;
        // L'azione è comunque stata tentata: la segnaliamo lo stesso come fonte
        if (category) sources.add(category);
      }

      history.push({
        role: "tool",
        tool_call_id: toolCall.id,
        content: toolResultContent,
      });
    }
    // Il loop riparte: l'LLM vede i risultati dei tool e decide se rispondere
    // o chiamare altri strumenti (paradigma ReAct).
  }

  return {
    reply: "Non sono riuscito a completare il ragionamento in tempo utile. Prova a riformulare la domanda.",
    chartUrl,
    sources: Array.from(sources),
  };
}

export function resetSession(sessionId) {
  sessions.delete(sessionId);
}
