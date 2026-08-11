"""
Genera tbr_sales.csv: dataset fittizio di consuntivo vendite TBR Budget Group.
Simula ordini di testate per la raccolta (mais, girasole, cereali, foraggio)
in diversi paesi, con stagionalità legata al calendario agricolo e con
anomalie intenzionali (valori mancanti, duplicati, formati data incoerenti,
valori fuori range) da usare per testare il data-cleaning dell'agente pandas.

Uso: python generate_data.py
"""

import random
from datetime import date, timedelta

import numpy as np
import pandas as pd

random.seed(42)
np.random.seed(42)

# ---------------------------------------------------------------------------
# Catalogo prodotti TBR e coltura di riferimento
# ---------------------------------------------------------------------------
PRODUCTS = {
    "AltaResa": {"crop": "Mais", "base_price": 42000},
    "GranCampo": {"crop": "Mais", "base_price": 38500},
    "PrimaRaccolta": {"crop": "Mais", "base_price": 21000},
    "TaglioFlex": {"crop": "Cereali (grano/orzo)", "base_price": 27500},
    "SolePieno": {"crop": "Girasole", "base_price": 24000},
    "FienoFacile": {"crop": "Foraggio", "base_price": 31000},
}

# Paesi con emisfero (determina la stagione di raccolta) e macro-area commerciale
COUNTRIES = {
    "Italia": {"hemisphere": "N", "region": "Sud Europa"},
    "Francia": {"hemisphere": "N", "region": "Sud Europa"},
    "Spagna": {"hemisphere": "N", "region": "Sud Europa"},
    "Germania": {"hemisphere": "N", "region": "Centro Europa"},
    "Polonia": {"hemisphere": "N", "region": "Centro Europa"},
    "Ungheria": {"hemisphere": "N", "region": "Est Europa"},
    "Romania": {"hemisphere": "N", "region": "Est Europa"},
    "Serbia": {"hemisphere": "N", "region": "Est Europa"},
    "Bulgaria": {"hemisphere": "N", "region": "Est Europa"},
    "Ucraina": {"hemisphere": "N", "region": "Est Europa"},
    "Russia": {"hemisphere": "N", "region": "Est Europa"},
    "Turchia": {"hemisphere": "N", "region": "Medio Oriente"},
    "Kazakhstan": {"hemisphere": "N", "region": "Asia Centrale"},
    "USA": {"hemisphere": "N", "region": "Nord America"},
    "Canada": {"hemisphere": "N", "region": "Nord America"},
    "Messico": {"hemisphere": "N", "region": "Nord America"},
    "Brasile": {"hemisphere": "S", "region": "Sud America"},
    "Argentina": {"hemisphere": "S", "region": "Sud America"},
    "Sud Africa": {"hemisphere": "S", "region": "Africa"},
    "Australia": {"hemisphere": "S", "region": "Oceania"},
}

# Valuta di fatturazione per paese (mercato locale) e tasso indicativo
# EUR -> valuta locale (usato come base per fx_rate_used, con oscillazione
# realistica riga per riga, per simulare dati di consuntivo multi-valuta)
COUNTRY_CURRENCY = {
    "Italia": "EUR", "Francia": "EUR", "Spagna": "EUR", "Germania": "EUR",
    "Polonia": "PLN", "Ungheria": "HUF", "Romania": "RON", "Serbia": "RSD",
    "Bulgaria": "BGN", "Ucraina": "UAH", "Russia": "RUB", "Turchia": "TRY",
    "Kazakhstan": "KZT", "USA": "USD", "Canada": "CAD", "Messico": "MXN",
    "Brasile": "BRL", "Argentina": "ARS", "Sud Africa": "ZAR", "Australia": "AUD",
}
BASE_FX_RATE = {  # 1 EUR = X valuta locale (indicativo)
    "EUR": 1.0, "PLN": 4.30, "HUF": 395.0, "RON": 4.97, "RSD": 117.0,
    "BGN": 1.96, "UAH": 43.0, "RUB": 98.0, "TRY": 35.0, "KZT": 480.0,
    "USD": 1.08, "CAD": 1.47, "MXN": 18.5, "BRL": 5.40, "ARS": 1050.0,
    "ZAR": 20.5, "AUD": 1.63,
}

# Rivenditori/dealer fittizi per paese (2-4 per paese)
DEALER_SUFFIXES = ["Agri", "Agro", "Cereal", "Farm", "Terra", "Campo", "Harvest", "Grain"]
DEALER_TYPES = ["Srl", "SA", "GmbH", "Ltd", "S.L.", "SRL", "Sp. z o.o.", "LLC", "Kft.", "SC"]


def make_customers():
    customers = {}
    for country in COUNTRIES:
        n = random.randint(2, 4)
        names = []
        for _ in range(n):
            name = f"{random.choice(DEALER_SUFFIXES)}{random.choice(DEALER_SUFFIXES)} {random.choice(DEALER_TYPES)}"
            names.append(name)
        customers[country] = list(dict.fromkeys(names)) or [f"Agri Generic {country}"]
    return customers


CUSTOMERS = make_customers()

# ---------------------------------------------------------------------------
# Stagionalità: mesi in cui si concentrano gli ordini per coltura/emisfero
# (gli ordini di macchine anticipano la semina/raccolta di qualche mese)
# ---------------------------------------------------------------------------
SEASON_WEIGHTS = {
    ("Mais", "N"): [1, 1, 2, 4, 5, 3, 2, 1, 1, 1, 1, 1],           # picco ordini mar-mag (pre semina)
    ("Mais", "S"): [3, 4, 2, 1, 1, 1, 1, 1, 2, 3, 4, 3],           # picco set-dic (emisfero sud)
    ("Girasole", "N"): [1, 2, 3, 4, 3, 2, 1, 1, 1, 1, 1, 1],
    ("Girasole", "S"): [2, 3, 3, 1, 1, 1, 1, 1, 2, 3, 3, 2],
    ("Cereali (grano/orzo)", "N"): [2, 3, 4, 2, 1, 1, 1, 1, 2, 3, 2, 2],
    ("Cereali (grano/orzo)", "S"): [1, 1, 1, 1, 2, 3, 3, 2, 1, 1, 1, 1],
    ("Foraggio", "N"): [1, 2, 2, 3, 4, 3, 2, 1, 1, 1, 1, 1],
    ("Foraggio", "S"): [2, 2, 2, 1, 1, 1, 1, 1, 2, 3, 3, 2],
}

YEARS = [2021, 2022, 2023, 2024, 2025]
N_ROWS = 1250

DATE_FORMATS = [
    lambda d: d.strftime("%Y-%m-%d"),   # ISO
    lambda d: d.strftime("%d/%m/%Y"),   # europeo
    lambda d: d.strftime("%m-%d-%Y"),   # US
    lambda d: d.strftime("%d-%b-%Y"),   # 15-Mar-2023
]

rows = []
order_id = 100000

for _ in range(N_ROWS):
    order_id += 1
    country = random.choice(list(COUNTRIES.keys()))
    hemisphere = COUNTRIES[country]["hemisphere"]
    region = COUNTRIES[country]["region"]
    product = random.choice(list(PRODUCTS.keys()))
    crop = PRODUCTS[product]["crop"]

    weights = SEASON_WEIGHTS[(crop, hemisphere)]
    month = random.choices(range(1, 13), weights=weights, k=1)[0]
    year = random.choice(YEARS)
    day = random.randint(1, 28)
    order_date = date(year, month, day)

    customer = random.choice(CUSTOMERS[country])

    quantity = max(1, int(np.random.poisson(2)) + 1)
    base_price = PRODUCTS[product]["base_price"]
    unit_price = round(base_price * np.random.normal(1.0, 0.07), 2)
    revenue = round(unit_price * quantity, 2)

    channel = random.choices(["Dealer", "Vendita diretta"], weights=[8, 2])[0]

    currency = COUNTRY_CURRENCY[country]
    base_rate = BASE_FX_RATE[currency]
    # oscillazione realistica del tasso di cambio giorno per giorno (+-4%)
    fx_rate_used = round(base_rate * np.random.normal(1.0, 0.04), 6) if currency != "EUR" else 1.0
    unit_price_local = round(unit_price * fx_rate_used, 2)
    revenue_local = round(revenue * fx_rate_used, 2)

    rows.append(
        {
            "order_id": order_id,
            "order_date": order_date,
            "country": country,
            "region": region,
            "customer": customer,
            "product": product,
            "crop": crop,
            "quantity": quantity,
            "unit_price_eur": unit_price,
            "revenue_eur": revenue,
            "sales_channel": channel,
            "currency": currency,
            "fx_rate_used": fx_rate_used,
            "unit_price_local": unit_price_local,
            "revenue_local": revenue_local,
        }
    )

df = pd.DataFrame(rows)

# ---------------------------------------------------------------------------
# Iniezione anomalie (richieste dal progetto)
# ---------------------------------------------------------------------------
n = len(df)
rng = np.random.default_rng(42)

# 1) Formati data incoerenti: applica formattazioni diverse a righe casuali
df["order_date"] = df["order_date"].astype(object)
mixed_idx = rng.choice(n, size=int(n * 0.35), replace=False)
for i in mixed_idx:
    fmt = random.choice(DATE_FORMATS)
    df.at[i, "order_date"] = fmt(df.at[i, "order_date"])
# le restanti righe restano come oggetti date -> poi convertite a stringa ISO
remaining_idx = [i for i in range(n) if i not in set(mixed_idx)]
for i in remaining_idx:
    df.at[i, "order_date"] = df.at[i, "order_date"].strftime("%Y-%m-%d")

# 2) Valori mancanti in colonne chiave
for col, frac in [("customer", 0.03), ("unit_price_eur", 0.025), ("quantity", 0.015), ("region", 0.02)]:
    idx = rng.choice(n, size=int(n * frac), replace=False)
    df.loc[idx, col] = np.nan

# 3) Duplicati esatti (righe ripetute, stesso order_id)
dup_idx = rng.choice(n, size=25, replace=False)
df = pd.concat([df, df.loc[dup_idx]], ignore_index=True)

# 4) Valori fuori range / outlier / errori di digitazione
n2 = len(df)
out_idx = rng.choice(n2, size=15, replace=False)
for i in out_idx:
    choice = random.choice(["negative_qty", "huge_price", "zero_price", "typo_qty"])
    if choice == "negative_qty":
        df.at[i, "quantity"] = -abs(int(df.at[i, "quantity"] if pd.notna(df.at[i, "quantity"]) else 1))
    elif choice == "huge_price":
        df.at[i, "unit_price_eur"] = df.at[i, "unit_price_eur"] * 100  # errore di battitura (uno zero di troppo)
    elif choice == "zero_price":
        df.at[i, "unit_price_eur"] = 0
    elif choice == "typo_qty":
        df.at[i, "quantity"] = 999  # quantità irrealistica per una macchina agricola

# 5) Formati incoerenti nel testo (maiuscole/minuscole/spazi) in country/product
case_idx = rng.choice(n2, size=20, replace=False)
for i in case_idx:
    df.at[i, "country"] = df.at[i, "country"].upper()

space_idx = rng.choice(n2, size=15, replace=False)
for i in space_idx:
    df.at[i, "product"] = f"  {df.at[i, 'product']} "

# Shuffle finale per non avere i duplicati/anomalie raggruppati in fondo
df = df.sample(frac=1, random_state=42).reset_index(drop=True)

out_path = "tbr_sales.csv"
df.to_csv(out_path, index=False)
print(f"Creato {out_path} con {len(df)} righe.")
print(df.isna().sum())
