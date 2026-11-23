// SKU-Schema: gemeinsam für Server und Browser.
// Muster mit Tokens: {basis}, {lieferant}, {jahr} und je Option ihr key, z. B. {farbe}{pol}.

export const SKU_RE = /^[A-Z0-9][A-Z0-9._-]{0,39}$/;
export const KEY_RE = /^[a-z][a-z0-9_]{0,23}$/;
export const RESERVED = ['basis', 'lieferant', 'jahr'];

/** Code normalisieren: Großbuchstaben, nur A–Z 0–9 . _ - */
export const normCode = (s) => String(s ?? '').toUpperCase().replace(/[^A-Z0-9._-]/g, '');

export function formatBase(prefix, digits, n) {
  return normCode(prefix) + String(n).padStart(Math.max(1, Math.min(8, Number(digits) || 1)), '0');
}

/** Tokens eines Musters */
export function tokens(pattern) {
  return [...String(pattern || '').matchAll(/\{([a-z0-9_]+)\}/gi)].map((m) => m[1].toLowerCase());
}

/**
 * ctx: { basis, lieferant, jahr, values: { [optKey]: code } }
 * Unbekannte Tokens werden leer. Ergebnis normalisiert.
 */
export function renderSku(pattern, ctx) {
  const v = ctx.values || {};
  const out = String(pattern || '{basis}').replace(/\{([a-z0-9_]+)\}/gi, (_, k) => {
    k = k.toLowerCase();
    if (k === 'basis') return ctx.basis ?? '';
    if (k === 'lieferant') return ctx.lieferant ?? '';
    if (k === 'jahr') return String(ctx.jahr ?? new Date().getFullYear());
    return v[k] ?? '';
  });
  // doppelte oder hängende Trenner aufräumen (z. B. leerer Code zwischen zwei Punkten)
  return normCode(out).replace(/([._-])\1+/g, '$1').replace(/[._-]+$/, '');
}

export function validSku(s) { return SKU_RE.test(s); }
