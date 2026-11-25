-- Lokale Optionswerte: product_id gesetzt = nur für dieses Produkt (z. B. Sonderfarbe), NULL = Vorlage für alle
ALTER TABLE opt_value ADD COLUMN product_id INTEGER REFERENCES product(id) ON DELETE CASCADE;
CREATE INDEX opt_value_product ON opt_value(product_id);
