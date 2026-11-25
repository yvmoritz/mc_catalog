# Catálogo · cincovest

Self-hosted Produktkatalog, mandantenfähig. Start mit Maison Condat. Oberfläche ES / DE / EN, Tag- und Nachtmodus, farbfehlsichtig-sicher.

Ziel-URL: `catalog.apps.cincovest.com`

## Funktionen

| Bereich | Umfang |
|---|---|
| Mandanten | Eigener Name, Kürzel, Haupt- und Zweitfarbe, Währung, Nummernkreis. Admins sehen alle Mandanten und vergeben den Zugriff |
| Lieferanten | Name, Kürzel (Token `{lieferant}`), Kontakt, Währung, Incoterm, Lieferzeit, MOQ/Konditionen, Status aktiv/Favorit/K.O. |
| Kategorien | Je Kategorie ein SKU-Muster und Optionen (z. B. Farbe, Polarisiert, Größe) |
| Optionen | Token (`{farbe}`), Name ES/DE/EN, „ist Farbe“. Werte mit Code, Name ES/DE/EN, drei Farben (Gestell 1, Gestell 2 optional, Glas), EK-Aufpreis. Leerer Code erlaubt (z. B. „ohne Polarisation“). Werte sind Vorlagen für alle Produkte oder **lokal** für ein Produkt (z. B. Sonderfarbe, kein neuer Stammsatz); lokal → Vorlage per Klick. Codes bleiben je Option eindeutig |
| Produkte (Modelle) | Basis-Nr. aus Nummernkreis (`X123`), Lieferant, Lief.-Modell-Nr., Material, EK, Währung, MOQ je Einheit, Lieferzeit, Incoterm, Status, Notizen, Preisstaffel, Zuschläge |
| Varianten | Kombination der Optionswerte. Interne SKU aus Muster, z. B. `{basis}.{farbe}{pol}` → `X123.BLU`, `X123.BLUP`. Manuell überschreibbar (Marke „manuell“). Lief.-SKU, EK (leer = Produkt-EK + Aufpreise), MOQ, aktiv/inaktiv |
| Varianten erzeugen | Werte markieren → alle fehlenden Kombinationen. Doppelte Kombinationen und SKUs werden übersprungen |
| SKU aus Schema | Muster ändern lässt bestehende SKUs stehen. Neuberechnung per Aktion; Kollisionen werden gemeldet, nicht überschrieben |
| Ansicht Liste | Tabelle mit Suche (Modell, SKU, Lief.-Nr.), Filter Lieferant / Kategorie / Status |
| Ansicht Visuell | Produktbilder, gruppiert nach Lieferant. Farbpunkt wählt die Variante, Bild wechselt mit |
| Visuell · Bearbeiten | Schalter „Bearbeiten“. Bild ablegen auf: Hauptbild = Bild der gezeigten Variante · Varianten-Kachel = Bild dieser Variante · „+ Ablegen“ = neue Variante (Farbe wählen oder neu anlegen, SKU-Vorschau live) · „Neues Modell“ = Modell mit nächster Basis-Nr. Quelle: Datei, Bild aus anderem Browserfenster (URL), Link auf Produktseite (og:image), ⌘V. Letzte Aktion rückgängig |
| Bilder | Werden auf max. 1600 px als WebP gespeichert, plus 480-px-Thumbnail. Auslieferung unter einer kurzen Zufalls-ID (`/api/img/efbas4sk`), die nie wiederverwendet wird; daher dauerhaft cachebar. Zuordnung Produkt/Variante, Hauptbild wählbar |
| PDF | Nur in der Ansicht Visuell. Filter: Sprache, Status (aktiv/Entwurf/inaktiv), Lieferant, Kategorie, optional nur Suchtreffer. Visueller Katalog: Deckblatt, je Modell eine Seite mit Hauptbild, Farbleiste (alle Farben mit Name + Code) und Raster aller Varianten (Bild oder Farbfläche, SKU, Optionen, EK, MOQ). ES/DE/EN, Filter Lieferant/Kategorie, optional inaktive |
| CSV | Alle Varianten mit Optionen und Codes, Semikolon, UTF-8 (Excel) |
| Live | Änderungen erscheinen per Server-Sent Events sofort in allen offenen Browsern |
| Farbfehlsichtigkeit | Status über Form + Text (● aktiv, ◌ Entwurf, — inaktiv durchgestrichen), Farbpunkte immer mit Name/Code, Auswahl über Ring/Häkchen, Fehler in Blau mit Symbol, Ablageflächen gestrichelt + Text |

## Stack

- Backend: Node 22, Fastify 5, better-sqlite3 (WAL), sharp, pdfkit, SSE
- Frontend: Svelte 5, Vite 7, Albert Sans (lokal eingebunden, keine externen Requests)
- SKU-Logik: `shared/sku.js`, gemeinsam für Server und Browser
- Ein Container; Daten unter `/data` (`catalog.db`, `img/`)

## Betrieb mit Docker

Das Image wird bei jedem Push auf `main` von GitHub Actions gebaut (amd64 + arm64) und nach `ghcr.io/yvmoritz/mc_catalog` geschoben. Tags: `latest`, `sha-<kurz>`, bei Git-Tags `v1.2.3` zusätzlich `1.2.3` und `1.2`.

```bash
docker compose pull
docker compose up -d
# http://<host>:3000
```

Ist das Package privat: einmalig `docker login ghcr.io` mit einem Token mit `read:packages`.

### Nginx Proxy Manager

| Einstellung | Wert |
|---|---|
| Domain | `catalog.apps.cincovest.com` |
| Forward | `http://<host>:3000` |
| Websockets | nicht nötig (SSE) |
| Access List | Basic Auth, **Pass Auth to Host = an** |
| Custom Nginx | `client_max_body_size 16m;` und `proxy_buffering off;` (Upload bis 15 MB, Live-Updates) |

Der erste Benutzer, der sich anmeldet, ist Admin. Weitere Benutzer erscheinen nach ihrer ersten Anmeldung unter *Einstellungen → Zugriff*.

### Umgebungsvariablen

| Variable | Standard | Zweck |
|---|---|---|
| `AUTH_BASIC` | `true` | Benutzername aus dem Basic-Header des Proxys |
| `REQUIRE_AUTH` | `true` | ohne Benutzer kein Zugriff |
| `DEV_USER` | – | fester Benutzer ohne Proxy (nur lokal) |
| `SEED_DEMO` | `false` | Beispielmodell X123 „Demo“ mit 8 Varianten |
| `IMG_FETCH_ALLOW_PRIVATE` | `false` | Bild-URLs aus privaten Netzen erlauben |
| `DATA_DIR` | `/data` | Datenbank und Bilder |

### Bild-Import per URL

Der Server lädt die URL selbst. Schutz: nur http(s), keine privaten/lokalen Adressen (auch nach DNS und Weiterleitungen), max. 15 MB, 12 s Timeout, nur Bildformate. HTML-Seiten: `og:image` wird genommen. Blockt eine Seite das (Hotlink-Schutz, Login), Bild speichern und als Datei ablegen.

### Backup

`/data` sichern (SQLite im WAL-Modus: im Betrieb `sqlite3 /data/catalog.db ".backup /data/backup.db"`, dazu `img/`).

## Entwicklung

```bash
npm run install:all
npm run dev:server   # :3000, DEV_USER=dev, Demo-Daten
npm run dev:web      # :5174, Proxy auf :3000
npm test
```

## API (Auszug)

| Methode | Pfad | Zweck |
|---|---|---|
| GET | `/api/tenants/:id/full` | alle Daten eines Mandanten |
| POST | `/api/tenants/:id/products` | Modell (Basis-Nr. automatisch) |
| POST | `/api/products/:id/variants` | Variante; `values {optId: valueId}`, `new_values {optId: {code, labels, hex}}` |
| POST | `/api/products/:id/generate` | Kombinationen erzeugen |
| POST | `/api/products/:id/resku` | SKU aus Schema |
| POST | `/api/products/:id/images` | Bild als Rohdaten (`Content-Type: image/*`), `?variant_id=` |
| POST | `/api/products/:id/images/url` | Bild per URL oder `data:`-URL |
| GET | `/api/tenants/:id/catalog.pdf` | `lang`, `supplier`, `category`, `inactive=1` |
| GET | `/api/tenants/:id/variants.csv` | CSV |
