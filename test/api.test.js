import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
const sharp = createRequire(import.meta.url)('../server/node_modules/sharp');
import { openDb } from '../server/src/db.js';
import { buildApp } from '../server/src/app.js';
import { seedIfEmpty } from '../server/src/seed.js';
import { renderSku, formatBase } from '../shared/sku.js';
import { isPrivateIp } from '../server/src/images.js';

const basic = (u) => ({ authorization: 'Basic ' + Buffer.from(`${u}:x`).toString('base64') });

function setup() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcc-'));
  const db = openDb(':memory:');
  const app = buildApp({ db, dataDir, requireAuth: true, authBasic: true });
  seedIfEmpty(app.svc, { demo: true });
  const as = (u) => async (method, url, payload, headers = {}) => {
    const r = await app.inject({ method, url, payload, headers: { ...basic(u), ...headers } });
    return { status: r.statusCode, json: () => r.json(), body: r.rawPayload, headers: r.headers };
  };
  return { app, admin: as('yannik'), other: as('will'), dataDir };
}

const png = (hex) => sharp({ create: { width: 400, height: 240, channels: 3, background: hex } }).png().toBuffer();

test('sku helpers', () => {
  assert.equal(formatBase('x', 3, 7), 'X007');
  assert.equal(renderSku('{basis}.{farbe}{pol}', { basis: 'X123', values: { farbe: 'BLU', pol: 'P' } }), 'X123.BLUP');
  assert.equal(renderSku('{basis}.{farbe}{pol}', { basis: 'X123', values: { farbe: 'BLU', pol: '' } }), 'X123.BLU');
  assert.equal(renderSku('{basis}.{farbe}.{pol}', { basis: 'X1', values: { farbe: 'BLK' } }), 'X1.BLK');
  assert.equal(renderSku('{basis}-{x}', { basis: 'a1' }), 'A1');
});

test('private ip guard', () => {
  for (const ip of ['127.0.0.1', '10.1.2.3', '192.168.1.1', '172.20.0.1', '169.254.169.254', '::1', 'fe80::1', '::ffff:127.0.0.1', 'fd00::1']) assert.ok(isPrivateIp(ip), ip);
  for (const ip of ['8.8.8.8', '2606:4700::1111']) assert.ok(!isPrivateIp(ip), ip);
});

test('seed + full + generated variants', async () => {
  const { admin } = setup();
  const me = (await admin('GET', '/api/me')).json();
  assert.equal(me.is_admin, true);
  const [t] = (await admin('GET', '/api/tenants')).json();
  const full = (await admin('GET', `/api/tenants/${t.id}/full`)).json();
  const p = full.products[0];
  assert.equal(p.base_no, 'X123');
  assert.deepEqual(p.variants.map((v) => v.sku).sort(), ['X123.BLK', 'X123.BLKP', 'X123.BLU', 'X123.BLUP', 'X123.BRN', 'X123.BRNP', 'X123.GRN', 'X123.GRNP']);
  assert.equal(p.variants[0].ek_eff, 4);
  const next = (await admin('GET', `/api/tenants/${t.id}/next-base`)).json();
  assert.equal(next.base_no, 'X124');
});

test('variant from visual drop with new colour value, manual sku, conflicts', async () => {
  const { admin } = setup();
  const [t] = (await admin('GET', '/api/tenants')).json();
  const full = (await admin('GET', `/api/tenants/${t.id}/full`)).json();
  const p = full.products[0];
  const cat = full.categories.find((c) => c.id === p.category_id);
  const farbe = cat.options.find((o) => o.key === 'farbe');
  const pol = cat.options.find((o) => o.key === 'pol');
  const pNo = pol.values.find((v) => v.code === '').id;
  let r = await admin('POST', `/api/products/${p.id}/variants`, { values: { [pol.id]: pNo }, new_values: { [farbe.id]: { code: 'hav', labels: { de: 'Havanna' }, hex: '#8A5A2B' } } });
  assert.equal(r.status, 201, JSON.stringify(r.json()));
  assert.equal(r.json().sku, 'X123.HAV');
  r = await admin('POST', `/api/products/${p.id}/variants`, { values: { [pol.id]: pNo }, new_values: { [farbe.id]: { code: 'HAV' } } });
  assert.equal(r.status, 409);
  const v = p.variants.find((x) => x.sku === 'X123.BLKP');
  r = await admin('PATCH', `/api/variants/${v.id}`, { sku: 'x123.noir' });
  assert.equal(r.json().sku, 'X123.NOIR');
  assert.equal(r.json().sku_manual, 1);
  r = await admin('PATCH', `/api/variants/${v.id}`, { sku: 'X123.BLU' });
  assert.equal(r.status, 409);
  r = await admin('POST', `/api/products/${p.id}/resku`, { ids: [v.id] });
  assert.equal(r.json().changed[0].to, 'X123.BLKP');
});

test('new model gets next base number, duplicate copies variants', async () => {
  const { admin } = setup();
  const [t] = (await admin('GET', '/api/tenants')).json();
  let r = await admin('POST', `/api/tenants/${t.id}/products`, { name: 'Nuevo' });
  assert.equal(r.json().base_no, 'X124');
  const full = (await admin('GET', `/api/tenants/${t.id}/full`)).json();
  r = await admin('POST', `/api/products/${full.products[0].id}/duplicate`);
  assert.equal(r.status, 201);
  const f2 = (await admin('GET', `/api/tenants/${t.id}/full`)).json();
  const dup = f2.products.find((p) => p.id === r.json().id);
  assert.equal(dup.base_no, 'X125');
  assert.equal(dup.variants.length, 8);
  assert.ok(dup.variants.every((v) => v.sku.startsWith('X125.')));
});

test('image upload (raw + data url), url guard, pdf, csv', async () => {
  const { admin, app } = setup();
  const [t] = (await admin('GET', '/api/tenants')).json();
  const full = (await admin('GET', `/api/tenants/${t.id}/full`)).json();
  const p = full.products[0];
  const blu = p.variants.find((v) => v.sku === 'X123.BLU');
  let r = await admin('POST', `/api/products/${p.id}/images?variant_id=${blu.id}`, await png('#1F5FAD'), { 'content-type': 'image/png' });
  assert.equal(r.status, 201, String(r.body));
  r = await admin('POST', `/api/products/${p.id}/images/url`, { url: 'data:image/png;base64,' + (await png('#6B4226')).toString('base64') });
  assert.equal(r.status, 201);
  const img = r.json();
  assert.match(img.key, /^[a-z2-9]{8}$/);
  r = await admin('GET', `/api/img/${img.key}?size=t`);
  assert.equal(r.status, 200);
  assert.equal(r.headers['content-type'], 'image/webp');
  // gelöschtes Bild: Schlüssel weg, neues Bild bekommt einen neuen Schlüssel
  await admin('DELETE', `/api/images/${img.id}`);
  assert.equal((await admin('GET', `/api/img/${img.key}`)).status, 404);
  r = await admin('POST', `/api/products/${p.id}/images/url`, { url: 'data:image/png;base64,' + (await png('#111111')).toString('base64') });
  assert.notEqual(r.json().key, img.key);
  assert.equal((await admin('GET', '/api/img/../../etc')).status, 404);
  r = await admin('POST', `/api/products/${p.id}/images/url`, { url: 'http://127.0.0.1:3000/x.png' });
  assert.equal(r.status, 400);
  r = await admin('POST', `/api/products/${p.id}/images/url`, { url: 'http://localhost/x.png' });
  assert.equal(r.status, 400);
  r = await admin('POST', `/api/products/${p.id}/images`, Buffer.from('not an image'), { 'content-type': 'image/png' });
  assert.equal(r.status, 415);
  const f2 = (await admin('GET', `/api/tenants/${t.id}/full`)).json();
  assert.ok(f2.products[0].variants.find((v) => v.id === blu.id).image_id);
  assert.ok(f2.products[0].cover);
  for (const lang of ['es', 'de', 'en']) {
    r = await admin('GET', `/api/tenants/${t.id}/catalog.pdf?lang=${lang}`);
    assert.equal(r.status, 200);
    assert.equal(r.body.subarray(0, 4).toString(), '%PDF');
  }
  r = await admin('GET', `/api/tenants/${t.id}/variants.csv`);
  assert.match(r.body.toString(), /X123\.BLUP/);
  await app.close();
});

test('access: non-admin needs tenant access', async () => {
  const { admin, other } = setup();
  await admin('GET', '/api/me');
  const [t] = (await admin('GET', '/api/tenants')).json();
  assert.equal((await other('GET', '/api/tenants')).json().length, 0);
  assert.equal((await other('GET', `/api/tenants/${t.id}/full`)).status, 403);
  assert.equal((await other('POST', '/api/tenants', { name: 'X' })).status, 403);
  await admin('PUT', `/api/tenants/${t.id}/access`, { users: ['will'] });
  assert.equal((await other('GET', `/api/tenants/${t.id}/full`)).status, 200);
  assert.equal((await other('DELETE', `/api/tenants/${t.id}`)).status, 403);
});

test('unauthenticated is rejected', async () => {
  const { app } = setup();
  const r = await app.inject({ method: 'GET', url: '/api/tenants' });
  assert.equal(r.statusCode, 401);
});

test('tenant logo: seeded, served as svg, upload checks, not in json as blob', async () => {
  const { admin } = setup();
  const [t] = (await admin('GET', '/api/tenants')).json();
  assert.match(t.logo, /\/logo\/light\?v=\d+/);
  assert.ok(t.logo_dark);
  let r = await admin('GET', t.logo);
  assert.equal(r.status, 200);
  assert.equal(r.headers['content-type'], 'image/svg+xml');
  assert.match(r.headers['content-security-policy'], /sandbox/);
  const full = (await admin('GET', `/api/tenants/${t.id}/full`)).json();
  assert.equal(typeof full.tenant.logo, 'string');
  r = await admin('PUT', `/api/tenants/${t.id}/logo/light`, { mime: 'image/png', data: Buffer.from('nope').toString('base64') });
  assert.equal(r.status, 400);
  r = await admin('DELETE', `/api/tenants/${t.id}/logo/light`);
  assert.equal(r.json().logo, null);
  r = await admin('GET', `/api/tenants/${t.id}/catalog.pdf`);
  assert.equal(r.status, 200);
});

test('colour value has frame 1, frame 2 and lens', async () => {
  const { admin } = setup();
  const [t] = (await admin('GET', '/api/tenants')).json();
  const full = (await admin('GET', `/api/tenants/${t.id}/full`)).json();
  const farbe = full.categories[0].options.find((o) => o.is_color);
  let r = await admin('POST', `/api/options/${farbe.id}/values`, { code: 'GLD', labels: { de: 'Schwarz/Gold' }, hex: '#111111', hex2: '#C9A227', hex3: '#6b4f2a' });
  assert.equal(r.status, 201);
  assert.equal(r.json().hex3, '#6B4F2A');
  r = await admin('PATCH', `/api/values/${r.json().id}`, { hex3: null });
  assert.equal(r.json().hex3, null);
  assert.ok(farbe.values.every((v) => v.hex3));
  r = await admin('GET', `/api/tenants/${t.id}/catalog.pdf?inactive=1`);
  assert.equal(r.status, 200);
});

test('local option values: product-only colour, code uniqueness, duplicate promotes, pdf status filter', async () => {
  const { admin } = setup();
  const [t] = (await admin('GET', '/api/tenants')).json();
  let full = (await admin('GET', `/api/tenants/${t.id}/full`)).json();
  const p = full.products[0];
  const farbe = full.categories[0].options.find((o) => o.is_color);
  const pol = full.categories[0].options.find((o) => o.key === 'pol');
  const pNo = pol.values.find((v) => v.code === '').id;
  // Sonderfarbe nur für X123
  let r = await admin('POST', `/api/products/${p.id}/variants`, { values: { [pol.id]: pNo }, new_values: { [farbe.id]: { code: 'SPC', labels: { de: 'Sonder' }, hex: '#AA00AA', local: true } } });
  assert.equal(r.status, 201, JSON.stringify(r.json()));
  assert.equal(r.json().sku, 'X123.SPC');
  full = (await admin('GET', `/api/tenants/${t.id}/full`)).json();
  const spc = full.categories[0].options.find((o) => o.is_color).values.find((v) => v.code === 'SPC');
  assert.equal(spc.product_id, p.id);
  // anderes Produkt darf den lokalen Wert nicht benutzen und den Code nicht neu anlegen
  const p2 = (await admin('POST', `/api/tenants/${t.id}/products`, { name: 'Otro' })).json();
  r = await admin('POST', `/api/products/${p2.id}/variants`, { values: { [farbe.id]: spc.id } });
  assert.equal(r.status, 400);
  r = await admin('POST', `/api/options/${farbe.id}/values`, { code: 'SPC' });
  assert.equal(r.status, 409);
  assert.match(r.json().message, /lokal bei X123/);
  // als Vorlage freigeben → jetzt nutzbar
  r = await admin('PATCH', `/api/values/${spc.id}`, { product_id: null });
  assert.equal(r.json().product_id, null);
  r = await admin('POST', `/api/products/${p2.id}/variants`, { values: { [farbe.id]: spc.id } });
  assert.equal(r.status, 201);
  // zurück auf lokal geht nicht mehr (zwei Produkte)
  r = await admin('PATCH', `/api/values/${spc.id}`, { product_id: p.id });
  assert.equal(r.status, 409);
  // Duplizieren mit lokalem Wert: Wert wird Vorlage
  const loc = (await admin('POST', `/api/options/${farbe.id}/values`, { code: 'LOC', hex: '#123456', product_id: p.id })).json();
  await admin('POST', `/api/products/${p.id}/variants`, { values: { [farbe.id]: loc.id, [pol.id]: pNo } });
  r = await admin('POST', `/api/products/${p.id}/duplicate`);
  assert.equal(r.status, 201, JSON.stringify(r.json()));
  full = (await admin('GET', `/api/tenants/${t.id}/full`)).json();
  assert.equal(full.categories[0].options.find((o) => o.is_color).values.find((v) => v.code === 'LOC').product_id, null);
  // PDF nur Entwürfe
  r = await admin('GET', `/api/tenants/${t.id}/catalog.pdf?status=draft`);
  assert.equal(r.status, 200);
});
