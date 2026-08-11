/**
 * Recupera i tassi di cambio "live" (ultimo dato disponibile, riferimento
 * BCE) dall'API pubblica e gratuita Frankfurter (https://www.frankfurter.app),
 * senza bisogno di API key. Copre le valute tracciate dalla BCE (le principali
 * valute mondiali ed europee); valute come UAH, RUB, KZT, RSD, ARS non sono
 * supportate — in quel caso il chiamante userà il tasso storico suggerito.
 */
export async function fetchLiveRates(baseCurrency, targetCurrencies) {
  if (!targetCurrencies || targetCurrencies.length === 0) return {};

  const url = `https://api.frankfurter.app/latest?from=${encodeURIComponent(baseCurrency)}&to=${targetCurrencies
    .map(encodeURIComponent)
    .join(",")}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`Frankfurter API ha risposto con status ${res.status}`);
    const data = await res.json();
    return data.rates || {};
  } finally {
    clearTimeout(timeout);
  }
}
