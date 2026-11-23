<script>
  import { ui, t, lab, api, mutate, money, go, imgUrl, uploadImage, setUndo, toast, catOf, colorOpt, valueById, currencyOf } from '../lib/store.svelte.js';
  import { droppable } from '../lib/dnd.js';
  import Swatch from './Swatch.svelte';
  import Status from './Status.svelte';
  import NewVariant from './NewVariant.svelte';

  let { p } = $props();
  const cat = $derived(catOf(p));
  const co = $derived(colorOpt(cat));
  const others = $derived(cat ? cat.options.filter((o) => !o.is_color) : []);
  const cur = $derived(currencyOf(p));

  let sel = $state({}); // optId -> valueId (Anzeige)
  let adding = $state(null); // null | {src}
  const editing = $derived(ui.edit);

  const colors = $derived(co ? [...new Set(p.variants.map((v) => v.values[co.id]).filter(Boolean))].map((id) => valueById(cat, id)) : []);
  const otherVals = (o) => [...new Set(p.variants.map((v) => v.values[o.id]).filter(Boolean))].map((id) => valueById(cat, id));
  const shown = $derived.by(() => {
    const keys = Object.entries(sel).filter(([, v]) => v);
    const match = (v) => keys.every(([o, val]) => v.values[o] === val);
    return p.variants.find(match) || (co && sel[co.id] ? p.variants.find((v) => v.values[co.id] === sel[co.id]) : null) || p.variants[0] || null;
  });
  const mainImg = $derived(shown?.image_id ?? p.cover);
  const eks = $derived(p.variants.map((v) => v.ek_eff).filter((x) => x != null));
  const ekFrom = $derived(eks.length ? Math.min(...eks) : p.ek);
  const shownColor = $derived(shown && co ? valueById(cat, shown.values[co.id]) : null);
  const tint = $derived(shownColor?.hex ? `color-mix(in srgb, ${shownColor.hex} 10%, var(--bg))` : 'var(--bg)');

  function showVariant(v) {
    const s = {};
    for (const [o, val] of Object.entries(v.values)) s[o] = val;
    sel = s;
  }
  function pickColor(id) { sel = { ...sel, [co.id]: id }; }
  function pickOther(o, id) { sel = { ...sel, [o.id]: sel[o.id] === id ? null : id }; }

  // ----- Bearbeiten -----
  async function saveField(field, value) {
    if ((p[field] ?? '') === (value ?? '')) return;
    await mutate(() => api.patch(`/products/${p.id}`, { [field]: value }));
  }
  /** Bild auf Hauptbild oder Varianten-Kachel: wird Bild der Variante; altes Variantenbild bleibt am Produkt */
  async function dropOnVariant(src, v) {
    if (src.error) return toast(t('err.fetch_failed'), 'error');
    const old = v?.image_id ?? null;
    try {
      const img = await uploadImage(p.id, src.file || src.url, v?.id ?? null);
      if (old) await api.patch(`/images/${old}`, { variant_id: null });
      setUndo(`${t('dropReplace')} ${v?.sku ?? p.base_no}`, async () => {
        await api.del(`/images/${img.id}`);
        if (old) await api.patch(`/images/${old}`, { variant_id: v.id });
      });
      await mutate(async () => {});
    } catch (e) { toast(e.message, 'error'); }
  }
  function dropNew(src) {
    if (src.error) return toast(t('err.fetch_failed'), 'error');
    adding = { src };
  }
  async function setCover() { if (mainImg) await mutate(() => api.patch(`/products/${p.id}`, { cover_image_id: mainImg })); }
  function removeImg() {
    if (!mainImg) return;
    ui.dialog = { type: 'confirm', title: t('removeImg'), onYes: () => mutate(() => api.del(`/images/${mainImg}`)) };
  }
  function delVariant(v) {
    ui.dialog = { type: 'confirm', title: `${t('delete')} ${v.sku}?`, text: t('confirmDelVariant'), onYes: () => mutate(() => api.del(`/variants/${v.id}`)) };
  }
  function closeAdd(newId) {
    adding = null;
    if (newId) { const v = p.variants.find((x) => x.id === newId); if (v) showVariant(v); else sel = {}; }
  }
  // ⌘V-Ziel
  $effect(() => {
    const q = ui.pasteTo;
    if (q && q.productId === p.id) { ui.pasteTo = null; adding = { src: q.src }; }
  });
  const markHover = () => { ui.hoverCard = p.id; };
</script>

<article class="card mc" class:ed={editing} class:wide={!!adding} onmouseenter={markHover} onfocusin={markHover} aria-label="{p.base_no} {p.name}">
  <div class="img" style="background:{tint}" use:droppable={{ enabled: () => editing, onDrop: (s) => dropOnVariant(s, shown) }}>
    {#if mainImg}
      <img src={imgUrl(mainImg)} alt="{p.name} {shownColor ? lab(shownColor.labels, shownColor.code) : ''}" loading="lazy">
    {:else if shownColor?.hex}
      <span class="ph" style="background:{shownColor.hex2 ? `linear-gradient(90deg, ${shownColor.hex} 50%, ${shownColor.hex2} 50%)` : shownColor.hex}" aria-hidden="true"></span>
    {:else}
      <svg class="ghost" width="160" height="64" viewBox="0 0 200 80" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round" aria-hidden="true"><path d="M14 22 Q14 14 22 14 H78 Q88 14 88 24 V36 Q88 62 58 62 H44 Q14 62 14 36 Z M112 24 Q112 14 122 14 H178 Q186 14 186 22 V36 Q186 62 156 62 H142 Q112 62 112 36 Z M88 26 Q100 18 112 26"></path></svg>
    {/if}
    <span class="badge sku">{shown?.sku ?? p.base_no}</span>
    {#if shown?.status === 'inactive'}<span class="badge r2"><Status value="inactive" /></span>{/if}
    <span class="badge r">{p.images.length} <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="3"></rect></svg></span>
    {#if editing}
      <span class="dz-label" aria-hidden="true">{shown ? t('dropReplace') : t('dropAdd')}</span>
      {#if mainImg}
        <span class="imgact">
          <button type="button" class="btn sm" onclick={setCover} disabled={mainImg === p.cover}>{t('setCover')}</button>
          <button type="button" class="btn sm" onclick={removeImg}>{t('removeImg')}</button>
        </span>
      {/if}
    {/if}
  </div>

  <div class="body">
    {#if editing}
      <div class="grid2">
        <label class="field"><span>{t('model')}</span><input class="input nmi" value={p.name} onchange={(e) => saveField('name', e.target.value)}></label>
        <div class="grid2">
          <label class="field"><span>{t('baseNo')}</span><input class="input mono" value={p.base_no} onchange={(e) => saveField('base_no', e.target.value)}></label>
          <label class="field"><span>{t('ek')}</span><input class="input" inputmode="decimal" value={p.ek ?? ''} onchange={(e) => saveField('ek', e.target.value)}></label>
        </div>
      </div>
      <span class="cap">{t('variants')} · {t('dropHere')} → {t('newVariant')}</span>
      <div class="thumbs">
        {#each p.variants as v (v.id)}
          {@const c = co ? valueById(cat, v.values[co.id]) : null}
          <div class="th" class:on={shown?.id === v.id} class:off={v.status === 'inactive'} use:droppable={{ enabled: () => editing, onDrop: (s) => dropOnVariant(s, v) }}>
            <button type="button" class="thb" aria-pressed={shown?.id === v.id} title={v.sku} onclick={() => showVariant(v)}>
              {#if v.image_id}<img src={imgUrl(v.image_id, true)} alt="">{:else}<Swatch value={c} size={22} />{/if}
              <span class="tsku">{v.sku.replace(p.base_no, '').replace(/^[._-]/, '') || v.sku}</span>
            </button>
            <button type="button" class="x" aria-label="{t('delete')} {v.sku}" onclick={() => delVariant(v)}>×</button>
          </div>
        {/each}
        <button type="button" class="th drop add" use:droppable={{ enabled: () => editing, onDrop: dropNew }} onclick={() => (adding = { src: null })} aria-label={t('newVariant')}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"></path></svg>
          <span>{t('dropHere')}</span>
        </button>
      </div>
      {#if adding}<NewVariant {p} src={adding.src} onclose={closeAdd} />{/if}
    {:else}
      <div class="hd">
        <a class="nm" href="#/product/{p.id}">{p.name}</a>
        <span class="ek">{money(ekFrom, cur)}</span>
      </div>
      <div class="sws">
        {#each colors as c (c.id)}<Swatch value={c} size={22} selected={shown?.values[co.id] === c.id} onclick={() => pickColor(c.id)} />{/each}
        {#each others as o (o.id)}
          {#each otherVals(o).filter((v) => v.code) as v (v.id)}
            <button type="button" class="ochip" class:on={sel[o.id] === v.id || (!sel[o.id] && shown?.values[o.id] === v.id)} aria-pressed={shown?.values[o.id] === v.id} title={lab(v.labels, v.code)} onclick={() => pickOther(o, v.id)}>{v.code}</button>
          {/each}
        {/each}
        <span class="cap cnt">{p.variants.length} {t('variants')}</span>
      </div>
      {#if shownColor}<span class="cap">{lab(shownColor.labels, shownColor.code)}{#each others as o (o.id)}{@const ov = shown && valueById(cat, shown.values[o.id])}{#if ov?.code} · {lab(ov.labels, ov.code)}{/if}{/each}</span>{/if}
    {/if}
  </div>
</article>

<style>
  .mc { display: flex; flex-direction: column; overflow: hidden; min-width: 0; }
  .mc.ed { box-shadow: 0 0 0 1.5px var(--edge); }
  .mc.wide { grid-column: span 2; }
  @media (max-width: 700px) { .mc.wide { grid-column: auto; } }
  .img { position: relative; aspect-ratio: 4 / 3; display: flex; align-items: center; justify-content: center; }
  .wide .img { aspect-ratio: auto; height: 300px; }
  .img img { width: 100%; height: 100%; object-fit: contain; padding: 12px; box-sizing: border-box; }
  .ph { width: 42%; aspect-ratio: 1; border-radius: 50%; box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.15); }
  .ghost { color: var(--edge); }
  .badge { position: absolute; top: 10px; left: 10px; background: color-mix(in srgb, var(--surface) 92%, transparent); border-radius: 999px; padding: 4px 10px; font-size: 12px; display: inline-flex; align-items: center; gap: 4px; }
  .badge.r { left: auto; right: 10px; font-weight: 500; }
  .badge.r2 { top: auto; bottom: 10px; left: 10px; padding: 0; background: none; }
  .ed .img { outline: 2px dashed var(--edge); outline-offset: -8px; border-radius: 0; }
  .img:global([data-over]) { outline: 3px dashed var(--brand); outline-offset: -8px; background: var(--sand) !important; }
  .dz-label { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); padding: 6px 14px; border-radius: 999px; background: var(--brand); color: var(--on-brand); font-size: 13px; font-weight: 600; opacity: 0; pointer-events: none; }
  .img:global([data-over]) .dz-label { opacity: 1; }
  .imgact { position: absolute; left: 10px; bottom: 10px; display: flex; gap: 6px; }
  .imgact .btn { background: color-mix(in srgb, var(--surface) 92%, transparent); }
  .body { padding: 14px 16px 16px; display: flex; flex-direction: column; gap: 10px; }
  .hd { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
  .nm { font-weight: 600; font-size: 17px; color: var(--ink); text-decoration: none; }
  .nm:hover { text-decoration: underline; }
  .ek { font-weight: 600; white-space: nowrap; }
  .sws { display: flex; flex-wrap: wrap; align-items: center; gap: 2px; }
  .cnt { margin-left: auto; }
  .ochip { height: 26px; min-width: 30px; padding: 0 8px; margin-left: 4px; border: 1.5px solid var(--edge); border-radius: 999px; background: transparent; font-size: 12px; font-weight: 700; font-family: ui-monospace, Menlo, monospace; }
  .ochip.on { background: var(--ink); color: var(--surface); border-color: var(--ink); }
  .nmi { font-weight: 600; }
  .thumbs { display: flex; flex-wrap: wrap; gap: 8px; }
  .th { position: relative; width: 70px; height: 62px; border-radius: 12px; background: var(--bg); }
  .th.on { box-shadow: 0 0 0 2.5px var(--ink); }
  .th.off { opacity: 0.55; }
  .th.off::after { content: ''; position: absolute; left: 8px; right: 8px; top: 50%; height: 2px; background: var(--muted); transform: rotate(-20deg); pointer-events: none; }
  .th:global([data-over]) { outline: 3px dashed var(--brand); background: var(--sand); }
  .thb { width: 100%; height: 100%; border: 0; background: none; border-radius: 12px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px; padding: 4px; }
  .thb img { width: 100%; height: 36px; object-fit: contain; }
  .tsku { font-family: ui-monospace, Menlo, monospace; font-size: 10px; font-weight: 700; color: var(--ink2); max-width: 100%; overflow: hidden; text-overflow: ellipsis; }
  .x { position: absolute; right: -6px; top: -6px; width: 22px; height: 22px; border-radius: 50%; border: 0; background: var(--brand); color: var(--on-brand); font-size: 13px; line-height: 1; display: none; }
  .th:hover .x, .th:focus-within .x { display: block; }
  @media (hover: none) { .x { display: block; } }
  .add { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; font-size: 11px; font-weight: 700; background: transparent; }
</style>
