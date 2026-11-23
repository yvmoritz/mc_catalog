// Bildquelle aus Drag & Drop oder Zwischenablage lesen.
// Reihenfolge: Bilddatei → text/uri-list → <img src> in text/html → URL in text/plain.
// Ein Bild aus einem anderen Browserfenster kommt meist als URL, nicht als Datei: der Server lädt es dann.

const isImgFile = (f) => f && (f.type.startsWith('image/') || /\.(jpe?g|png|webp|gif|avif|heic|tiff?|svg)$/i.test(f.name || ''));
const looksUrl = (s) => /^(https?:\/\/|data:image\/)/i.test(s || '');

/** true, wenn der Drag vermutlich ein Bild/URL trägt (für Hover-Zustand) */
export function carriesImage(dt) {
  if (!dt) return false;
  const types = [...(dt.types || [])];
  return types.includes('Files') || types.includes('text/uri-list') || types.includes('text/html') || types.includes('text/plain');
}

/** → { file } | { url } | null */
export function extractImage(dt) {
  if (!dt) return null;
  const files = [...(dt.files || [])].filter(isImgFile);
  if (files.length) return { file: files[0], more: files.length - 1 };
  for (const it of dt.items || []) {
    if (it.kind === 'file' && it.type.startsWith('image/')) { const f = it.getAsFile(); if (f) return { file: f }; }
  }
  const list = (dt.getData('text/uri-list') || '').split(/\r?\n/).map((s) => s.trim()).filter((s) => s && !s.startsWith('#'));
  const html = dt.getData('text/html') || '';
  const img = /<img[^>]+src=["']([^"']+)["']/i.exec(html)?.[1]?.replace(/&amp;/g, '&');
  // Bild in einem Link: <img src> ist das Bild, uri-list wäre die Linkseite
  if (img && looksUrl(img)) return { url: img };
  if (list.length && looksUrl(list[0])) return { url: list[0] };
  const txt = (dt.getData('text/plain') || '').trim();
  if (looksUrl(txt)) return { url: txt };
  if (list[0]?.startsWith('blob:') || img?.startsWith('blob:')) return { error: 'blob' };
  return null;
}

/** Svelte-Action: Element wird Ablagefläche. opts: { onDrop(src), enabled() } – setzt data-over */
export function droppable(node, opts) {
  let o = opts;
  let depth = 0;
  const on = () => (o.enabled ? o.enabled() : true);
  const set = (v) => { if (v) node.setAttribute('data-over', ''); else node.removeAttribute('data-over'); };
  const enter = (e) => { if (!on() || !carriesImage(e.dataTransfer)) return; e.preventDefault(); depth++; set(true); };
  const over = (e) => { if (!on() || !carriesImage(e.dataTransfer)) return; e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = 'copy'; };
  const leave = () => { if (--depth <= 0) { depth = 0; set(false); } };
  const drop = (e) => {
    if (!on()) return;
    e.preventDefault();
    e.stopPropagation();
    depth = 0;
    set(false);
    const src = extractImage(e.dataTransfer);
    if (src) o.onDrop(src, e);
  };
  node.addEventListener('dragenter', enter);
  node.addEventListener('dragover', over);
  node.addEventListener('dragleave', leave);
  node.addEventListener('drop', drop);
  return {
    update(n) { o = n; },
    destroy() {
      node.removeEventListener('dragenter', enter);
      node.removeEventListener('dragover', over);
      node.removeEventListener('dragleave', leave);
      node.removeEventListener('drop', drop);
    },
  };
}
