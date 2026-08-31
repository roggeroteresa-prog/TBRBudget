import { verifyToken } from "../services/authService.js";
import { getUser } from "../services/userStore.js";

/**
 * Verifica l'header "Authorization: Bearer <token>". Se il token è valido,
 * carica l'utente FRESCO dal database in req.user (non i dati contenuti nel
 * token stesso, così un cambio di ruolo lato Impostazioni ha effetto subito,
 * senza dover attendere un nuovo login). Se manca o non è valido, risponde
 * 401 — sostituisce il precedente meccanismo basato sull'header x-user-id,
 * che chiunque poteva falsificare per impersonare un amministratore.
 */
export function requireAuth(req, res, next) {
  const header = req.header("Authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: "Autenticazione richiesta. Effettua il login." });
  }

  const payload = verifyToken(token);
  if (!payload?.sub) {
    return res.status(401).json({ error: "Sessione non valida o scaduta. Effettua di nuovo il login." });
  }

  const user = getUser(payload.sub);
  if (!user) {
    return res.status(401).json({ error: "Utente non più esistente. Effettua di nuovo il login." });
  }

  req.user = user;
  next();
}
