import fs from 'node:fs';
import path from 'node:path';
import dns from 'node:dns';
import net from 'node:net';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { Agent } from 'undici';
import { HttpError } from './service.js';

export const MAX_BYTES = 15 * 1024 * 1024;
const FULL = 1600;
const THUMB = 480;
sharp.cache(false);

// ---------- Speicher ----------
export class ImageStore {
  constructor(dir) {
    this.dir = dir;
    fs.mkdirSync(dir, { recursive: true });
  }
  abs(file, thumb = false) {
    const f = thumb ? file.replace(/\.webp$/, '_t.webp') : file;
    const p = path.resolve(this.dir, f);
    if (!p.startsWith(path.resolve(this.dir) + path.sep)) throw new HttpError(400, 'invalid', 'Pfad ungültig');
    return p;
  }
  /** Rohdaten prüfen, drehen, verkleinern, als WebP + Thumbnail speichern */
  async save(tenantId, buf) {
    let img;
    try {
      img = sharp(buf, { failOn: 'error', limitInputPixels: 60e6, animated: false }).rotate();
      const meta = await sharp(buf, { limitInputPixels: 60e6 }).metadata();
      if (!meta.format || !['jpeg', 'png', 'webp', 'gif', 'avif', 'heif', 'tiff', 'svg'].includes(meta.format)) throw new Error('format');
    } catch {
      throw new HttpError(415, 'bad_image', 'Kein unterstütztes Bild (JPEG, PNG, WebP, GIF, AVIF, HEIC, TIFF, SVG)');
    }
    const rel = `${tenantId}/${randomUUID()}.webp`;
    fs.mkdirSync(path.dirname(this.abs(rel)), { recursive: true });
    const full = await img.clone().resize({ width: FULL, height: FULL, fit: 'inside', withoutEnlargement: true }).webp({ quality: 86, alphaQuality: 90 }).toFile(this.abs(rel));
    await img.clone().resize({ width: THUMB, height: THUMB, fit: 'inside', withoutEnlargement: true }).webp({ quality: 80 }).toFile(this.abs(rel, true));
    return { file: rel, width: full.width, height: full.height };
  }
  remove(file) {
    for (const t of [false, true]) { try { fs.unlinkSync(this.abs(file, t)); } catch { /* schon weg */ } }
  }
  /** JPEG auf Weiß für das PDF */
  async jpeg(file, max = 1200) {
    return sharp(this.abs(file)).resize({ width: max, height: max, fit: 'inside', withoutEnlargement: true }).flatten({ background: '#FFFFFF' }).jpeg({ quality: 85 }).toBuffer();
  }
}

// ---------- URL-Import mit SSRF-Schutz ----------
const block = new net.BlockList();
for (const [a, p] of [['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12],
  ['192.0.0.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['224.0.0.0', 4], ['240.0.0.0', 4]]) block.addSubnet(a, p, 'ipv4');
for (const [a, p] of [['::', 128], ['::1', 128], ['fc00::', 7], ['fe80::', 10], ['ff00::', 8], ['64:ff9b::', 96]]) block.addSubnet(a, p, 'ipv6');

export function isPrivateIp(ip) {
  const fam = net.isIP(ip);
  if (!fam) return true;
  const m = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
  if (m) return block.check(m[1], 'ipv4');
  return block.check(ip, fam === 4 ? 'ipv4' : 'ipv6');
}

export function makeFetcher({ allowPrivate = false, timeoutMs = 12000 } = {}) {
  const lookup = (host, opts, cb) => {
    dns.lookup(host, { all: true }, (err, addrs) => {
      if (err) return cb(err);
      const ok = allowPrivate ? addrs : addrs.filter((a) => !isPrivateIp(a.address));
      if (!ok.length) return cb(Object.assign(new Error('blocked'), { code: 'EBLOCKED' }));
      if (opts && opts.all) return cb(null, ok);
      cb(null, ok[0].address, ok[0].family);
    });
  };
  const agent = new Agent({ connect: { lookup, timeout: timeoutMs }, headersTimeout: timeoutMs, bodyTimeout: timeoutMs });

  const check = (raw) => {
    let u;
    try { u = new URL(raw); } catch { throw new HttpError(400, 'bad_url', 'URL ungültig'); }
    if (!['http:', 'https:'].includes(u.protocol)) throw new HttpError(400, 'bad_url', 'Nur http(s)-URLs');
    if (u.username || u.password) throw new HttpError(400, 'bad_url', 'URL mit Zugangsdaten nicht erlaubt');
    const h = u.hostname.replace(/^\[|\]$/g, '');
    if (!allowPrivate && (net.isIP(h) ? isPrivateIp(h) : /^(localhost|.*\.local|.*\.internal|.*\.lan)$/i.test(h))) throw new HttpError(400, 'blocked', 'Interne Adressen sind gesperrt');
    return u;
  };

  async function readCapped(res) {
    const len = Number(res.headers.get('content-length') || 0);
    if (len > MAX_BYTES) throw new HttpError(413, 'too_large', 'Bild größer als 15 MB');
    const chunks = [];
    let n = 0;
    for await (const c of res.body) {
      n += c.length;
      if (n > MAX_BYTES) throw new HttpError(413, 'too_large', 'Bild größer als 15 MB');
      chunks.push(c);
    }
    return Buffer.concat(chunks);
  }

  async function get(raw, depth = 0) {
    let u = check(raw);
    for (let hop = 0; hop < 5; hop++) {
      let res;
      try {
        res = await fetch(u, {
          dispatcher: agent, redirect: 'manual', signal: AbortSignal.timeout(timeoutMs),
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; mc-catalog/1.0)', Accept: 'image/avif,image/webp,image/*,text/html;q=0.5,*/*;q=0.1', Referer: u.origin + '/' },
        });
      } catch (e) {
        if (e?.cause?.code === 'EBLOCKED' || e?.code === 'EBLOCKED') throw new HttpError(400, 'blocked', 'Interne Adressen sind gesperrt');
        throw new HttpError(502, 'fetch_failed', 'Bild konnte nicht geladen werden');
      }
      if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
        u = check(new URL(res.headers.get('location'), u).href);
        continue;
      }
      if (!res.ok) throw new HttpError(502, 'fetch_failed', `Quelle antwortet ${res.status} (evtl. Hotlink-Schutz). Bild speichern und als Datei ablegen.`);
      const type = (res.headers.get('content-type') || '').toLowerCase();
      if (type.startsWith('text/html') && depth === 0) {
        // Link auf eine Produktseite: og:image nehmen
        const html = (await readCapped(res)).toString('utf8').slice(0, 500000);
        const m = /<meta[^>]+(?:property|name)=["'](?:og:image|twitter:image)(?::src)?["'][^>]*content=["']([^"']+)["']/i.exec(html)
          || /<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["'](?:og:image|twitter:image)["']/i.exec(html);
        if (!m) throw new HttpError(415, 'no_image', 'Seite ohne Vorschaubild. Bild direkt ziehen.');
        return get(new URL(m[1].replace(/&amp;/g, '&'), u).href, 1);
      }
      return { buf: await readCapped(res), url: u.href };
    }
    throw new HttpError(502, 'fetch_failed', 'Zu viele Weiterleitungen');
  }

  return async function fetchImage(raw) {
    const s = String(raw || '').trim();
    const d = /^data:(image\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)$/i.exec(s);
    if (d) {
      const buf = Buffer.from(d[2], 'base64');
      if (buf.length > MAX_BYTES) throw new HttpError(413, 'too_large', 'Bild größer als 15 MB');
      return { buf, url: null };
    }
    return get(s);
  };
}
