-- Logo je Mandant (hell/dunkel), PNG oder SVG
ALTER TABLE tenant ADD COLUMN logo BLOB;
ALTER TABLE tenant ADD COLUMN logo_mime TEXT;
ALTER TABLE tenant ADD COLUMN logo_dark BLOB;
ALTER TABLE tenant ADD COLUMN logo_dark_mime TEXT;
ALTER TABLE tenant ADD COLUMN logo_v INTEGER NOT NULL DEFAULT 0;
