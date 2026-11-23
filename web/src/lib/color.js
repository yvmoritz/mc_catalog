// Mittlere Farbe eines Bildes (ohne fast-weiße und transparente Pixel) als Vorschlag für eine neue Farbe.
export async function guessColor(file) {
  try {
    const bmp = await createImageBitmap(file, { resizeWidth: 64, resizeHeight: 64, resizeQuality: 'low' });
    const c = new OffscreenCanvas(64, 64);
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(bmp, 0, 0, 64, 64);
    const d = ctx.getImageData(0, 0, 64, 64).data;
    let r = 0, g = 0, b = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) {
      const [R, G, B, A] = [d[i], d[i + 1], d[i + 2], d[i + 3]];
      if (A < 128) continue;
      if (R > 225 && G > 225 && B > 225) continue; // Hintergrund
      const sat = Math.max(R, G, B) - Math.min(R, G, B);
      const w = 1 + sat / 32; // farbige Pixel stärker gewichten
      r += R * w; g += G * w; b += B * w; n += w;
    }
    if (!n) return null;
    const h = (v) => Math.round(v / n).toString(16).padStart(2, '0');
    return `#${h(r)}${h(g)}${h(b)}`.toUpperCase();
  } catch { return null; }
}
