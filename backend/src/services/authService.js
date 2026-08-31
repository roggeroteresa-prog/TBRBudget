import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET;
const TOKEN_TTL = "8h";

if (!JWT_SECRET) {
  // Fallisce rumorosamente all'avvio piuttosto che emettere token con una
  // chiave debole/prevedibile: meglio un crash immediato e comprensibile
  // che una falla di sicurezza silenziosa.
  throw new Error(
    "JWT_SECRET non impostata. Aggiungila al file .env (una stringa lunga e casuale, es. generata con `openssl rand -hex 32`)."
  );
}

export async function hashPassword(plain) {
  return bcrypt.hash(plain, 10);
}

export async function verifyPassword(plain, hash) {
  if (!hash) return false;
  return bcrypt.compare(plain, hash);
}

/** Firma un token per l'utente: contiene solo l'id, mai dati sensibili. */
export function signToken(user) {
  return jwt.sign({ sub: user.id }, JWT_SECRET, { expiresIn: TOKEN_TTL });
}

/** Verifica firma e scadenza; restituisce il payload oppure null se non valido. */
export function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}
