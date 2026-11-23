-- Produktkatalog: Mandanten, Lieferanten, Kategorien mit Optionen, Produkte, Varianten, Bilder, Preise

CREATE TABLE app_user (
  name       TEXT PRIMARY KEY COLLATE NOCASE,
  is_admin   INTEGER NOT NULL DEFAULT 0,
  first_seen TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE tenant (
  id            INTEGER PRIMARY KEY,
  slug          TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  short         TEXT,                       -- Kürzel im Logo-Platzhalter, z. B. MC
  color_primary TEXT,                       -- #RRGGBB
  color_accent  TEXT,                       -- #RRGGBB
  sku_prefix    TEXT NOT NULL DEFAULT 'X',
  sku_digits    INTEGER NOT NULL DEFAULT 3,
  next_no       INTEGER NOT NULL DEFAULT 1,
  currency      TEXT NOT NULL DEFAULT 'EUR',
  created_at    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE tenant_access (
  tenant_id INTEGER NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  user_name TEXT    NOT NULL COLLATE NOCASE,
  PRIMARY KEY (tenant_id, user_name)
);

CREATE TABLE supplier (
  id         INTEGER PRIMARY KEY,
  tenant_id  INTEGER NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  code       TEXT,                          -- Kürzel für {lieferant} im SKU-Schema
  contact    TEXT,
  currency   TEXT,
  incoterm   TEXT,
  lead_time  TEXT,
  moq_note   TEXT,
  notes      TEXT,
  status     TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','favorite','ko')),
  sort       INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX supplier_tenant ON supplier(tenant_id);

CREATE TABLE category (
  id          INTEGER PRIMARY KEY,
  tenant_id   INTEGER NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  sku_pattern TEXT NOT NULL DEFAULT '{basis}',
  sort        INTEGER NOT NULL DEFAULT 0
);

-- Option je Kategorie (Farbe, Polarisiert, Größe …). key = Token im SKU-Schema
CREATE TABLE opt (
  id          INTEGER PRIMARY KEY,
  category_id INTEGER NOT NULL REFERENCES category(id) ON DELETE CASCADE,
  key         TEXT NOT NULL,
  labels      TEXT NOT NULL DEFAULT '{}',   -- {"es":"","de":"","en":""}
  is_color    INTEGER NOT NULL DEFAULT 0,
  sort        INTEGER NOT NULL DEFAULT 0,
  UNIQUE (category_id, key)
);

CREATE TABLE opt_value (
  id       INTEGER PRIMARY KEY,
  opt_id   INTEGER NOT NULL REFERENCES opt(id) ON DELETE CASCADE,
  code     TEXT NOT NULL DEFAULT '',        -- leer erlaubt (z. B. "ohne Polarisation")
  labels   TEXT NOT NULL DEFAULT '{}',
  hex      TEXT,                            -- Anzeigefarbe bei Farb-Optionen
  hex2     TEXT,                            -- Zweitfarbe (Muster, z. B. Havanna)
  ek_delta REAL NOT NULL DEFAULT 0,
  sort     INTEGER NOT NULL DEFAULT 0,
  UNIQUE (opt_id, code)
);

CREATE TABLE product (
  id                INTEGER PRIMARY KEY,
  tenant_id         INTEGER NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  category_id       INTEGER NOT NULL REFERENCES category(id),
  supplier_id       INTEGER REFERENCES supplier(id) ON DELETE SET NULL,
  base_no           TEXT NOT NULL,
  name              TEXT NOT NULL,
  supplier_model_no TEXT,
  material          TEXT,
  currency          TEXT,
  ek                REAL,
  moq               INTEGER,
  moq_unit          TEXT,                   -- z. B. "Farbe", "Order"
  lead_time         TEXT,
  incoterm          TEXT,
  status            TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','inactive')),
  notes             TEXT,
  cover_image_id    INTEGER,
  sort              INTEGER NOT NULL DEFAULT 0,
  created_at        TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (tenant_id, base_no)
);

CREATE TABLE variant (
  id           INTEGER PRIMARY KEY,
  tenant_id    INTEGER NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  product_id   INTEGER NOT NULL REFERENCES product(id) ON DELETE CASCADE,
  sku          TEXT NOT NULL,
  sku_manual   INTEGER NOT NULL DEFAULT 0,
  supplier_sku TEXT,
  ek           REAL,                        -- leer = EK Produkt + Aufpreise der Werte
  moq          INTEGER,
  status       TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  sort         INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (tenant_id, sku)
);
CREATE INDEX variant_product ON variant(product_id);

CREATE TABLE variant_value (
  variant_id   INTEGER NOT NULL REFERENCES variant(id) ON DELETE CASCADE,
  opt_id       INTEGER NOT NULL REFERENCES opt(id) ON DELETE CASCADE,
  opt_value_id INTEGER NOT NULL REFERENCES opt_value(id) ON DELETE CASCADE,
  PRIMARY KEY (variant_id, opt_id)
);

CREATE TABLE image (
  id         INTEGER PRIMARY KEY,
  tenant_id  INTEGER NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES product(id) ON DELETE CASCADE,
  variant_id INTEGER REFERENCES variant(id) ON DELETE CASCADE,
  file       TEXT NOT NULL,
  width      INTEGER,
  height     INTEGER,
  source_url TEXT,
  sort       INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX image_product ON image(product_id);

CREATE TABLE price_tier (
  id         INTEGER PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES product(id) ON DELETE CASCADE,
  qty_from   INTEGER NOT NULL,
  ek         REAL,
  note       TEXT
);

CREATE TABLE surcharge (
  id         INTEGER PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES product(id) ON DELETE CASCADE,
  label      TEXT NOT NULL,
  cond       TEXT,
  amount_min REAL,
  amount_max REAL
);
