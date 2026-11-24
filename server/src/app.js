import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import fs from 'node:fs';
import path from 'node:path';
import { Service, HttpError } from './service.js';
import { Hub } from './sse.js';
import { ImageStore, makeFetcher, MAX_BYTES } from './images.js';
import { catalogPdf } from './pdf.js';
import { variantsCsv } from './csv.js';

/**
 * opts: { db, dataDir, requireAuth, authBasic, devUser, webDir, logger, allowPrivateFetch }
 */
export function buildApp(opts) {
  const app = Fastify({ logger: opts.logger ?? false, bodyLimit: 1024 * 1024 });
  const hub = new Hub();
  const svc = new Service(opts.db, hub);
  const store = new ImageStore(path.join(opts.dataDir, 'img'));
  const fetchImage = opts.fetchImage || makeFetcher({ allowPrivate: !!opts.allowPrivateFetch });

  // Bilder als Rohdaten (Drag & Drop einer Datei)
  app.addContentTypeParser(/^(image\/.+|application\/octet-stream)$/, { parseAs: 'buffer', bodyLimit: MAX_BYTES }, (req, b, done) => done(null, b));

  // Benutzername aus dem Basic-Header des Proxys (NPM Access List, „Pass Auth to Host“). Das Passwort prüft der Proxy.
  const basicUser = (req) => {
    const a = req.headers.authorization || '';
    if (!a.startsWith('Basic ')) return null;
    return Buffer.from(a.slice(6), 'base64').toString('utf8').split(':')[0] || null;
  };
  const identify = (req) => {
    const b = opts.authBasic ? basicUser(req) : null;
    if (b) return { user: b, source: 'basic' };
    if (opts.devUser) return { user: opts.devUser, source: 'dev' };
    return { user: null, source: 'none' };
  };

  app.decorateRequest('user', null);
  app.decorateRequest('admin', false);
  app.addHook('onRequest', async (req, reply) => {
    if (!req.url.startsWith('/api/')) return;
    const { user, source } = identify(req);
    if (!user && opts.requireAuth) {
      reply.code(401).send({ error: 'unauthorized', message: 'Nicht angemeldet' });
      return reply;
    }
    req.user = user || 'local';
    req.authSource = source;
    req.admin = user ? !!svc.seeUser(user).is_admin : true;
  });

  // Mandant je Route ermitteln
  const n = (v) => Number(v);
  const tenantOf = (req) => {
    const u = req.routeOptions?.url || '';
    const p = req.params || {};
    if (u.startsWith('/api/tenants/:id')) return n(p.id);
    if (u.startsWith('/api/suppliers/:id')) return svc.get('SELECT tenant_id FROM supplier WHERE id = ?', n(p.id))?.tenant_id;
    if (u.startsWith('/api/categories/:id')) return svc.get('SELECT tenant_id FROM category WHERE id = ?', n(p.id))?.tenant_id;
    if (u.startsWith('/api/options/:id')) return svc.get('SELECT c.tenant_id FROM opt o JOIN category c ON c.id = o.category_id WHERE o.id = ?', n(p.id))?.tenant_id;
    if (u.startsWith('/api/values/:id')) return svc.get('SELECT c.tenant_id FROM opt_value v JOIN opt o ON o.id = v.opt_id JOIN category c ON c.id = o.category_id WHERE v.id = ?', n(p.id))?.tenant_id;
    if (u.startsWith('/api/products/:id')) return svc.get('SELECT tenant_id FROM product WHERE id = ?', n(p.id))?.tenant_id;
    if (u.startsWith('/api/variants/:id')) return svc.get('SELECT tenant_id FROM variant WHERE id = ?', n(p.id))?.tenant_id;
    if (u.startsWith('/api/images/:id')) return svc.get('SELECT tenant_id FROM image WHERE id = ?', n(p.id))?.tenant_id;
    return undefined;
  };
  const ADMIN_ONLY = [['POST', '/api/tenants'], ['DELETE', '/api/tenants/:id'], ['GET', '/api/tenants/:id/access'], ['PUT', '/api/tenants/:id/access'],
    ['GET', '/api/users'], ['PATCH', '/api/users/:name']];
  app.addHook('preHandler', async (req, reply) => {
    if (!req.url.startsWith('/api/') || req.admin) return;
    const route = req.routeOptions?.url;
    if (ADMIN_ONLY.some(([m, u]) => m === req.method && u === route)) {
      reply.code(403).send({ error: 'forbidden', message: 'Nur für Admins' });
      return reply;
    }
    const t = tenantOf(req);
    if (t !== undefined && t !== null && !svc.canAccess(req.user, t)) {
      reply.code(403).send({ error: 'forbidden', message: 'Kein Zugriff auf diesen Mandanten' });
      return reply;
    }
  });

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof HttpError) return reply.code(err.status).send({ error: err.code, message: err.message });
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') return reply.code(409).send({ error: 'exists', message: 'Eintrag existiert schon' });
    if (err.validation) return reply.code(400).send({ error: 'invalid', message: err.message });
    if (err.statusCode && err.statusCode < 500) return reply.code(err.statusCode).send({ error: 'bad_request', message: err.message });
    req.log.error(err);
    return reply.code(500).send({ error: 'internal', message: 'Interner Fehler' });
  });

  const id = (v) => {
    const x = Number(v);
    if (!Number.isInteger(x) || x < 1) throw new HttpError(400, 'invalid', 'Ungültige ID');
    return x;
  };
  const body = (req) => (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body) ? req.body : {});
  const created = (reply, v) => reply.code(201).send(v);
  const gone = (reply) => reply.code(204).send();

  app.get('/healthz', async () => ({ ok: true }));
  app.get('/api/me', async (req) => ({ user: req.user, is_admin: !!req.admin, auth_source: req.authSource }));

  // Mandanten
  app.get('/api/tenants', async (req) => (req.admin ? svc.listTenants() : svc.listTenants(req.user)));
  app.post('/api/tenants', async (req, reply) => created(reply, svc.createTenant(body(req), req.user)));
  app.patch('/api/tenants/:id', async (req) => svc.updateTenant(id(req.params.id), body(req), req.user));
  app.delete('/api/tenants/:id', async (req, reply) => {
    const tid = id(req.params.id);
    const files = svc.all('SELECT file FROM image WHERE tenant_id = ?', tid).map((r) => r.file);
    svc.deleteTenant(tid);
    files.forEach((f) => store.remove(f));
    return gone(reply);
  });
  app.put('/api/tenants/:id/logo/:variant', async (req) => {
    const b = body(req);
    if (typeof b.data !== 'string') throw new HttpError(400, 'invalid', 'data (Base64) fehlt');
    return svc.setLogo(id(req.params.id), req.params.variant, String(b.mime || ''), Buffer.from(b.data, 'base64'), req.user);
  });
  app.delete('/api/tenants/:id/logo/:variant', async (req) => svc.setLogo(id(req.params.id), req.params.variant, null, null, req.user));
  app.get('/api/tenants/:id/logo/:variant', async (req, reply) => {
    const r = svc.logo(id(req.params.id), req.params.variant);
    // SVG nie als Dokument mit Skripten ausführen
    return reply.header('Content-Type', r.mime).header('X-Content-Type-Options', 'nosniff')
      .header('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; img-src data:; sandbox")
      .header('Cache-Control', 'private, max-age=31536000, immutable').send(r.data);
  });
  app.get('/api/tenants/:id/access', async (req) => ({ users: svc.tenantAccess(id(req.params.id)) }));
  app.put('/api/tenants/:id/access', async (req) => ({ users: svc.setTenantAccess(id(req.params.id), body(req).users) }));
  app.get('/api/users', async () => svc.users());
  app.patch('/api/users/:name', async (req) => svc.setAdmin(req.params.name, !!body(req).is_admin, req.user));
  app.get('/api/tenants/:id/full', async (req) => svc.full(id(req.params.id)));
  app.get('/api/tenants/:id/next-base', async (req) => ({ base_no: svc.nextBase(id(req.params.id), true) }));

  // Export
  app.get('/api/tenants/:id/catalog.pdf', async (req, reply) => {
    const tid = id(req.params.id);
    const q = req.query || {};
    const data = svc.full(tid);
    const logoOf = (v) => { try { return svc.logo(tid, v); } catch { return null; } };
    const pdf = await catalogPdf(data, store, {
      logo: logoOf('dark') || logoOf('light'),
      lang: q.lang, supplierId: q.supplier ? Number(q.supplier) : null, categoryId: q.category ? Number(q.category) : null,
      includeInactive: q.inactive === '1', productIds: q.products ? String(q.products).split(',').map(Number).filter(Boolean) : null,
    });
    const file = `${data.tenant.slug}-catalogo-${new Date().toISOString().slice(0, 10)}.pdf`;
    return reply.header('Content-Type', 'application/pdf').header('Content-Disposition', `${q.download === '1' ? 'attachment' : 'inline'}; filename="${file}"`).send(pdf);
  });
  app.get('/api/tenants/:id/variants.csv', async (req, reply) => {
    const data = svc.full(id(req.params.id));
    return reply.header('Content-Type', 'text/csv; charset=utf-8')
      .header('Content-Disposition', `attachment; filename="${data.tenant.slug}-variantes.csv"`).send(variantsCsv(data, req.query?.lang));
  });

  // Lieferanten
  app.post('/api/tenants/:id/suppliers', async (req, reply) => created(reply, svc.createSupplier(id(req.params.id), body(req), req.user)));
  app.patch('/api/suppliers/:id', async (req) => svc.updateSupplier(id(req.params.id), body(req), req.user));
  app.delete('/api/suppliers/:id', async (req, reply) => { svc.deleteSupplier(id(req.params.id), req.user); return gone(reply); });

  // Kategorien, Optionen, Werte
  app.post('/api/tenants/:id/categories', async (req, reply) => created(reply, svc.createCategory(id(req.params.id), body(req), req.user)));
  app.patch('/api/categories/:id', async (req) => svc.updateCategory(id(req.params.id), body(req), req.user));
  app.delete('/api/categories/:id', async (req, reply) => { svc.deleteCategory(id(req.params.id), req.user); return gone(reply); });
  app.post('/api/categories/:id/options', async (req, reply) => created(reply, svc.createOpt(id(req.params.id), body(req), req.user)));
  app.patch('/api/options/:id', async (req) => svc.updateOpt(id(req.params.id), body(req), req.user));
  app.delete('/api/options/:id', async (req, reply) => { svc.deleteOpt(id(req.params.id), req.user); return gone(reply); });
  app.post('/api/options/:id/values', async (req, reply) => created(reply, svc.createValue(id(req.params.id), body(req), req.user)));
  app.patch('/api/values/:id', async (req) => svc.updateValue(id(req.params.id), body(req), req.user));
  app.delete('/api/values/:id', async (req, reply) => { svc.deleteValue(id(req.params.id), req.user); return gone(reply); });

  // Produkte
  app.post('/api/tenants/:id/products', async (req, reply) => created(reply, svc.createProduct(id(req.params.id), body(req), req.user)));
  app.patch('/api/products/:id', async (req) => svc.updateProduct(id(req.params.id), body(req), req.user));
  app.delete('/api/products/:id', async (req, reply) => { svc.deleteProduct(id(req.params.id), req.user).forEach((f) => store.remove(f)); return gone(reply); });
  app.post('/api/products/:id/duplicate', async (req, reply) => created(reply, svc.duplicateProduct(id(req.params.id), req.user)));
  app.put('/api/products/:id/tiers', async (req) => svc.setTiers(id(req.params.id), body(req).tiers, req.user));
  app.put('/api/products/:id/surcharges', async (req) => svc.setSurcharges(id(req.params.id), body(req).surcharges, req.user));

  // Varianten
  app.post('/api/products/:id/variants', async (req, reply) => created(reply, svc.createVariant(id(req.params.id), body(req), req.user)));
  app.post('/api/products/:id/generate', async (req) => svc.generateVariants(id(req.params.id), body(req), req.user));
  app.post('/api/products/:id/resku', async (req) => svc.resku(id(req.params.id), body(req), req.user));
  app.patch('/api/variants/:id', async (req) => svc.updateVariant(id(req.params.id), body(req), req.user));
  app.delete('/api/variants/:id', async (req, reply) => { svc.deleteVariant(id(req.params.id), req.user).forEach((f) => store.remove(f)); return gone(reply); });
  app.patch('/api/tenants/:id/variants', async (req) => svc.bulkVariants(id(req.params.id), body(req), req.user));

  // Bilder
  const addImage = async (req, buf, sourceUrl) => {
    const p = svc.product(id(req.params.id));
    const variantId = req.query?.variant_id ? id(req.query.variant_id) : (body(req).variant_id ? id(body(req).variant_id) : null);
    if (variantId && svc.variant(variantId).product_id !== p.id) throw new HttpError(400, 'invalid', 'Variante gehört nicht zum Produkt');
    const meta = await store.save(p.tenant_id, buf);
    try {
      return svc.addImage(p.id, variantId, { ...meta, source_url: sourceUrl }, req.user);
    } catch (e) { store.remove(meta.file); throw e; }
  };
  app.post('/api/products/:id/images', { bodyLimit: MAX_BYTES }, async (req, reply) => {
    if (!Buffer.isBuffer(req.body) || !req.body.length) throw new HttpError(400, 'invalid', 'Bilddaten fehlen');
    return created(reply, await addImage(req, req.body, null));
  });
  app.post('/api/products/:id/images/url', async (req, reply) => {
    const url = body(req).url;
    if (!url) throw new HttpError(400, 'invalid', 'url fehlt');
    const r = await fetchImage(url);
    return created(reply, await addImage(req, r.buf, r.url));
  });
  app.patch('/api/images/:id', async (req) => svc.updateImage(id(req.params.id), body(req), req.user));
  app.delete('/api/images/:id', async (req, reply) => { store.remove(svc.deleteImage(id(req.params.id), req.user)); return gone(reply); });
  app.get('/api/images/:id', async (req, reply) => {
    const img = svc.image(id(req.params.id));
    const file = store.abs(img.file, req.query?.size === 't');
    if (!fs.existsSync(file)) throw new HttpError(404, 'not_found', 'Datei fehlt');
    return reply.header('Content-Type', 'image/webp').header('X-Content-Type-Options', 'nosniff')
      .header('Cache-Control', 'private, max-age=31536000, immutable').send(fs.createReadStream(file));
  });

  // Live-Updates je Mandant
  app.get('/api/tenants/:id/events', (req, reply) => {
    const tid = id(req.params.id);
    svc.tenant(tid);
    reply.hijack();
    reply.raw.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    reply.raw.write(`event: hello\ndata: ${JSON.stringify({ tenantId: tid })}\n\n`);
    hub.add(tid, reply.raw);
    req.raw.on('close', () => hub.remove(tid, reply.raw));
  });
  const pinger = setInterval(() => hub.ping(), 25000);
  pinger.unref();
  app.addHook('onClose', async () => clearInterval(pinger));

  // Frontend
  if (opts.webDir && fs.existsSync(path.join(opts.webDir, 'index.html'))) {
    app.register(fastifyStatic, { root: opts.webDir, prefix: '/' });
    app.setNotFoundHandler((req, reply) => {
      if (req.method === 'GET' && !req.url.startsWith('/api/')) return reply.sendFile('index.html');
      return reply.code(404).send({ error: 'not_found', message: 'Nicht gefunden' });
    });
  }

  app.decorate('svc', svc);
  app.decorate('store', store);
  return app;
}
