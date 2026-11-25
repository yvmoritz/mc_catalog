import { randomBytes } from 'node:crypto';
import { formatBase, renderSku, validSku, normCode, KEY_RE, RESERVED } from '../../shared/sku.js';

export class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const HEX = /^#[0-9A-Fa-f]{6}$/;
const LANGS = ['es', 'de', 'en'];
const SLUG = /^[a-z0-9][a-z0-9-]{0,39}$/;

const str = (v, max = 200) => {
  if (v === undefined) return undefined;
  if (v === null) return null;
  const s = String(v).trim();
  if (s.length > max) throw new HttpError(400, 'invalid', `Text zu lang (max. ${max})`);
  return s === '' ? null : s;
};
const num = (v) => {
  if (v === undefined) return undefined;
  if (v === null || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
  if (!Number.isFinite(n)) throw new HttpError(400, 'invalid', 'Zahl ungültig');
  return n;
};
const int = (v) => {
  const n = num(v);
  if (n === undefined || n === null) return n;
  if (!Number.isInteger(n) || n < 0) throw new HttpError(400, 'invalid', 'Ganze Zahl ≥ 0 erwartet');
  return n;
};
const hex = (v) => {
  if (v === undefined) return undefined;
  if (v === null || v === '') return null;
  if (!HEX.test(v)) throw new HttpError(400, 'invalid', 'Farbe als #RRGGBB');
  return v.toUpperCase();
};
const oneOf = (v, list) => {
  if (v === undefined) return undefined;
  if (!list.includes(v)) throw new HttpError(400, 'invalid', `Wert muss ${list.join(', ')} sein`);
  return v;
};
const labels = (v) => {
  if (v === undefined) return undefined;
  const o = typeof v === 'string' ? { es: v, de: v, en: v } : v || {};
  const r = {};
  for (const l of LANGS) if (o[l] != null && String(o[l]).trim()) r[l] = String(o[l]).trim().slice(0, 80);
  return JSON.stringify(r);
};
const parseLabels = (s) => { try { return JSON.parse(s || '{}'); } catch { return {}; } };

/** nur definierte Felder in ein UPDATE übernehmen */
function patchSql(table, id, fields) {
  const keys = Object.keys(fields).filter((k) => fields[k] !== undefined);
  if (!keys.length) return null;
  return { sql: `UPDATE ${table} SET ${keys.map((k) => `${k} = @${k}`).join(', ')} WHERE id = @id`, params: { ...Object.fromEntries(keys.map((k) => [k, fields[k]])), id } };
}

const TENANT_COLS = 'id, slug, name, short, color_primary, color_accent, sku_prefix, sku_digits, next_no, currency, created_at, logo_mime, logo_dark_mime, logo_v';
/** Logo-URLs statt Binärdaten */
function withLogo(t) {
  const { logo_mime, logo_dark_mime, logo_v, ...rest } = t;
  const url = (v) => `/api/tenants/${t.id}/logo/${v}?v=${logo_v}`;
  return { ...rest, logo: logo_mime ? url('light') : null, logo_dark: logo_dark_mime ? url('dark') : null };
}

const KEY_ABC = 'abcdefghijkmnpqrstuvwxyz23456789'; // ohne l, o, 0, 1
/** kurze zufällige ID, z. B. "efbas4sk" */
export function shortKey(n = 8) {
  const b = randomBytes(n);
  let k = '';
  for (let i = 0; i < n; i++) k += KEY_ABC[b[i] % KEY_ABC.length];
  return k;
}

export class Service {
  constructor(db, hub) {
    this.db = db;
    this.hub = hub;
    this._st = new Map();
  }

  st(sql) {
    let s = this._st.get(sql);
    if (!s) { s = this.db.prepare(sql); this._st.set(sql, s); }
    return s;
  }
  get(sql, ...p) { return this.st(sql).get(...p); }
  all(sql, ...p) { return this.st(sql).all(...p); }
  run(sql, ...p) { return this.st(sql).run(...p); }
  tx(fn) { return this.db.transaction(fn)(); }
  emit(tenantId, what, by) { this.hub?.publish(tenantId, { type: 'change', what, by: by || null }); }
  patch(table, id, fields) {
    const q = patchSql(table, id, fields);
    if (q) this.db.prepare(q.sql).run(q.params);
  }

  // ---------- Benutzer ----------
  seeUser(name) {
    const u = this.get('SELECT * FROM app_user WHERE name = ?', name);
    if (u) {
      this.run('UPDATE app_user SET last_seen = CURRENT_TIMESTAMP WHERE name = ?', name);
      return u;
    }
    const first = !this.get('SELECT 1 FROM app_user LIMIT 1');
    this.run('INSERT INTO app_user (name, is_admin) VALUES (?, ?)', name, first ? 1 : 0);
    return this.get('SELECT * FROM app_user WHERE name = ?', name);
  }
  users() { return this.all('SELECT name, is_admin, first_seen, last_seen FROM app_user ORDER BY name'); }
  setAdmin(name, isAdmin, by) {
    if (!this.get('SELECT 1 FROM app_user WHERE name = ?', name)) throw new HttpError(404, 'not_found', 'Benutzer unbekannt');
    if (!isAdmin && this.get('SELECT COUNT(*) n FROM app_user WHERE is_admin = 1').n <= 1 && this.get('SELECT is_admin FROM app_user WHERE name = ?', name).is_admin)
      throw new HttpError(409, 'last_admin', 'Mindestens ein Admin muss bleiben');
    this.run('UPDATE app_user SET is_admin = ? WHERE name = ?', isAdmin ? 1 : 0, name);
    return this.users();
  }
  canAccess(user, tenantId) {
    return !!this.get('SELECT 1 FROM tenant_access WHERE tenant_id = ? AND user_name = ?', tenantId, user);
  }

  // ---------- Mandanten ----------
  tenant(id) {
    const t = this.get(`SELECT ${TENANT_COLS} FROM tenant WHERE id = ?`, id);
    if (!t) throw new HttpError(404, 'not_found', 'Mandant nicht gefunden');
    return withLogo(t);
  }
  tenantBySlug(slug) { return this.get('SELECT id, slug FROM tenant WHERE slug = ?', slug); }
  listTenants(user) {
    const sql = `SELECT ${TENANT_COLS.replace(/(^|, )(?=[a-z])/g, '$1t.')}, (SELECT COUNT(*) FROM product p WHERE p.tenant_id = t.id) AS product_count FROM tenant t`;
    return user
      ? this.all(`${sql} JOIN tenant_access a ON a.tenant_id = t.id AND a.user_name = ? ORDER BY t.name`, user).map(withLogo)
      : this.all(`${sql} ORDER BY t.name`).map(withLogo);
  }
  tenantFields(b) {
    return {
      name: str(b.name, 80), short: b.short === undefined ? undefined : str(b.short, 3)?.toUpperCase() ?? null,
      color_primary: hex(b.color_primary), color_accent: hex(b.color_accent),
      sku_prefix: b.sku_prefix === undefined ? undefined : normCode(b.sku_prefix).slice(0, 8),
      sku_digits: b.sku_digits === undefined ? undefined : Math.max(1, Math.min(8, int(b.sku_digits) || 1)),
      next_no: b.next_no === undefined ? undefined : Math.max(1, int(b.next_no) || 1),
      currency: b.currency === undefined ? undefined : oneOf(String(b.currency).toUpperCase(), ['EUR', 'USD', 'CNY', 'GBP']),
    };
  }
  createTenant(b, user) {
    const name = str(b.name, 80);
    if (!name) throw new HttpError(400, 'invalid', 'Name fehlt');
    const slug = String(b.slug || name).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
    if (!SLUG.test(slug)) throw new HttpError(400, 'invalid', 'Kürzel ungültig');
    if (this.tenantBySlug(slug)) throw new HttpError(409, 'exists', 'Mandant existiert schon');
    const f = this.tenantFields(b);
    const short = f.short ?? name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
    const id = this.tx(() => {
      const r = this.run(`INSERT INTO tenant (slug, name, short, color_primary, color_accent, sku_prefix, sku_digits, next_no, currency)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, slug, name, short, f.color_primary ?? null, f.color_accent ?? null,
        f.sku_prefix ?? 'X', f.sku_digits ?? 3, f.next_no ?? 1, f.currency ?? 'EUR');
      const tid = Number(r.lastInsertRowid);
      if (user) this.run('INSERT OR IGNORE INTO tenant_access (tenant_id, user_name) VALUES (?, ?)', tid, user);
      return tid;
    });
    return this.tenant(id);
  }
  updateTenant(id, b, by) {
    this.tenant(id);
    this.patch('tenant', id, this.tenantFields(b));
    this.emit(id, 'tenant', by);
    return this.tenant(id);
  }
  setLogo(id, variant, mime, buf, by) {
    this.tenant(id);
    if (!['light', 'dark'].includes(variant)) throw new HttpError(400, 'invalid', 'Variante light oder dark');
    const col = variant === 'dark' ? 'logo_dark' : 'logo';
    if (buf === null) {
      this.run(`UPDATE tenant SET ${col} = NULL, ${col}_mime = NULL, logo_v = logo_v + 1 WHERE id = ?`, id);
    } else {
      if (!['image/png', 'image/svg+xml'].includes(mime)) throw new HttpError(400, 'invalid', 'Logo muss PNG oder SVG sein');
      if (buf.length > 512 * 1024) throw new HttpError(400, 'invalid', 'Logo größer als 512 KB');
      const isPng = buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
      const isSvg = /<svg[\s>]/i.test(buf.subarray(0, 4096).toString('utf8'));
      if ((mime === 'image/png' && !isPng) || (mime === 'image/svg+xml' && !isSvg)) throw new HttpError(400, 'invalid', 'Dateiinhalt passt nicht zum Format');
      this.run(`UPDATE tenant SET ${col} = ?, ${col}_mime = ?, logo_v = logo_v + 1 WHERE id = ?`, buf, mime, id);
    }
    this.emit(id, 'tenant', by);
    return this.tenant(id);
  }
  logo(id, variant) {
    const col = variant === 'dark' ? 'logo_dark' : 'logo';
    const r = this.get(`SELECT ${col} AS data, ${col}_mime AS mime FROM tenant WHERE id = ?`, id);
    if (!r?.data) throw new HttpError(404, 'not_found', 'Kein Logo');
    return r;
  }
  deleteTenant(id) { this.tenant(id); this.run('DELETE FROM tenant WHERE id = ?', id); }
  tenantAccess(id) {
    const on = new Set(this.all('SELECT user_name FROM tenant_access WHERE tenant_id = ?', id).map((r) => r.user_name.toLowerCase()));
    return this.users().map((u) => ({ ...u, access: !!u.is_admin || on.has(u.name.toLowerCase()) }));
  }
  setTenantAccess(id, names) {
    this.tenant(id);
    if (!Array.isArray(names)) throw new HttpError(400, 'invalid', 'users: Liste erwartet');
    this.tx(() => {
      this.run('DELETE FROM tenant_access WHERE tenant_id = ?', id);
      for (const n of names) this.run('INSERT OR IGNORE INTO tenant_access (tenant_id, user_name) VALUES (?, ?)', id, String(n));
    });
    return this.tenantAccess(id);
  }

  // ---------- Gesamtdaten eines Mandanten ----------
  full(tenantId) {
    const tenant = this.tenant(tenantId);
    const suppliers = this.all('SELECT * FROM supplier WHERE tenant_id = ? ORDER BY sort, name', tenantId);
    const categories = this.all('SELECT * FROM category WHERE tenant_id = ? ORDER BY sort, id', tenantId);
    const opts = this.all(`SELECT o.* FROM opt o JOIN category c ON c.id = o.category_id WHERE c.tenant_id = ? ORDER BY o.sort, o.id`, tenantId);
    const vals = this.all(`SELECT v.* FROM opt_value v JOIN opt o ON o.id = v.opt_id JOIN category c ON c.id = o.category_id
      WHERE c.tenant_id = ? ORDER BY v.sort, v.id`, tenantId);
    const valById = new Map(vals.map((v) => [v.id, { ...v, labels: parseLabels(v.labels) }]));
    for (const c of categories) {
      c.options = opts.filter((o) => o.category_id === c.id).map((o) => ({
        ...o, is_color: !!o.is_color, labels: parseLabels(o.labels),
        values: [...valById.values()].filter((v) => v.opt_id === o.id),
      }));
    }
    const products = this.all('SELECT * FROM product WHERE tenant_id = ? ORDER BY sort, base_no', tenantId);
    const variants = this.all('SELECT * FROM variant WHERE tenant_id = ? ORDER BY sort, id', tenantId);
    const vv = this.all('SELECT vv.* FROM variant_value vv JOIN variant v ON v.id = vv.variant_id WHERE v.tenant_id = ?', tenantId);
    const images = this.all('SELECT id, key, product_id, variant_id, file, width, height, source_url, sort FROM image WHERE tenant_id = ? ORDER BY sort, id', tenantId);
    const tiers = this.all('SELECT t.* FROM price_tier t JOIN product p ON p.id = t.product_id WHERE p.tenant_id = ? ORDER BY qty_from', tenantId);
    const sur = this.all('SELECT s.* FROM surcharge s JOIN product p ON p.id = s.product_id WHERE p.tenant_id = ? ORDER BY s.id', tenantId);
    const vvBy = new Map();
    for (const r of vv) { if (!vvBy.has(r.variant_id)) vvBy.set(r.variant_id, {}); vvBy.get(r.variant_id)[r.opt_id] = r.opt_value_id; }
    for (const p of products) {
      p.variants = variants.filter((v) => v.product_id === p.id).map((v) => {
        const values = vvBy.get(v.id) || {};
        const delta = Object.values(values).reduce((s, id) => s + (valById.get(id)?.ek_delta || 0), 0);
        const img = images.find((i) => i.variant_id === v.id);
        return { ...v, sku_manual: !!v.sku_manual, values, ek_eff: v.ek ?? (p.ek == null ? null : Math.round((p.ek + delta) * 10000) / 10000), image_id: img?.id ?? null };
      });
      p.images = images.filter((i) => i.product_id === p.id);
      p.cover = p.images.find((i) => i.id === p.cover_image_id)?.id ?? p.images[0]?.id ?? null;
      p.tiers = tiers.filter((t) => t.product_id === p.id);
      p.surcharges = sur.filter((s) => s.product_id === p.id);
    }
    return { tenant, suppliers, categories, products };
  }

  // ---------- Lieferanten ----------
  supplier(id) {
    const s = this.get('SELECT * FROM supplier WHERE id = ?', id);
    if (!s) throw new HttpError(404, 'not_found', 'Lieferant nicht gefunden');
    return s;
  }
  supplierFields(b) {
    return {
      name: str(b.name, 80), code: b.code === undefined ? undefined : (normCode(b.code).slice(0, 8) || null),
      contact: str(b.contact, 300), currency: str(b.currency, 3)?.toUpperCase(), incoterm: str(b.incoterm, 20),
      lead_time: str(b.lead_time, 60), moq_note: str(b.moq_note, 200), notes: str(b.notes, 4000),
      status: oneOf(b.status, ['active', 'favorite', 'ko']), sort: int(b.sort),
    };
  }
  createSupplier(tenantId, b, by) {
    this.tenant(tenantId);
    const f = this.supplierFields(b);
    if (!f.name) throw new HttpError(400, 'invalid', 'Name fehlt');
    const r = this.run(`INSERT INTO supplier (tenant_id, name, code, contact, currency, incoterm, lead_time, moq_note, notes, status, sort)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, tenantId, f.name, f.code ?? null, f.contact ?? null, f.currency ?? null, f.incoterm ?? null,
      f.lead_time ?? null, f.moq_note ?? null, f.notes ?? null, f.status ?? 'active', f.sort ?? 0);
    this.emit(tenantId, 'supplier', by);
    return this.supplier(Number(r.lastInsertRowid));
  }
  updateSupplier(id, b, by) {
    const s = this.supplier(id);
    const f = this.supplierFields(b);
    if (f.name === null) throw new HttpError(400, 'invalid', 'Name fehlt');
    this.patch('supplier', id, f);
    this.emit(s.tenant_id, 'supplier', by);
    return this.supplier(id);
  }
  deleteSupplier(id, by) {
    const s = this.supplier(id);
    this.run('DELETE FROM supplier WHERE id = ?', id);
    this.emit(s.tenant_id, 'supplier', by);
  }

  // ---------- Kategorien und Optionen ----------
  category(id) {
    const c = this.get('SELECT * FROM category WHERE id = ?', id);
    if (!c) throw new HttpError(404, 'not_found', 'Kategorie nicht gefunden');
    return c;
  }
  checkPattern(p) {
    if (p === undefined) return undefined;
    const s = String(p || '').trim();
    if (!s.includes('{basis}')) throw new HttpError(400, 'invalid', 'Muster braucht {basis}');
    if (s.length > 80 || /[^A-Za-z0-9._{}-]/.test(s)) throw new HttpError(400, 'invalid', 'Muster: nur Tokens und A–Z 0–9 . _ -');
    return s;
  }
  createCategory(tenantId, b, by) {
    this.tenant(tenantId);
    const name = str(b.name, 60);
    if (!name) throw new HttpError(400, 'invalid', 'Name fehlt');
    const sort = this.get('SELECT COALESCE(MAX(sort), 0) + 1 n FROM category WHERE tenant_id = ?', tenantId).n;
    const r = this.run('INSERT INTO category (tenant_id, name, sku_pattern, sort) VALUES (?, ?, ?, ?)', tenantId, name, this.checkPattern(b.sku_pattern) ?? '{basis}', sort);
    this.emit(tenantId, 'category', by);
    return this.category(Number(r.lastInsertRowid));
  }
  updateCategory(id, b, by) {
    const c = this.category(id);
    this.patch('category', id, { name: str(b.name, 60) ?? undefined, sku_pattern: this.checkPattern(b.sku_pattern), sort: int(b.sort) });
    this.emit(c.tenant_id, 'category', by);
    return this.category(id);
  }
  deleteCategory(id, by) {
    const c = this.category(id);
    if (this.get('SELECT 1 FROM product WHERE category_id = ? LIMIT 1', id)) throw new HttpError(409, 'in_use', 'Kategorie hat Produkte');
    this.run('DELETE FROM category WHERE id = ?', id);
    this.emit(c.tenant_id, 'category', by);
  }
  opt(id) {
    const o = this.get('SELECT o.*, c.tenant_id FROM opt o JOIN category c ON c.id = o.category_id WHERE o.id = ?', id);
    if (!o) throw new HttpError(404, 'not_found', 'Option nicht gefunden');
    return o;
  }
  createOpt(categoryId, b, by) {
    const c = this.category(categoryId);
    const key = String(b.key || '').trim().toLowerCase();
    if (!KEY_RE.test(key) || RESERVED.includes(key)) throw new HttpError(400, 'invalid', 'Token: a–z, 0–9, _ ; nicht basis/lieferant/jahr');
    if (this.get('SELECT 1 FROM opt WHERE category_id = ? AND key = ?', categoryId, key)) throw new HttpError(409, 'exists', 'Token existiert schon');
    const sort = this.get('SELECT COALESCE(MAX(sort), 0) + 1 n FROM opt WHERE category_id = ?', categoryId).n;
    const r = this.run('INSERT INTO opt (category_id, key, labels, is_color, sort) VALUES (?, ?, ?, ?, ?)', categoryId, key, labels(b.labels) ?? '{}', b.is_color ? 1 : 0, sort);
    this.emit(c.tenant_id, 'option', by);
    return this.opt(Number(r.lastInsertRowid));
  }
  updateOpt(id, b, by) {
    const o = this.opt(id);
    this.patch('opt', id, { labels: labels(b.labels), is_color: b.is_color === undefined ? undefined : (b.is_color ? 1 : 0), sort: int(b.sort) });
    this.emit(o.tenant_id, 'option', by);
    return this.opt(id);
  }
  deleteOpt(id, by) {
    const o = this.opt(id);
    if (this.get('SELECT 1 FROM variant_value WHERE opt_id = ? LIMIT 1', id)) throw new HttpError(409, 'in_use', 'Option wird von Varianten benutzt');
    this.run('DELETE FROM opt WHERE id = ?', id);
    this.emit(o.tenant_id, 'option', by);
  }
  value(id) {
    const v = this.get('SELECT v.*, o.category_id, c.tenant_id FROM opt_value v JOIN opt o ON o.id = v.opt_id JOIN category c ON c.id = o.category_id WHERE v.id = ?', id);
    if (!v) throw new HttpError(404, 'not_found', 'Wert nicht gefunden');
    return v;
  }
  /** Code je Option eindeutig (Vorlagen und lokale Werte zusammen), damit SKUs eindeutig bleiben */
  codeTaken(optId, code, exceptId = 0) {
    const r = this.get(`SELECT v.id, v.product_id, p.base_no FROM opt_value v LEFT JOIN product p ON p.id = v.product_id
      WHERE v.opt_id = ? AND v.code = ? AND v.id != ?`, optId, code, exceptId);
    if (r) throw new HttpError(409, 'exists', `Code „${code || '(leer)'}“ existiert schon${r.product_id ? ` (lokal bei ${r.base_no})` : ''}`);
  }
  /** b.product_id: lokaler Wert nur für dieses Produkt */
  createValue(optId, b, by) {
    const o = this.opt(optId);
    const code = normCode(b.code).slice(0, 12);
    this.codeTaken(optId, code);
    let productId = null;
    if (b.product_id) {
      const p = this.product(Number(b.product_id));
      if (p.category_id !== o.category_id) throw new HttpError(400, 'invalid', 'Produkt hat andere Kategorie');
      productId = p.id;
    }
    const sort = this.get('SELECT COALESCE(MAX(sort), 0) + 1 n FROM opt_value WHERE opt_id = ?', optId).n;
    const r = this.run('INSERT INTO opt_value (opt_id, product_id, code, labels, hex, hex2, hex3, ek_delta, sort) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      optId, productId, code, labels(b.labels) ?? '{}', hex(b.hex) ?? null, hex(b.hex2) ?? null, hex(b.hex3) ?? null, num(b.ek_delta) ?? 0, sort);
    this.emit(o.tenant_id, 'option', by);
    return { ...this.value(Number(r.lastInsertRowid)) };
  }
  updateValue(id, b, by) {
    const v = this.value(id);
    let code;
    if (b.code !== undefined) {
      code = normCode(b.code).slice(0, 12);
      if (code !== v.code) this.codeTaken(v.opt_id, code, id);
    }
    let product_id;
    if (b.product_id !== undefined) {
      if (b.product_id === null) product_id = null; // lokal → Vorlage
      else {
        const p = this.product(Number(b.product_id));
        if (p.category_id !== v.category_id) throw new HttpError(400, 'invalid', 'Produkt hat andere Kategorie');
        const other = this.get('SELECT 1 FROM variant_value vv JOIN variant x ON x.id = vv.variant_id WHERE vv.opt_value_id = ? AND x.product_id != ? LIMIT 1', id, p.id);
        if (other) throw new HttpError(409, 'in_use', 'Wert wird von anderen Produkten benutzt');
        product_id = p.id;
      }
    }
    this.patch('opt_value', id, { code, product_id, labels: labels(b.labels), hex: hex(b.hex), hex2: hex(b.hex2), hex3: hex(b.hex3), ek_delta: num(b.ek_delta) ?? undefined, sort: int(b.sort) });
    this.emit(v.tenant_id, 'option', by);
    return this.value(id);
  }
  deleteValue(id, by) {
    const v = this.value(id);
    if (this.get('SELECT 1 FROM variant_value WHERE opt_value_id = ? LIMIT 1', id)) throw new HttpError(409, 'in_use', 'Wert wird von Varianten benutzt');
    this.run('DELETE FROM opt_value WHERE id = ?', id);
    this.emit(v.tenant_id, 'option', by);
  }

  // ---------- Produkte ----------
  product(id) {
    const p = this.get('SELECT * FROM product WHERE id = ?', id);
    if (!p) throw new HttpError(404, 'not_found', 'Produkt nicht gefunden');
    return p;
  }
  /** nächste freie Basis-Nr. ziehen (zählt next_no hoch) */
  nextBase(tenantId, peek = false) {
    const t = this.tenant(tenantId);
    let n = t.next_no;
    let b;
    do { b = formatBase(t.sku_prefix, t.sku_digits, n++); } while (this.get('SELECT 1 FROM product WHERE tenant_id = ? AND base_no = ?', tenantId, b));
    if (!peek) this.run('UPDATE tenant SET next_no = ? WHERE id = ?', n, tenantId);
    return b;
  }
  productFields(b, tenantId) {
    const f = {
      name: str(b.name, 120), supplier_model_no: str(b.supplier_model_no, 60), material: str(b.material, 80),
      currency: b.currency === undefined ? undefined : (str(b.currency, 3)?.toUpperCase() ?? null),
      ek: num(b.ek), moq: int(b.moq), moq_unit: str(b.moq_unit, 30), lead_time: str(b.lead_time, 60), incoterm: str(b.incoterm, 20),
      status: oneOf(b.status, ['draft', 'active', 'inactive']), notes: str(b.notes, 4000), sort: int(b.sort),
    };
    if (b.supplier_id !== undefined) {
      f.supplier_id = b.supplier_id === null || b.supplier_id === '' ? null : Number(b.supplier_id);
      if (f.supplier_id !== null && this.supplier(f.supplier_id).tenant_id !== tenantId) throw new HttpError(400, 'invalid', 'Lieferant gehört zu anderem Mandanten');
    }
    if (b.category_id !== undefined) {
      f.category_id = Number(b.category_id);
      if (this.category(f.category_id).tenant_id !== tenantId) throw new HttpError(400, 'invalid', 'Kategorie gehört zu anderem Mandanten');
    }
    if (b.base_no !== undefined) {
      f.base_no = normCode(b.base_no);
      if (!validSku(f.base_no)) throw new HttpError(400, 'invalid', 'Basis-Nr. ungültig');
    }
    if (b.cover_image_id !== undefined) f.cover_image_id = b.cover_image_id === null ? null : Number(b.cover_image_id);
    return f;
  }
  createProduct(tenantId, b, by) {
    const id = this.tx(() => {
      const f = this.productFields(b, tenantId);
      if (!f.category_id) {
        const c = this.get('SELECT id FROM category WHERE tenant_id = ? ORDER BY sort, id LIMIT 1', tenantId);
        if (!c) throw new HttpError(400, 'invalid', 'Erst eine Kategorie anlegen');
        f.category_id = c.id;
      }
      const base = f.base_no || this.nextBase(tenantId);
      if (this.get('SELECT 1 FROM product WHERE tenant_id = ? AND base_no = ?', tenantId, base)) throw new HttpError(409, 'exists', `Basis-Nr. ${base} existiert schon`);
      const sort = this.get('SELECT COALESCE(MAX(sort), 0) + 1 n FROM product WHERE tenant_id = ?', tenantId).n;
      const r = this.run(`INSERT INTO product (tenant_id, category_id, supplier_id, base_no, name, supplier_model_no, material, currency, ek, moq, moq_unit,
        lead_time, incoterm, status, notes, sort) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      tenantId, f.category_id, f.supplier_id ?? null, base, f.name || base, f.supplier_model_no ?? null, f.material ?? null, f.currency ?? null,
      f.ek ?? null, f.moq ?? null, f.moq_unit ?? null, f.lead_time ?? null, f.incoterm ?? null, f.status ?? 'draft', f.notes ?? null, sort);
      return Number(r.lastInsertRowid);
    });
    this.emit(tenantId, 'product', by);
    return this.product(id);
  }
  updateProduct(id, b, by) {
    const p = this.product(id);
    const f = this.productFields(b, p.tenant_id);
    if (f.name === null) throw new HttpError(400, 'invalid', 'Name fehlt');
    if (f.base_no && f.base_no !== p.base_no && this.get('SELECT 1 FROM product WHERE tenant_id = ? AND base_no = ?', p.tenant_id, f.base_no))
      throw new HttpError(409, 'exists', `Basis-Nr. ${f.base_no} existiert schon`);
    if (f.category_id && f.category_id !== p.category_id && this.get('SELECT 1 FROM variant WHERE product_id = ? LIMIT 1', id))
      throw new HttpError(409, 'has_variants', 'Kategorie nur ohne Varianten änderbar');
    if (f.cover_image_id && !this.get('SELECT 1 FROM image WHERE id = ? AND product_id = ?', f.cover_image_id, id)) throw new HttpError(400, 'invalid', 'Bild gehört nicht zum Produkt');
    this.patch('product', id, { ...f, updated_at: new Date().toISOString() });
    this.emit(p.tenant_id, 'product', by);
    return this.product(id);
  }
  deleteProduct(id, by) {
    const p = this.product(id);
    const files = this.all('SELECT file FROM image WHERE product_id = ?', id).map((r) => r.file);
    this.run('DELETE FROM product WHERE id = ?', id);
    this.emit(p.tenant_id, 'product', by);
    return files;
  }
  duplicateProduct(id, by) {
    const p = this.product(id);
    const np = this.createProduct(p.tenant_id, { ...p, base_no: undefined, name: `${p.name} (2)`, status: 'draft', cover_image_id: undefined }, by);
    this.tx(() => {
      for (const t of this.all('SELECT * FROM price_tier WHERE product_id = ?', id)) this.run('INSERT INTO price_tier (product_id, qty_from, ek, note) VALUES (?, ?, ?, ?)', np.id, t.qty_from, t.ek, t.note);
      for (const s of this.all('SELECT * FROM surcharge WHERE product_id = ?', id)) this.run('INSERT INTO surcharge (product_id, label, cond, amount_min, amount_max) VALUES (?, ?, ?, ?, ?)', np.id, s.label, s.cond, s.amount_min, s.amount_max);
      // lokale Werte, die die Kopie mitbenutzt, werden zur Vorlage (jetzt in zwei Produkten)
      this.run(`UPDATE opt_value SET product_id = NULL WHERE product_id = ? AND id IN
        (SELECT vv.opt_value_id FROM variant_value vv JOIN variant x ON x.id = vv.variant_id WHERE x.product_id = ?)`, id, id);
      for (const v of this.all('SELECT * FROM variant WHERE product_id = ?', id)) {
        const values = Object.fromEntries(this.all('SELECT opt_id, opt_value_id FROM variant_value WHERE variant_id = ?', v.id).map((r) => [r.opt_id, r.opt_value_id]));
        this.insertVariant(np, { values, supplier_sku: v.supplier_sku, ek: v.ek, moq: v.moq, status: v.status });
      }
    });
    this.emit(p.tenant_id, 'product', by);
    return np;
  }

  // ---------- Varianten ----------
  variant(id) {
    const v = this.get('SELECT * FROM variant WHERE id = ?', id);
    if (!v) throw new HttpError(404, 'not_found', 'Variante nicht gefunden');
    return v;
  }
  /** values {optId: valueId} prüfen: Optionen gehören zur Kategorie des Produkts */
  checkValues(p, values) {
    const out = {};
    for (const [o, v] of Object.entries(values || {})) {
      if (v === null || v === undefined || v === '') continue;
      const val = this.value(Number(v));
      if (val.opt_id !== Number(o) || val.category_id !== p.category_id) throw new HttpError(400, 'invalid', 'Wert passt nicht zur Kategorie');
      if (val.product_id && val.product_id !== p.id) throw new HttpError(400, 'invalid', `Wert „${val.code}“ ist lokal bei einem anderen Produkt`);
      out[Number(o)] = val.id;
    }
    return out;
  }
  computeSku(p, values) {
    const c = this.category(p.category_id);
    const opts = this.all('SELECT id, key FROM opt WHERE category_id = ?', p.category_id);
    const codes = {};
    for (const o of opts) codes[o.key] = values[o.id] ? this.get('SELECT code FROM opt_value WHERE id = ?', values[o.id]).code : '';
    const sup = p.supplier_id ? this.get('SELECT code, name FROM supplier WHERE id = ?', p.supplier_id) : null;
    return renderSku(c.sku_pattern, { basis: p.base_no, lieferant: sup?.code || normCode(sup?.name || '').slice(0, 3), values: codes });
  }
  sameCombination(productId, values, exceptId = 0) {
    const want = JSON.stringify(Object.entries(values).map(([o, v]) => [Number(o), v]).sort((a, b) => a[0] - b[0]));
    for (const v of this.all('SELECT id FROM variant WHERE product_id = ? AND id != ?', productId, exceptId)) {
      const have = JSON.stringify(this.all('SELECT opt_id, opt_value_id FROM variant_value WHERE variant_id = ? ORDER BY opt_id', v.id).map((r) => [r.opt_id, r.opt_value_id]));
      if (have === want) return v.id;
    }
    return null;
  }
  insertVariant(p, b) {
    const values = this.checkValues(p, b.values);
    if (this.sameCombination(p.id, values)) throw new HttpError(409, 'exists', 'Variante mit dieser Kombination existiert schon');
    const auto = this.computeSku(p, values);
    let sku = b.sku ? normCode(b.sku) : auto;
    if (!validSku(sku)) throw new HttpError(400, 'invalid', `SKU „${sku}“ ungültig`);
    if (this.get('SELECT 1 FROM variant WHERE tenant_id = ? AND sku = ?', p.tenant_id, sku)) throw new HttpError(409, 'exists', `SKU ${sku} existiert schon`);
    const sort = this.get('SELECT COALESCE(MAX(sort), 0) + 1 n FROM variant WHERE product_id = ?', p.id).n;
    const r = this.run(`INSERT INTO variant (tenant_id, product_id, sku, sku_manual, supplier_sku, ek, moq, status, sort) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      p.tenant_id, p.id, sku, sku !== auto ? 1 : 0, str(b.supplier_sku, 60) ?? null, num(b.ek) ?? null, int(b.moq) ?? null,
      oneOf(b.status, ['active', 'inactive']) ?? 'active', sort);
    const vid = Number(r.lastInsertRowid);
    for (const [o, v] of Object.entries(values)) this.run('INSERT INTO variant_value (variant_id, opt_id, opt_value_id) VALUES (?, ?, ?)', vid, Number(o), v);
    return vid;
  }
  /**
   * b.values {optId: valueId}; b.new_values {optId: {code, labels, hex}} legt fehlende Werte gleich mit an (Visuell-Modus)
   */
  createVariant(productId, b, by) {
    const p = this.product(productId);
    const id = this.tx(() => {
      const values = { ...(b.values || {}) };
      for (const [o, nv] of Object.entries(b.new_values || {})) {
        const opt = this.opt(Number(o));
        if (opt.category_id !== p.category_id) throw new HttpError(400, 'invalid', 'Option passt nicht zur Kategorie');
        const code = normCode(nv.code).slice(0, 12);
        const ex = this.get('SELECT id FROM opt_value WHERE opt_id = ? AND code = ? AND (product_id IS NULL OR product_id = ?)', opt.id, code, p.id);
        values[o] = ex ? ex.id : this.createValue(opt.id, { ...nv, product_id: nv.local ? p.id : null }, by).id;
      }
      return this.insertVariant(p, { ...b, values });
    });
    this.run('UPDATE product SET updated_at = CURRENT_TIMESTAMP WHERE id = ?', productId);
    this.emit(p.tenant_id, 'variant', by);
    return this.variant(id);
  }
  /** b.values {optId: [valueIds]} → alle fehlenden Kombinationen anlegen */
  generateVariants(productId, b, by) {
    const p = this.product(productId);
    const lists = Object.entries(b.values || {}).map(([o, ids]) => [Number(o), (Array.isArray(ids) ? ids : [ids]).map(Number)]).filter(([, ids]) => ids.length);
    if (!lists.length) throw new HttpError(400, 'invalid', 'Keine Werte gewählt');
    let combos = [{}];
    for (const [o, ids] of lists) combos = combos.flatMap((c) => ids.map((v) => ({ ...c, [o]: v })));
    if (combos.length > 500) throw new HttpError(400, 'too_many', 'Mehr als 500 Kombinationen');
    const created = [], skipped = [];
    this.tx(() => {
      for (const c of combos) {
        const values = this.checkValues(p, c);
        if (this.sameCombination(p.id, values)) { skipped.push({ values, reason: 'exists' }); continue; }
        const sku = this.computeSku(p, values);
        if (this.get('SELECT 1 FROM variant WHERE tenant_id = ? AND sku = ?', p.tenant_id, sku)) { skipped.push({ values, sku, reason: 'sku' }); continue; }
        created.push(this.insertVariant(p, { values, status: 'active' }));
      }
    });
    this.emit(p.tenant_id, 'variant', by);
    return { created: created.length, skipped };
  }
  updateVariant(id, b, by) {
    const v = this.variant(id);
    const p = this.product(v.product_id);
    this.tx(() => {
      let values;
      if (b.values !== undefined) {
        values = this.checkValues(p, b.values);
        if (this.sameCombination(p.id, values, id)) throw new HttpError(409, 'exists', 'Kombination existiert schon');
        this.run('DELETE FROM variant_value WHERE variant_id = ?', id);
        for (const [o, val] of Object.entries(values)) this.run('INSERT INTO variant_value (variant_id, opt_id, opt_value_id) VALUES (?, ?, ?)', id, Number(o), val);
      }
      const f = { supplier_sku: str(b.supplier_sku, 60), ek: num(b.ek), moq: int(b.moq), status: oneOf(b.status, ['active', 'inactive']), sort: int(b.sort) };
      if (b.sku !== undefined) {
        const cur = values ?? Object.fromEntries(this.all('SELECT opt_id, opt_value_id FROM variant_value WHERE variant_id = ?', id).map((r) => [r.opt_id, r.opt_value_id]));
        const auto = this.computeSku(p, cur);
        const sku = b.sku === null || b.sku === '' ? auto : normCode(b.sku);
        if (!validSku(sku)) throw new HttpError(400, 'invalid', `SKU „${sku}“ ungültig`);
        if (sku !== v.sku && this.get('SELECT 1 FROM variant WHERE tenant_id = ? AND sku = ?', p.tenant_id, sku)) throw new HttpError(409, 'exists', `SKU ${sku} existiert schon`);
        f.sku = sku;
        f.sku_manual = sku !== auto ? 1 : 0;
      }
      this.patch('variant', id, f);
    });
    this.emit(p.tenant_id, 'variant', by);
    return this.variant(id);
  }
  /** mehrere Varianten auf einmal: ids + Felder ek, moq, status */
  bulkVariants(tenantId, b, by) {
    const ids = (b.ids || []).map(Number);
    const f = { ek: num(b.ek), moq: int(b.moq), status: oneOf(b.status, ['active', 'inactive']) };
    this.tx(() => {
      for (const id of ids) {
        if (this.variant(id).tenant_id !== tenantId) throw new HttpError(403, 'forbidden', 'Variante gehört zu anderem Mandanten');
        this.patch('variant', id, f);
      }
    });
    this.emit(tenantId, 'variant', by);
    return { updated: ids.length };
  }
  /** SKU neu aus Schema; ids leer = alle nicht-manuellen des Produkts. Kollisionen werden gemeldet, nicht überschrieben */
  resku(productId, b, by) {
    const p = this.product(productId);
    const ids = Array.isArray(b.ids) && b.ids.length ? b.ids.map(Number)
      : this.all('SELECT id FROM variant WHERE product_id = ? AND sku_manual = 0', productId).map((r) => r.id);
    const changed = [], conflicts = [];
    this.tx(() => {
      for (const id of ids) {
        const v = this.variant(id);
        if (v.product_id !== productId) continue;
        const values = Object.fromEntries(this.all('SELECT opt_id, opt_value_id FROM variant_value WHERE variant_id = ?', id).map((r) => [r.opt_id, r.opt_value_id]));
        const sku = this.computeSku(p, values);
        if (sku === v.sku && !v.sku_manual) continue;
        if (this.get('SELECT 1 FROM variant WHERE tenant_id = ? AND sku = ? AND id != ?', p.tenant_id, sku, id)) { conflicts.push({ id, sku }); continue; }
        this.run('UPDATE variant SET sku = ?, sku_manual = 0 WHERE id = ?', sku, id);
        changed.push({ id, from: v.sku, to: sku });
      }
    });
    this.emit(p.tenant_id, 'variant', by);
    return { changed, conflicts };
  }
  deleteVariant(id, by) {
    const v = this.variant(id);
    const files = this.all('SELECT file FROM image WHERE variant_id = ?', id).map((r) => r.file);
    this.run('DELETE FROM variant WHERE id = ?', id);
    this.emit(v.tenant_id, 'variant', by);
    return files;
  }

  // ---------- Staffel und Zuschläge ----------
  setTiers(productId, list, by) {
    const p = this.product(productId);
    if (!Array.isArray(list)) throw new HttpError(400, 'invalid', 'Liste erwartet');
    this.tx(() => {
      this.run('DELETE FROM price_tier WHERE product_id = ?', productId);
      for (const t of list) {
        const q = int(t.qty_from);
        if (q === null || q === undefined) continue;
        this.run('INSERT INTO price_tier (product_id, qty_from, ek, note) VALUES (?, ?, ?, ?)', productId, q, num(t.ek) ?? null, str(t.note, 120) ?? null);
      }
    });
    this.emit(p.tenant_id, 'product', by);
    return this.all('SELECT * FROM price_tier WHERE product_id = ? ORDER BY qty_from', productId);
  }
  setSurcharges(productId, list, by) {
    const p = this.product(productId);
    if (!Array.isArray(list)) throw new HttpError(400, 'invalid', 'Liste erwartet');
    this.tx(() => {
      this.run('DELETE FROM surcharge WHERE product_id = ?', productId);
      for (const s of list) {
        const label = str(s.label, 80);
        if (!label) continue;
        this.run('INSERT INTO surcharge (product_id, label, cond, amount_min, amount_max) VALUES (?, ?, ?, ?, ?)', productId, label, str(s.cond, 120) ?? null, num(s.amount_min) ?? null, num(s.amount_max) ?? null);
      }
    });
    this.emit(p.tenant_id, 'product', by);
    return this.all('SELECT * FROM surcharge WHERE product_id = ?', productId);
  }

  // ---------- Bilder (Dateien schreibt images.js) ----------
  imageByKey(key) {
    const i = /^[a-z0-9]{6,16}$/.test(String(key)) ? this.get('SELECT * FROM image WHERE key = ?', key) : null;
    if (!i) throw new HttpError(404, 'not_found', 'Bild nicht gefunden');
    return i;
  }
  image(id) {
    const i = this.get('SELECT * FROM image WHERE id = ?', id);
    if (!i) throw new HttpError(404, 'not_found', 'Bild nicht gefunden');
    return i;
  }
  addImage(productId, variantId, meta, by) {
    const p = this.product(productId);
    if (variantId && this.variant(variantId).product_id !== productId) throw new HttpError(400, 'invalid', 'Variante gehört nicht zum Produkt');
    const sort = this.get('SELECT COALESCE(MAX(sort), 0) + 1 n FROM image WHERE product_id = ?', productId).n;
    let key;
    do { key = shortKey(); } while (this.get('SELECT 1 FROM image WHERE key = ?', key));
    const r = this.run('INSERT INTO image (key, tenant_id, product_id, variant_id, file, width, height, source_url, sort) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      key, p.tenant_id, productId, variantId || null, meta.file, meta.width ?? null, meta.height ?? null, meta.source_url ?? null, sort);
    const id = Number(r.lastInsertRowid);
    if (!p.cover_image_id && !variantId) this.run('UPDATE product SET cover_image_id = ? WHERE id = ?', id, productId);
    this.emit(p.tenant_id, 'image', by);
    return this.image(id);
  }
  updateImage(id, b, by) {
    const i = this.image(id);
    const f = { sort: int(b.sort) };
    if (b.variant_id !== undefined) {
      f.variant_id = b.variant_id === null ? null : Number(b.variant_id);
      if (f.variant_id && this.variant(f.variant_id).product_id !== i.product_id) throw new HttpError(400, 'invalid', 'Variante gehört nicht zum Produkt');
    }
    this.patch('image', id, f);
    this.emit(i.tenant_id, 'image', by);
    return this.image(id);
  }
  deleteImage(id, by) {
    const i = this.image(id);
    this.run('DELETE FROM image WHERE id = ?', id);
    this.run('UPDATE product SET cover_image_id = NULL WHERE cover_image_id = ?', id);
    this.emit(i.tenant_id, 'image', by);
    return i.file;
  }
}

export { parseLabels };
