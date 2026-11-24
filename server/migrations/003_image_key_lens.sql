-- Bilder: kurze zufällige ID für die URL (Cache-sicher, nie wiederverwendet)
ALTER TABLE image ADD COLUMN key TEXT;
UPDATE image SET key = lower(substr(hex(randomblob(5)), 1, 9)) WHERE key IS NULL;
CREATE UNIQUE INDEX image_key ON image(key);

-- Farbwerte: Gestell 1 (hex), Gestell 2 (hex2), Glas (hex3)
ALTER TABLE opt_value ADD COLUMN hex3 TEXT;
