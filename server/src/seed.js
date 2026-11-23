// Erster Start: Mandant Maison Condat mit Kategorien, Optionen und Lieferanten. Optional ein Beispielmodell.
const L = (es, de, en) => ({ es, de, en: en ?? de });

export function seedIfEmpty(svc, { demo = false } = {}) {
  if (svc.get('SELECT 1 FROM tenant LIMIT 1')) return false;
  const t = svc.createTenant({ name: 'Maison Condat', slug: 'maison-condat', short: 'MC', color_primary: '#4D231B', color_accent: '#EAD3B1', sku_prefix: 'X', sku_digits: 3, next_no: 123, currency: 'USD' });

  const gl = svc.createCategory(t.id, { name: 'Gafas', sku_pattern: '{basis}.{farbe}{pol}' });
  const farbe = svc.createOpt(gl.id, { key: 'farbe', labels: L('Color', 'Farbe', 'Colour'), is_color: true });
  const colors = [
    ['BLU', L('Azul', 'Blau', 'Blue'), '#1F5FAD'], ['GRN', L('Verde', 'Grün', 'Green'), '#3F7A4A'],
    ['BLK', L('Negro', 'Schwarz', 'Black'), '#111111'], ['BRN', L('Marrón', 'Braun', 'Brown'), '#6B4226'],
  ];
  const cv = Object.fromEntries(colors.map(([code, labels, hex]) => [code, svc.createValue(farbe.id, { code, labels, hex }).id]));
  const pol = svc.createOpt(gl.id, { key: 'pol', labels: L('Polarizado', 'Polarisiert', 'Polarised') });
  const pNo = svc.createValue(pol.id, { code: '', labels: L('Sin polarizar', 'Ohne', 'Standard') }).id;
  const pYes = svc.createValue(pol.id, { code: 'P', labels: L('Polarizado', 'Polarisiert', 'Polarised') }).id;

  const pk = svc.createCategory(t.id, { name: 'Packaging', sku_pattern: '{basis}.{groesse}' });
  const gr = svc.createOpt(pk.id, { key: 'groesse', labels: L('Tamaño', 'Größe', 'Size') });
  svc.createValue(gr.id, { code: '10', labels: L('Paño 10×10', 'Tuch 10×10', 'Cloth 10×10') });
  svc.createValue(gr.id, { code: '15', labels: L('Paño 15×15', 'Tuch 15×15', 'Cloth 15×15') });

  const taga = svc.createSupplier(t.id, { name: 'TAGA / Tagavision', code: 'TAG', contact: 'Nora', currency: 'USD', lead_time: '20–25 días', moq_note: '24 pzas/color (stock)', status: 'active' });
  svc.createSupplier(t.id, { name: 'Solo Solis', code: 'SOL', currency: 'EUR', moq_note: '25 pzas/pedido · branding 100/pedido, 15/modelo', status: 'active' });
  svc.createSupplier(t.id, { name: 'Xinxi', code: 'XIN', contact: 'Livia', currency: 'USD', lead_time: '15–20 días', moq_note: '1.000 pzas/artículo', status: 'favorite' });
  svc.createSupplier(t.id, { name: 'Wenzhou Classic Packing', code: 'WCP', contact: 'Vicky', currency: 'USD', moq_note: '3.000 pzas/SKU', status: 'ko' });

  if (demo) {
    const p = svc.createProduct(t.id, { name: 'Demo', category_id: gl.id, supplier_id: taga.id, material: 'PC / TR + CP', currency: 'USD', ek: 4, moq: 24, moq_unit: 'color', lead_time: '20–25 días', status: 'active' });
    svc.generateVariants(p.id, { values: { [farbe.id]: Object.values(cv), [pol.id]: [pNo, pYes] } });
    svc.setTiers(p.id, [{ qty_from: 24, ek: 4 }]);
    svc.setSurcharges(p.id, [{ label: 'Logo en patillas', cond: '≥ 300 pzas/envío', amount_min: 0.8, amount_max: 1 }]);
  }
  return true;
}
