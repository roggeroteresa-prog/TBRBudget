import { z } from "zod";

/**
 * Schemi di validazione per le rotte budget. Ogni richiesta viene
 * controllata a schema PRIMA di raggiungere la logica di business: valori
 * fuori tipo, enum non ammessi, date malformate o campi mancanti vengono
 * respinti qui con un errore chiaro, invece di propagarsi nei calcoli
 * (riponderazione proporzionale, aggregazioni, ecc.) e fallire più a valle
 * in modo meno comprensibile.
 */

export const DIMENSION_KEYS = ["macroarea", "country", "customer", "category", "product"];
const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

const dateField = z.string().regex(dateRegex, "Formato data non valido, atteso YYYY-MM-DD.");

export const createBudgetSchema = z
  .object({
    budgetName: z.string().trim().min(1, "Il nome del budget è obbligatorio.").max(120),
    budgetYear: z.coerce.number().int().min(2000).max(2100),
    currencyCode: z.string().trim().length(3, "Codice valuta a 3 lettere, es. EUR.").optional(),
    startDate: dateField,
    endDate: dateField,
    fixedFactor: z.enum(["IMPORTO", "QUANTITA", "PREZZO"]),
  })
  .refine((d) => new Date(d.startDate) <= new Date(d.endDate), {
    message: "La data di inizio deve precedere (o coincidere con) la data di fine.",
    path: ["endDate"],
  });

export const updateBudgetSchema = z.object({
  budgetYear: z.coerce.number().int().min(2000).max(2100).optional(),
  currencyCode: z.string().trim().length(3).optional(),
  startDate: dateField.optional(),
  endDate: dateField.optional(),
  fixedFactor: z.enum(["IMPORTO", "QUANTITA", "PREZZO"]).optional(),
  dimensions: z.array(z.enum(DIMENSION_KEYS)).max(5).optional(),
  exchangeRates: z.record(z.string().length(3), z.coerce.number().positive()).optional(),
  initialTargets: z
    .object({
      totalAmount: z.coerce.number().nonnegative(),
      totalQuantity: z.coerce.number().nonnegative(),
    })
    .optional(),
});

export const statusSchema = z.object({
  status: z.enum(["Bozza", "Confermato"]),
});

export const generateBaseBudgetSchema = z
  .object({
    totalAmount: z.coerce.number().nonnegative().optional(),
    totalQuantity: z.coerce.number().nonnegative().optional(),
  })
  .refine((d) => d.totalAmount || d.totalQuantity, {
    message: "Indica almeno un importo o una quantità target maggiore di zero.",
  });

const dimsSchema = z
  .record(z.enum(DIMENSION_KEYS), z.string().trim().min(1))
  .refine((d) => Object.keys(d).length > 0, {
    message: "Seleziona un valore per almeno una dimensione.",
  });

// Chiavi "1".."12" per le mappe mensili (importo/quantità per mese)
const monthlyMapSchema = z
  .record(
    z.string().regex(/^([1-9]|1[0-2])$/, "Chiave mese non valida (atteso 1-12)."),
    z.coerce.number()
  )
  .optional();

export const lineBodySchema = z.object({
  dims: dimsSchema,
  distribution: z.enum(["total", "monthly"]).optional(),
  amount: z.coerce.number().optional(),
  quantity: z.coerce.number().optional(),
  monthlyAmounts: monthlyMapSchema,
  monthlyQuantities: monthlyMapSchema,
});

export const consolidatoSchema = z.object({
  viewDim: z.enum(DIMENSION_KEYS).nullable().optional(),
  filters: z.record(z.string(), z.union([z.string(), z.array(z.string())])).optional(),
});

export const suggestSchema = z.object({
  country: z.string().trim().min(1, "Il paese è obbligatorio."),
  product: z.string().trim().min(1, "Il prodotto è obbligatorio."),
});
