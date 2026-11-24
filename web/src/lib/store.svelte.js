import { DICT, LANGS } from './i18n.js';

const ls = {
  get: (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* egal */ } },
};

function initialLang() {
  const saved = ls.get('mcc.lang', null);
  if (LANGS.includes(saved)) return saved;
  const nav = (navigator.language || 'es').slice(0, 2);
  return LANGS.includes(nav) ? nav : 'es';
}

export const ui = $state({
  lang: initialLang(),
  theme: ls.get('mcc.theme', matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'),
  route: { page: 'products', id: null },
  view: ls.get('mcc.view', 'list'), // list | visual
  edit: false,
  me: null,
  isAdmin: false,
  tenants: [],
  tenantId: null,
  data: null,
  filter: { q: '', supplier: 0, category: 0, status: '' },
  dialog: null,
  toast: null,
  busy: 0,
  undo: null, // { label, run }
  pasteTo: null, // { productId, src } für ⌘V
  hoverCard: null,
  loading: true,
});

export function t(key) {
  const d = DICT[ui.lang] || DICT.es;
  return key.split('.').reduce((o, k) => (o == null ? o : o[k]), d) ?? key;
}
/** Anzahl mit Einzahl/Mehrzahl, z. B. plural(1, 'model1', 'models') */
export const plural = (n, one, many) => `${n} ${t(n === 1 ? one : many)}`;
/** mehrsprachiges Label {es,de,en} → aktuelle Sprache mit Rückfall */
export const lab = (l, fb = '') => l?.[ui.lang] || l?.es || l?.de || l?.en || fb;

export function money(v, cur) {
  if (v == null || v === '') return '—';
  const loc = ui.lang === 'en' ? 'en-GB' : ui.lang === 'es' ? 'es-ES' : 'de-DE';
  return `${new Intl.NumberFormat(loc, { minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(v)}${cur ? ' ' + cur : ''}`;
}
export const fmtNum = (v) => (v == null ? '' : String(v).replace('.', ui.lang === 'en' ? '.' : ','));
export const imgUrl = (id, thumb = false) => (id ? `/api/images/${id}${thumb ? '?size=t' : ''}` : null);

export function setPref(key, value) {
  ui[key] = value;
  ls.set('mcc.' + key, value);
  if (key === 'theme') applyTheme();
  if (key === 'lang') document.documentElement.lang = value;
}

// ---------- Farben ----------
const hexRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
export function luminance(hex) {
  if (!/^#[0-9a-f]{6}$/i.test(hex || '')) return 1;
  const [r, g, b] = hexRgb(hex).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const onColor = (hex) => (luminance(hex) > 0.4 ? '#1A1210' : '#FFFFFF');
const rgba = (hex, a) => `rgba(${hexRgb(hex).join(', ')}, ${a})`;
const BRAND_VARS = ['--brand', '--on-brand', '--sand', '--on-sand', '--shadow'];

export function applyBranding() {
  const st = document.documentElement.style;
  for (const v of BRAND_VARS) st.removeProperty(v);
  const tn = ui.data?.tenant;
  document.title = tn ? `${tn.name} · ${t('app')}` : t('app');
  const fav = document.querySelector('link[rel="icon"]');
  if (fav) fav.href = tn?.logo || tn?.logo_dark || '/brand/mc-brown.svg';
  if (!tn) return;
  const p = tn.color_primary, a = tn.color_accent;
  if (ui.theme !== 'dark') {
    if (p) { st.setProperty('--brand', p); st.setProperty('--on-brand', onColor(p)); st.setProperty('--on-sand', p); st.setProperty('--shadow', rgba(p, 0.1)); }
    if (a) st.setProperty('--sand', a);
  } else if (a) {
    st.setProperty('--brand', a); st.setProperty('--on-brand', onColor(a)); st.setProperty('--on-sand', a);
  }
}

export function applyTheme() {
  const dark = ui.theme === 'dark';
  document.documentElement.classList.toggle('dark', dark);
  applyBranding();
  for (const m of document.querySelectorAll('meta[name="theme-color"]')) { m.setAttribute('content', dark ? '#2A201D' : '#FFFFFF'); m.removeAttribute('media'); }
}

// ---------- API ----------
function errMsg(data, res) {
  if (ui.lang === 'de' && data.message) return data.message; // Servertexte sind deutsch und nennen Details (z. B. SKU)
  return (data.error && DICT[ui.lang].err[data.error]) || data.message || res.statusText;
}
async function request(method, url, body, headers = {}) {
  let res;
  const raw = body instanceof Blob;
  try {
    res = await fetch('/api' + url, {
      method,
      headers: raw ? { 'Content-Type': body.type || 'application/octet-stream', ...headers } : body !== undefined ? { 'Content-Type': 'application/json' } : {},
      body: raw ? body : body !== undefined ? JSON.stringify(body) : undefined,
      credentials: 'same-origin',
    });
  } catch {
    throw Object.assign(new Error(t('err.network')), { code: 'network' });
  }
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(errMsg(data, res)), { code: data.error, status: res.status });
  return data;
}
export const api = {
  get: (u) => request('GET', u),
  post: (u, b) => request('POST', u, b ?? {}),
  patch: (u, b) => request('PATCH', u, b ?? {}),
  put: (u, b) => request('PUT', u, b ?? {}),
  del: (u) => request('DELETE', u),
};

let toastTimer;
export function toast(msg, kind = 'info') {
  ui.toast = { msg, kind };
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { ui.toast = null; }, 5000);
}

/** Änderung ausführen, danach neu laden; Fehler als Hinweis */
export async function mutate(fn) {
  try {
    const r = await fn();
    await refresh();
    return r;
  } catch (e) {
    toast(e.message, 'error');
    return undefined;
  }
}
export function setUndo(label, run) { ui.undo = { label, run }; }
export async function runUndo() {
  const u = ui.undo;
  ui.undo = null;
  if (u) await mutate(u.run);
}

// ---------- Bilder ----------
export async function uploadImage(productId, src, variantId = null) {
  ui.busy++;
  try {
    const q = variantId ? `?variant_id=${variantId}` : '';
    return typeof src === 'string'
      ? await api.post(`/products/${productId}/images/url`, { url: src, variant_id: variantId })
      : await request('POST', `/products/${productId}/images${q}`, src);
  } finally { ui.busy--; }
}

// ---------- Routing ----------
const PAGES = ['products', 'product', 'suppliers', 'settings'];
export function parseRoute() {
  const [, page, id] = (location.hash || '#/products').split('/');
  const next = PAGES.includes(page) ? page : 'products';
  const grp = (x) => (x === 'product' ? 'products' : x);
  if (grp(next) !== grp(ui.route.page)) ui.filter.q = ''; // Suche gilt je Bereich
  ui.route = { page: next, id: id ? Number(id) : null };
}
export function go(page, id = null) {
  const h = `#/${page}${id ? '/' + id : ''}`;
  if (location.hash !== h) location.hash = h;
  else parseRoute();
}

// ---------- Laden ----------
let es = null;
let refreshTimer = null;

export async function init() {
  applyTheme();
  document.documentElement.lang = ui.lang;
  parseRoute();
  addEventListener('hashchange', parseRoute);
  try {
    const me = await api.get('/me');
    ui.me = me.user;
    ui.isAdmin = !!me.is_admin;
    await loadTenants();
    const saved = Number(ls.get('mcc.tenant', 0));
    const target = ui.tenants.find((x) => x.id === saved) || ui.tenants[0];
    if (target) await openTenant(target.id);
  } catch (e) {
    toast(e.message, 'error');
  } finally {
    ui.loading = false;
  }
}
export async function loadTenants() { ui.tenants = await api.get('/tenants'); }

export async function openTenant(id) {
  ui.tenantId = id;
  ui.filter = { q: '', supplier: 0, category: 0, status: '' };
  ui.undo = null;
  ls.set('mcc.tenant', String(id));
  await refresh();
  connect(id);
}
export async function refresh() {
  if (!ui.tenantId) return;
  ui.data = await api.get(`/tenants/${ui.tenantId}/full`);
  applyBranding();
}
function connect(id) {
  es?.close();
  es = new EventSource(`/api/tenants/${id}/events`);
  es.addEventListener('change', () => {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => refresh().catch(() => {}), 150);
  });
}

// ---------- abgeleitete Daten ----------
export function catOf(p) { return ui.data?.categories.find((c) => c.id === p.category_id); }
export function supOf(p) { return ui.data?.suppliers.find((s) => s.id === p.supplier_id); }
export function colorOpt(cat) { return cat?.options.find((o) => o.is_color); }
export function valueById(cat, id) {
  for (const o of cat?.options || []) for (const v of o.values) if (v.id === id) return { ...v, opt: o };
  return null;
}
export function currencyOf(p) { return p.currency || supOf(p)?.currency || ui.data?.tenant.currency || ''; }

export function filteredProducts() {
  const d = ui.data;
  if (!d) return [];
  const q = ui.filter.q.trim().toLowerCase();
  return d.products.filter((p) => {
    if (ui.filter.supplier && p.supplier_id !== ui.filter.supplier) return false;
    if (ui.filter.category && p.category_id !== ui.filter.category) return false;
    if (ui.filter.status && p.status !== ui.filter.status) return false;
    if (!q) return true;
    return [p.base_no, p.name, p.supplier_model_no, ...p.variants.flatMap((v) => [v.sku, v.supplier_sku])].some((s) => s && s.toLowerCase().includes(q));
  });
}
