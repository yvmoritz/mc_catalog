// Varianten als CSV (Semikolon, UTF-8 mit BOM für Excel)
const lab = (l, lang, fb = '') => l?.[lang] || l?.de || l?.es || l?.en || fb;
const cell = (v) => {
  const s = v == null ? '' : String(v);
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function variantsCsv(data, lang = 'de') {
  const sup = new Map(data.suppliers.map((s) => [s.id, s]));
  const cat = new Map(data.categories.map((c) => [c.id, c]));
  const optKeys = [...new Set(data.categories.flatMap((c) => c.options.map((o) => o.key)))];
  const head = ['sku', 'base_no', 'model', 'category', 'supplier', 'supplier_model_no', 'supplier_sku', ...optKeys.flatMap((k) => [k, `${k}_code`]), 'ek', 'currency', 'moq', 'status'];
  const rows = [head];
  for (const p of data.products) {
    const c = cat.get(p.category_id);
    const vals = new Map(c.options.flatMap((o) => o.values.map((v) => [v.id, { ...v, key: o.key }])));
    for (const v of p.variants) {
      const byKey = {};
      for (const vid of Object.values(v.values)) { const x = vals.get(vid); if (x) byKey[x.key] = x; }
      rows.push([v.sku, p.base_no, p.name, c.name, sup.get(p.supplier_id)?.name, p.supplier_model_no, v.supplier_sku,
        ...optKeys.flatMap((k) => [byKey[k] ? lab(byKey[k].labels, lang, byKey[k].code) : '', byKey[k]?.code ?? '']),
        v.ek_eff == null ? '' : String(v.ek_eff).replace('.', ','), p.currency || sup.get(p.supplier_id)?.currency || data.tenant.currency,
        v.moq ?? p.moq ?? '', v.status]);
    }
  }
  return '﻿' + rows.map((r) => r.map(cell).join(';')).join('\r\n') + '\r\n';
}
