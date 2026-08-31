import OpenAI from "openai";
import { queryKnowledgeBase } from "./ragService.js";
import { runDataAnalysis } from "./dataAgentService.js";
import { categoryForProduct } from "./dimensionsService.js";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * Suggerisce una riga di budget (mesi consigliati, quantità/importo mensile
 * indicativi) per una combinazione paese+prodotto, combinando:
 * 1. la knowledge base (calendario agricolo / policy) via RAG
 * 2. lo storico vendite via l'agente pandas
 * in un'unica risposta strutturata (JSON) prodotta dall'LLM.
 */
export async function suggestBudgetLine({ country, product }) {
  const crop = categoryForProduct(product);

  const [ragDocs, dataResult] = await Promise.all([
    queryKnowledgeBase(
      `calendario agricolo e periodo consigliato per vendere ${product} (${crop}) in ${country}`,
      4
    ),
    runDataAnalysis(
      `Qual è lo storico di vendita del prodotto "${product}" in "${country}"? ` +
        `Dammi la quantità media annua e l'importo medio annuo, senza generare grafici.`
    ).catch((err) => ({ summary: `Dati storici non disponibili: ${err.message}`, chartUrl: null })),
  ]);

  const kbContext = ragDocs.length
    ? ragDocs.join("\n---\n")
    : "Nessuna informazione trovata nella knowledge base.";

  const prompt = `Sei un assistente di budgeting commerciale per TBR Budget Group.
Devi proporre una riga di budget per il prodotto "${product}" (coltura: ${crop}) nel paese "${country}",
basandoti sulle seguenti fonti.

KNOWLEDGE BASE (calendario agricolo/policy):
${kbContext}

STORICO VENDITE (agente dati):
${dataResult.summary}

Rispondi SOLO con un oggetto JSON valido (nessun testo fuori dal JSON), con questa forma esatta:
{
  "months": [numeri 1-12 dei mesi consigliati per l'ordine, tipicamente 2-4 mesi],
  "monthlyQuantity": numero (quantità consigliata per ciascuno dei mesi indicati),
  "monthlyAmount": numero (importo in EUR consigliato per ciascuno dei mesi indicati),
  "rationale": "breve spiegazione in italiano del perché di questi mesi/quantità, citando stagionalità e storico"
}
Se i dati storici non permettono una stima numerica affidabile, usa comunque una stima ragionevole basata sul prezzo di listino del prodotto e sul buon senso commerciale, specificandolo nella rationale.`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.2,
    messages: [{ role: "user", content: prompt }],
    max_tokens: 600, // tetto costo/abuso: la risposta attesa è un piccolo JSON
  });

  const raw = completion.choices[0].message.content.trim();
  const cleaned = raw.replace(/^```json\s*/i, "").replace(/```$/, "").trim();

  try {
    const parsed = JSON.parse(cleaned);
    return {
      months: Array.isArray(parsed.months) ? parsed.months.filter((m) => m >= 1 && m <= 12) : [],
      monthlyQuantity: Number(parsed.monthlyQuantity) || 0,
      monthlyAmount: Number(parsed.monthlyAmount) || 0,
      rationale: parsed.rationale || "",
      chartUrl: dataResult.chartUrl || null,
    };
  } catch (err) {
    // Fallback: se il parsing JSON fallisce, restituiamo comunque un contesto utile
    return {
      months: [],
      monthlyQuantity: 0,
      monthlyAmount: 0,
      rationale:
        "Non sono riuscito a strutturare una proposta numerica precisa. " +
        "Sintesi disponibile: " + dataResult.summary,
      chartUrl: dataResult.chartUrl || null,
    };
  }
}
