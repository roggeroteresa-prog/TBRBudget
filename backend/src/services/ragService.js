import { ChromaClient, OpenAIEmbeddingFunction } from "chromadb";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const KB_PATH = path.join(__dirname, "..", "..", "..", "knowledge_base", "tbr_kb.md");

const COLLECTION_NAME = "tbr_kb";

const embedder = new OpenAIEmbeddingFunction({
  openai_api_key: process.env.OPENAI_API_KEY,
  openai_model: "text-embedding-3-small",
});

const client = new ChromaClient({
  path: process.env.CHROMA_URL || "http://localhost:8001",
});

let collectionPromise = null;

async function getCollection() {
  if (!collectionPromise) {
    collectionPromise = client.getOrCreateCollection({
      name: COLLECTION_NAME,
      embeddingFunction: embedder,
    });
  }
  return collectionPromise;
}

/**
 * Chunking semplice: divide il markdown per sezioni (##) e poi in blocchi
 * di dimensione massima ~800 caratteri, con un piccolo overlap.
 */
function chunkText(text, maxLen = 800, overlap = 100) {
  const sections = text.split(/\n(?=## )/g); // spezza mantenendo l'header di sezione
  const chunks = [];

  for (const section of sections) {
    if (section.length <= maxLen) {
      chunks.push(section.trim());
      continue;
    }
    let start = 0;
    while (start < section.length) {
      const end = Math.min(start + maxLen, section.length);
      chunks.push(section.slice(start, end).trim());
      start += maxLen - overlap;
    }
  }
  return chunks.filter((c) => c.length > 20);
}

/**
 * Indicizza (o re-indicizza da zero) la knowledge base in ChromaDB.
 * Richiamata sia dallo script manuale `npm run ingest` sia automaticamente
 * dal back end se rileva che la collezione è vuota (vedi
 * ensureCollectionPopulated) — es. perché ChromaDB è ripartito senza disco
 * persistente sul piano Free di Render.
 */
export async function ingestKnowledgeBase() {
  const raw = fs.readFileSync(KB_PATH, "utf-8");
  const chunks = chunkText(raw);

  const collection = await getCollection();

  try {
    const existing = await collection.get();
    if (existing.ids?.length) {
      await collection.delete({ ids: existing.ids });
    }
  } catch {
    // nessuna collezione preesistente da svuotare: prima ingestione
  }

  await collection.add({
    ids: chunks.map((_, i) => `kb-chunk-${i}`),
    documents: chunks,
    metadatas: chunks.map((_, i) => ({ source: "tbr_kb.md", chunk: i })),
  });

  return chunks.length;
}

let lastHealthCheck = 0;
const HEALTH_CHECK_INTERVAL_MS = 5 * 60 * 1000; // 5 minuti

/**
 * Verifica che la collezione contenga documenti e, se risulta vuota, la
 * re-indicizza automaticamente — nessun intervento manuale necessario.
 * Il controllo è "throttled" (al massimo una volta ogni 5 minuti) per non
 * aggiungere una query a ChromaDB ad ogni singola domanda in chat.
 */
export async function ensureCollectionPopulated({ force = false } = {}) {
  const now = Date.now();
  if (!force && now - lastHealthCheck < HEALTH_CHECK_INTERVAL_MS) return;
  lastHealthCheck = now;

  try {
    const collection = await getCollection();
    const count = await collection.count();
    if (count === 0) {
      console.warn("[ragService] Collezione ChromaDB vuota: re-indicizzazione automatica in corso...");
      const n = await ingestKnowledgeBase();
      console.warn(`[ragService] Re-indicizzazione automatica completata: ${n} chunk.`);
    }
  } catch (err) {
    console.error("[ragService] Controllo/ripristino automatico della knowledge base fallito:", err.message);
  }
}

/**
 * Interroga la knowledge base e restituisce i chunk più rilevanti.
 * @param {string} query
 * @param {number} topK
 * @returns {Promise<string[]>}
 */
export async function queryKnowledgeBase(query, topK = 4) {
  await ensureCollectionPopulated();
  const collection = await getCollection();
  const results = await collection.query({
    queryTexts: [query],
    nResults: topK,
  });
  const docs = results.documents?.[0] || [];
  return docs;
}

export { getCollection, COLLECTION_NAME };
