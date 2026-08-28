/**
 * Script di ingestione manuale della knowledge base in ChromaDB.
 * Esegui `npm run ingest` ogni volta che il documento
 * knowledge_base/tbr_kb.md viene aggiornato nel contenuto.
 *
 * Non è più l'unico modo per popolare ChromaDB: il back end usa la stessa
 * funzione anche automaticamente all'avvio e prima di ogni domanda RAG, per
 * auto-ripararsi se rileva che la collezione è vuota (vedi
 * services/ragService.js → ensureCollectionPopulated). Questo script resta
 * utile per un'indicizzazione esplicita e immediata, es. dopo aver
 * modificato il contenuto della knowledge base.
 */
import "dotenv/config";
import { ingestKnowledgeBase } from "./services/ragService.js";

ingestKnowledgeBase()
  .then((n) => {
    console.log(`Documento diviso in ${n} chunk.`);
    console.log("Ingestione completata: knowledge base indicizzata in ChromaDB.");
  })
  .catch((err) => {
    console.error("Errore durante l'ingestione:", err);
    process.exit(1);
  });
