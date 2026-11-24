import PDFDocument from 'pdfkit';
import sharp from 'sharp';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const FONT_DIR = path.join(path.dirname(require.resolve('@fontsource/albert-sans/package.json')), 'files');
const font = (w) => path.join(FONT_DIR, `albert-sans-latin-${w}-normal.woff`);

const T = {
  es: { ekS: 'Compra', title: 'Catálogo visual', variants: 'variantes', colors: 'Colores', supplier: 'Proveedor', material: 'Material', ek: 'Precio compra', from: 'desde', moq: 'MOQ', status: { draft: 'Borrador', active: 'Activo', inactive: 'Inactivo' }, page: 'Página', of: 'de', models: 'modelos', noImg: 'sin imagen', supSku: 'Ref. proveedor', generated: 'Generado', tiers: 'Escala', sur: 'Recargos' },
  de: { ekS: 'EK', title: 'Visueller Katalog', variants: 'Varianten', colors: 'Farben', supplier: 'Lieferant', material: 'Material', ek: 'EK', from: 'ab', moq: 'MOQ', status: { draft: 'Entwurf', active: 'Aktiv', inactive: 'Inaktiv' }, page: 'Seite', of: 'von', models: 'Modelle', noImg: 'kein Bild', supSku: 'Lief.-SKU', generated: 'Erstellt', tiers: 'Staffel', sur: 'Zuschläge' },
  en: { ekS: 'Cost', title: 'Visual catalogue', variants: 'variants', colors: 'Colours', supplier: 'Supplier', material: 'Material', ek: 'Purchase price', from: 'from', moq: 'MOQ', status: { draft: 'Draft', active: 'Active', inactive: 'Inactive' }, page: 'Page', of: 'of', models: 'models', noImg: 'no image', supSku: 'Supplier SKU', generated: 'Generated', tiers: 'Tiers', sur: 'Surcharges' },
};

const lab = (l, lang, fb = '') => l?.[lang] || l?.de || l?.es || l?.en || fb;
const money = (v, cur, lang) => (v == null ? '—' : `${new Intl.NumberFormat(lang === 'en' ? 'en-GB' : lang === 'es' ? 'es-ES' : 'de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(v)} ${cur || ''}`.trim());

/**
 * data = svc.full(tenantId); opts: { lang, supplierId, categoryId, includeInactive, productIds }
 * store = ImageStore (jpeg())
 */
/** Zeichen, die Albert Sans (latin) nicht hat, ersetzen */
const clean = (s) => String(s ?? '').replace(/≥/g, '>=').replace(/≤/g, '<=').replace(/[^\u0000-\u024F\u2000-\u206F\u20AC\u2122\u00D7]/g, '?');

export async function catalogPdf(data, store, opts = {}) {
  const lang = T[opts.lang] ? opts.lang : 'de';
  const t = T[lang];
  const brand = data.tenant.color_primary || '#4D231B';
  const accent = data.tenant.color_accent || '#EAD3B1';
  const ink = '#1A1210', muted = '#6B6563', line = '#E2DEDD';

  let products = data.products.filter((p) => p.status !== 'inactive' || opts.includeInactive);
  if (opts.supplierId) products = products.filter((p) => p.supplier_id === opts.supplierId);
  if (opts.categoryId) products = products.filter((p) => p.category_id === opts.categoryId);
  if (opts.productIds?.length) products = products.filter((p) => opts.productIds.includes(p.id));
  const supById = new Map(data.suppliers.map((s) => [s.id, s]));
  const catById = new Map(data.categories.map((c) => [c.id, c]));
  products.sort((a, b) => (supById.get(a.supplier_id)?.name || '~').localeCompare(supById.get(b.supplier_id)?.name || '~') || a.base_no.localeCompare(b.base_no));

  const doc = new PDFDocument({ size: 'A4', margin: 40, bufferPages: true, info: { Title: `${data.tenant.name} – ${t.title}`, Author: data.tenant.name } });
  const _text = doc.text.bind(doc), _w = doc.widthOfString.bind(doc);
  doc.text = (s, ...a) => _text(clean(s), ...a);
  doc.widthOfString = (s, ...a) => _w(clean(s), ...a);
  doc.registerFont('r', font(400));
  doc.registerFont('m', font(600));
  doc.registerFont('b', font(700));
  doc.registerFont('l', font(300));
  const chunks = [];
  doc.on('data', (c) => chunks.push(c));
  const done = new Promise((res) => doc.on('end', () => res(Buffer.concat(chunks))));

  const W = doc.page.width, H = doc.page.height, M = 40, CW = W - 2 * M;
  const imgCache = new Map();
  const jpg = async (file, max) => {
    const k = file + max;
    if (!imgCache.has(k)) imgCache.set(k, await store.jpeg(file, max).catch(() => null));
    return imgCache.get(k);
  };
  const imgFile = (p, id) => p.images.find((i) => i.id === id)?.file;

  /** Farbplättchen: Gestell 1 | Gestell 2, Glas als Linse in der Mitte; immer mit Rand, damit Helles sichtbar bleibt */
  const swatch = (x, y, r, v) => {
    const w = r * 3, h = r * 2, x0 = x - r, y0 = y - r;
    if (!v?.hex) {
      doc.save().roundedRect(x0, y0, w, h, 2).lineWidth(0.8).dash(1.5, { space: 1.5 }).strokeColor(muted).stroke().undash().restore();
      return;
    }
    doc.save().roundedRect(x0, y0, w, h, 2).clip();
    doc.rect(x0, y0, w, h).fillColor(v.hex).fill();
    if (v.hex2) doc.polygon([x0 + w, y0], [x0 + w, y0 + h], [x0 + w * 0.35, y0 + h]).fillColor(v.hex2).fill();
    doc.restore();
    if (v.hex3) doc.save().roundedRect(x0 + w * 0.3, y0 + h * 0.28, w * 0.4, h * 0.44, h * 0.2).fillColor(v.hex3).fill().lineWidth(0.5).strokeColor('#FFFFFF').stroke().restore();
    doc.save().roundedRect(x0, y0, w, h, 2).lineWidth(0.6).strokeColor('#00000040').stroke().restore();
  };
  /** Brillen-Platzhalter ohne Foto: Gläser in Glasfarbe, Rahmen Gestell 1, Brauenlinie Gestell 2 */
  const glasses = (x, y, w, h, v) => {
    const lw = w * 0.36, lh = Math.min(h * 0.55, lw * 0.75), gy = y + (h - lh) / 2, gap = w * 0.1, lx = x + (w - 2 * lw - gap) / 2;
    const t = Math.max(1.5, lw * 0.07);
    doc.save();
    for (const gx of [lx, lx + lw + gap]) {
      doc.roundedRect(gx, gy, lw, lh, lh * 0.35).fillOpacity(0.85).fillColor(v.hex3 || '#D9DDE0').fill();
      doc.fillOpacity(1).roundedRect(gx, gy, lw, lh, lh * 0.35).lineWidth(t).strokeColor(v.hex || '#888888').stroke();
    }
    doc.moveTo(lx + lw, gy + lh * 0.3).quadraticCurveTo(lx + lw + gap / 2, gy + lh * 0.05, lx + lw + gap, gy + lh * 0.3).lineWidth(t).strokeColor(v.hex || '#888888').stroke();
    if (v.hex2) doc.moveTo(lx + lh * 0.2, gy).lineTo(lx + 2 * lw + gap - lh * 0.2, gy).lineWidth(t * 0.9).strokeColor(v.hex2).stroke();
    doc.restore();
  };

  // Logo als PNG (SVG über sharp gerastert); opts.logo = { data, mime }, für dunklen Grund
  let logoPng = null;
  if (opts.logo?.data) {
    try { logoPng = await sharp(opts.logo.data, { density: 600 }).resize({ width: 1400, height: 700, fit: 'inside' }).png().toBuffer(); } catch { logoPng = null; }
  }

  // ---------- Deckblatt ----------
  doc.rect(0, 0, W, H).fill(brand);
  let ty = 140;
  if (logoPng) {
    doc.image(logoPng, M, 110, { fit: [220, 110], align: 'left', valign: 'top' });
    ty = 260;
  }
  doc.fillColor(accent).font('l').fontSize(14).text(t.title.toUpperCase(), M, ty, { characterSpacing: 3 });
  doc.fillColor('#FFFFFF').font('l').fontSize(44).text(data.tenant.name, M, ty + 30, { width: CW });
  const nVar = products.reduce((s, p) => s + p.variants.filter((v) => v.status === 'active' || opts.includeInactive).length, 0);
  doc.fillColor(accent).font('r').fontSize(12).text(`${products.length} ${t.models} · ${nVar} ${t.variants}`, M, doc.y + 12);
  const sups = [...new Set(products.map((p) => supById.get(p.supplier_id)?.name).filter(Boolean))];
  if (sups.length) doc.fillColor('#FFFFFF').fontSize(11).text(sups.join(' · '), M, doc.y + 6, { width: CW });
  doc.fillColor(accent).fontSize(9).text(`${t.generated} ${new Date().toLocaleDateString(lang === 'en' ? 'en-GB' : lang === 'es' ? 'es-ES' : 'de-DE')}`, M, H - 70);

  // ---------- je Produkt ----------
  for (const p of products) {
    doc.addPage();
    const cat = catById.get(p.category_id);
    const sup = supById.get(p.supplier_id);
    const colorOpt = cat?.options.find((o) => o.is_color);
    const valById = new Map(cat?.options.flatMap((o) => o.values.map((v) => [v.id, { ...v, opt: o }])) || []);
    const cur = p.currency || sup?.currency || data.tenant.currency;
    const vars = p.variants.filter((v) => v.status === 'active' || opts.includeInactive);

    // Kopf
    let y = M;
    doc.fillColor(brand).font('b').fontSize(11).text(p.base_no, M, y, { characterSpacing: 0.5 });
    doc.fillColor(ink).font('m').fontSize(22).text(p.name, M, y + 14, { width: CW - 170 });
    const meta = [sup?.name, cat?.name, p.material].filter(Boolean).join(' · ');
    doc.fillColor(muted).font('r').fontSize(10).text(meta, M, doc.y + 2, { width: CW - 170 });
    // rechts: Kennzahlen
    const eks = vars.map((v) => v.ek_eff).filter((v) => v != null);
    const kx = W - M - 160;
    doc.fillColor(muted).font('r').fontSize(8).text(t.ek.toUpperCase(), kx, y, { width: 160, align: 'right' });
    doc.fillColor(ink).font('m').fontSize(13).text(eks.length ? `${t.from} ${money(Math.min(...eks), cur, lang)}` : money(p.ek, cur, lang), kx, y + 10, { width: 160, align: 'right' });
    doc.fillColor(muted).font('r').fontSize(8).text(t.moq.toUpperCase(), kx, y + 30, { width: 160, align: 'right' });
    doc.fillColor(ink).font('m').fontSize(11).text(p.moq != null ? `${p.moq}${p.moq_unit ? ' / ' + p.moq_unit : ''}` : '—', kx, y + 40, { width: 160, align: 'right' });
    doc.fillColor(muted).font('r').fontSize(9).text(t.status[p.status], kx, y + 56, { width: 160, align: 'right' });
    y = Math.max(doc.y, y + 72) + 10;
    doc.moveTo(M, y).lineTo(W - M, y).lineWidth(0.6).strokeColor(line).stroke();
    y += 12;

    // Hauptbild
    const coverFile = imgFile(p, p.cover);
    const coverH = vars.length > 8 ? 170 : 210;
    doc.save().roundedRect(M, y, CW, coverH, 10).fillColor('#F7F6F6').fill().restore();
    if (coverFile) {
      const b = await jpg(coverFile, 1400);
      if (b) doc.image(b, M + 10, y + 10, { fit: [CW - 20, coverH - 20], align: 'center', valign: 'center' });
    } else {
      doc.fillColor(muted).font('r').fontSize(10).text(t.noImg, M, y + coverH / 2 - 6, { width: CW, align: 'center' });
    }
    y += coverH + 14;

    // Farbleiste: alle Farben des Modells mit Name + Code (nie nur Farbe)
    if (colorOpt) {
      const ids = [...new Set(vars.map((v) => v.values[colorOpt.id]).filter(Boolean))];
      if (ids.length) {
        doc.fillColor(muted).font('m').fontSize(8).text(t.colors.toUpperCase(), M, y, { characterSpacing: 1 });
        y += 14;
        let x = M;
        for (const id of ids) {
          const v = valById.get(id);
          const label = `${lab(v.labels, lang, v.code)} · ${v.code || '—'}`;
          doc.font('r').fontSize(9);
          const w = 26 + doc.widthOfString(label) + 14;
          if (x + w > W - M) { x = M; y += 20; }
          swatch(x + 7, y + 6, 6, v);
          doc.fillColor(ink).text(label, x + 22, y + 1, { lineBreak: false });
          x += w;
        }
        y += 24;
      }
    }

    // Variantenraster
    const cols = 4, gap = 10, cw = (CW - gap * (cols - 1)) / cols, imgH = 80, ch = imgH + 74;
    let i = 0;
    for (const v of vars) {
      if (y + ch > H - 50) { doc.addPage(); y = M; doc.fillColor(muted).font('m').fontSize(9).text(`${p.base_no} · ${p.name}`, M, y); y += 18; i = 0; }
      const col = i % cols;
      const x = M + col * (cw + gap);
      const inactive = v.status !== 'active';
      doc.save().roundedRect(x, y, cw, ch, 8).lineWidth(0.8);
      if (inactive) doc.dash(3, { space: 2 });
      doc.strokeColor(line).stroke().undash().restore();
      const cval = colorOpt ? valById.get(v.values[colorOpt.id]) : null;
      const vf = v.image_id ? imgFile(p, v.image_id) : null;
      if (vf) {
        const b = await jpg(vf, 600);
        if (b) doc.image(b, x + 6, y + 6, { fit: [cw - 12, imgH - 6], align: 'center', valign: 'center' });
      } else if (cval?.hex) {
        doc.save().roundedRect(x + 6, y + 6, cw - 12, imgH - 6, 6).fillColor('#F2F0EE').fill().restore();
        glasses(x + 10, y + 8, cw - 20, imgH - 10, cval);
      } else {
        doc.save().roundedRect(x + 6, y + 6, cw - 12, imgH - 6, 6).fillColor('#F7F6F6').fill().restore();
        doc.fillColor(muted).font('r').fontSize(8).text(t.noImg, x, y + imgH / 2 - 4, { width: cw, align: 'center' });
      }
      let ty = y + imgH + 8;
      doc.fillColor(ink).font('b').fontSize(10).text(v.sku, x + 10, ty, { width: cw - 20, lineBreak: false });
      ty += 14;
      if (cval) { swatch(x + 15, ty + 5, 4, cval); }
      const parts = Object.values(v.values).map((id) => valById.get(id)).filter(Boolean)
        .sort((a, b) => a.opt.sort - b.opt.sort)
        .map((val) => (val.opt.is_color ? `${lab(val.labels, lang, val.code)} (${val.code})` : (val.code ? lab(val.labels, lang, val.code) : null)))
        .filter(Boolean).join(' · ');
      doc.fillColor(ink).font('r').fontSize(9).text(parts || '—', x + (cval ? 24 : 10), ty, { width: cw - (cval ? 34 : 20), height: 24, ellipsis: true });
      ty += 26;
      doc.fillColor(muted).font('r').fontSize(8).text(`${t.ekS} ${money(v.ek_eff, cur, lang)} · ${t.moq} ${v.moq ?? p.moq ?? '—'}${inactive ? '  ·  ' + t.status.inactive : ''}`, x + 10, ty, { width: cw - 20, lineBreak: false });
      i++;
      if (col === cols - 1) y += ch + gap;
    }
    if (i % cols !== 0) y += ch + gap;

    // Staffel + Zuschläge kurz
    const extra = [];
    if (p.tiers.length) extra.push(`${t.tiers}: ` + p.tiers.map((x) => `${t.from} ${x.qty_from}: ${money(x.ek, cur, lang)}`).join(' · '));
    if (p.surcharges.length) extra.push(`${t.sur}: ` + p.surcharges.map((s) => `${s.label}${s.cond ? ' (' + s.cond + ')' : ''} +${s.amount_min ?? '?'}${s.amount_max != null && s.amount_max !== s.amount_min ? '–' + s.amount_max : ''} ${cur}`).join(' · '));
    if (extra.length) {
      if (y + 40 > H - 50) { doc.addPage(); y = M; }
      doc.fillColor(muted).font('r').fontSize(8.5).text(extra.join('\n'), M, y, { width: CW });
    }
  }

  // Fußzeile
  const range = doc.bufferedPageRange();
  for (let n = 1; n < range.count; n++) {
    doc.switchToPage(n);
    doc.page.margins.bottom = 0; // sonst legt pdfkit unter dem Rand eine neue Seite an
    doc.fillColor(muted).font('r').fontSize(8).text(`${data.tenant.name} · ${t.title}`, M, H - 28, { lineBreak: false });
    doc.text(`${t.page} ${n + 1} ${t.of} ${range.count}`, W - M - 120, H - 28, { width: 120, align: 'right', lineBreak: false });
  }
  doc.end();
  return done;
}
