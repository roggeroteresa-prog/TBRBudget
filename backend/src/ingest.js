/**
 * Script di ingestione della knowledge base in ChromaDB.
 * Esegui `npm run ingest` (con il server ChromaDB locale già avviato, vedi README)
 * ogni volta che il documento knowledge_base/tbr_kb.md viene aggiornato.
 */
import "dotenv/config";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { getCollection } from "./services/ragService.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const KB_PATH = path.join(__dirname, "..", "..", "knowledge_base", "tbr_kb.md");

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

async function main() {
  const raw = fs.readFileSync(KB_PATH, "utf-8");
  const chunks = chunkText(raw);
  console.log(`Documento diviso in ${chunks.length} chunk.`);

  const collection = await getCollection();

  // Ripulisce eventuali dati precedenti per evitare duplicati a ogni re-ingest
  try {
    const existing = await collection.get();
    if (existing.ids?.length) {
      await collection.delete({ ids: existing.ids });
    }
  } catch (err) {
    console.warn("Nessuna collezione preesistente da svuotare:", err.message);
  }

  await collection.add({
    ids: chunks.map((_, i) => `kb-chunk-${i}`),
    documents: chunks,
    metadatas: chunks.map((_, i) => ({ source: "tbr_kb.md", chunk: i })),
  });

  console.log("Ingestione completata: knowledge base indicizzata in ChromaDB.");
}

main().catch((err) => {
  console.error("Errore durante l'ingestione:", err);
  process.exit(1);
});
