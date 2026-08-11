import { ChromaClient, OpenAIEmbeddingFunction } from "chromadb";

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
 * Interroga la knowledge base e restituisce i chunk più rilevanti.
 * @param {string} query
 * @param {number} topK
 * @returns {Promise<string[]>}
 */
export async function queryKnowledgeBase(query, topK = 4) {
  const collection = await getCollection();
  const results = await collection.query({
    queryTexts: [query],
    nResults: topK,
  });
  const docs = results.documents?.[0] || [];
  return docs;
}

export { getCollection, COLLECTION_NAME };
