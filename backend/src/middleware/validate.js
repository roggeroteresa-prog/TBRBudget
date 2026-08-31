/**
 * Valida req.body contro uno schema Zod. In caso di errore risponde subito
 * con 400 e i dettagli leggibili di cosa non va; altrimenti sostituisce
 * req.body con i dati validati e normalizzati (es. stringhe numeriche
 * convertite in number) prima di passare al gestore della rotta.
 */
export function validateBody(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body || {});
    if (!result.success) {
      const details = result.error.issues.map(
        (issue) => `${issue.path.join(".") || "body"}: ${issue.message}`
      );
      return res.status(400).json({ error: "Dati non validi.", details });
    }
    req.body = result.data;
    next();
  };
}
