const DATA_AGENT_URL = process.env.DATA_AGENT_URL || "http://localhost:8000";

/**
 * Inoltra la domanda numerica/analitica dell'utente al microservizio Python,
 * che interroga (via SQL/DuckDB) il consuntivo vendite già pulito e
 * calcola la risposta, generando eventualmente un grafico.
 * @param {string} question
 * @returns {Promise<{summary: string, chartUrl: string|null}>}
 */
export async function runDataAnalysis(question) {
  const res = await fetch(`${DATA_AGENT_URL}/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question }),
  });

  if (!res.ok) {
    throw new Error(`data_agent ha risposto con status ${res.status}`);
  }

  const data = await res.json();
  const chartUrl = data.chart_url ? `${DATA_AGENT_URL}${data.chart_url}` : null;
  return { summary: data.summary, chartUrl };
}
