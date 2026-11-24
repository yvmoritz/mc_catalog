<script>
  import { ui, t, plural, lab, api, mutate, money, go, imgUrl, uploadImage, setUndo, toast, catOf, colorOpt, valueById, currencyOf } from '../lib/store.svelte.js';
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
  const shortSku = (v) => v.sku.replace(p.base_no, '').replace(/^[._-]/, '') || v.sku;
  const optLine = $derived(shown ? others.map((o) => valueById(cat, shown.values[o.id])).filter((v) => v?.code).map((v) => lab(v.labels, v.code)) : []);
</script>

<article class="card mc" class:ed={editing} class:wide={!!adding} onmouseenter={markHover} onfocusin={markHover} aria-label="{p.base_no} {p.name}">
  <div class="img plinth" use:droppable={{ enabled: () => editing, onDrop: (s) => dropOnVariant(s, shown) }}>
    {#if !editing}<a class="hit" href="#/product/{p.id}" aria-label="{p.base_no} {p.name}"></a>{/if}
    {#if mainImg}
      <img src={imgUrl(mainImg)} alt="{p.name} {shownColor ? lab(shownColor.labels, shownColor.code) : ''}" loading="lazy">
    {:else if shownColor?.hex}
      <span class="ph" style="background:{shownColor.hex2 ? `linear-gradient(90deg, ${shownColor.hex} 50%, ${shownColor.hex2} 50%)` : shownColor.hex}" aria-hidden="true"></span>
    {:else}
      <svg class="ghost" width="150" height="60" viewBox="0 0 200 80" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" aria-hidden="true"><path d="M14 22 Q14 14 22 14 H78 Q88 14 88 24 V36 Q88 62 58 62 H44 Q14 62 14 36 Z M112 24 Q112 14 122 14 H178 Q186 14 186 22 V36 Q186 62 156 62 H142 Q112 62 112 36 Z M88 26 Q100 18 112 26"></path></svg>
    {/if}
    {#if p.status !== 'active'}<span class="badge"><Status value={p.status} /></span>{:else if shown?.status === 'inactive'}<span class="badge"><Status value="inactive" /></span>{/if}
    {#if editing}
      <span class="badge r">{p.images.length}
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="3"></rect></svg></span>
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
      <div class="erow">
        <label class="field f-nm"><span>{t('model')}</span><input class="input nmi" value={p.name} onchange={(e) => saveField('name', e.target.value)}></label>
        <label class="field f-no"><span>{t('baseNo')}</span><input class="input mono" value={p.base_no} onchange={(e) => saveField('base_no', e.target.value)}></label>
        <label class="field f-ek"><span>{t('ek')}</span><input class="input" inputmode="decimal" value={p.ek ?? ''} onchange={(e) => saveField('ek', e.target.value)}></label>
      </div>
      <div class="thumbs" role="list" aria-label={t('variants')}>
        {#each p.variants as v (v.id)}
          {@const c = co ? valueById(cat, v.values[co.id]) : null}
          <div class="th" role="listitem" class:on={shown?.id === v.id} class:off={v.status === 'inactive'} use:droppable={{ enabled: () => editing, onDrop: (s) => dropOnVariant(s, v) }}>
            <button type="button" class="thb" aria-pressed={shown?.id === v.id} title={v.sku} onclick={() => showVariant(v)}>
              <span class="tpl">{#if v.image_id}<img src={imgUrl(v.image_id, true)} alt="">{:else}<Swatch value={c} size={16} chip />{/if}</span>
              <span class="tsku">{shortSku(v)}</span>
            </button>
            <button type="button" class="x" aria-label="{t('delete')} {v.sku}" onclick={() => delVariant(v)}>×</button>
          </div>
        {/each}
        <button type="button" class="th drop add" use:droppable={{ enabled: () => editing, onDrop: dropNew }} onclick={() => (adding = { src: null })} aria-label={t('newVariant')}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"></path></svg>
          <span>{t('variant')}</span>
        </button>
      </div>
      {#if adding}<NewVariant {p} src={adding.src} onclose={closeAdd} />{/if}
    {:else}
      <div class="hd">
        <a class="nm" href="#/product/{p.id}">{p.name}</a>
        <span class="ek">{eks.length > 1 && Math.min(...eks) !== Math.max(...eks) ? t('from') + ' ' : ''}{money(ekFrom, cur)}</span>
      </div>
      <div class="sws">
        {#each colors as c (c.id)}<Swatch value={c} size={16} chip selected={shown?.values[co.id] === c.id} onclick={() => pickColor(c.id)} />{/each}
        {#each others as o (o.id)}
          {#each otherVals(o).filter((v) => v.code) as v (v.id)}
            {@const on = sel[o.id] === v.id || (!sel[o.id] && shown?.values[o.id] === v.id)}
            <button type="button" class="ochip" class:on aria-pressed={on} title={lab(v.labels, v.code)} onclick={() => pickOther(o, v.id)}>{lab(v.labels, v.code)}</button>
          {/each}
        {/each}
      </div>
      <div class="meta">
        <span class="sku">{shown?.sku ?? p.base_no}</span>
        {#if shownColor}<span>{lab(shownColor.labels, shownColor.code)}{#each optLine as o (o)}, {o}{/each}</span>{/if}
        <span class="mr">{plural(p.variants.length, 'nVar1', 'nVar')}{#if p.moq != null}, {t('moq')} {p.moq}{/if}</span>
      </div>
    {/if}
  </div>
</article>

<style>
  .mc { display: flex; flex-direction: column; overflow: hidden; min-width: 0; }
  .mc.ed { box-shadow: 0 0 0 1.5px var(--edge); }
  .mc.wide { grid-column: span 2; }
  @media (max-width: 700px) { .mc.wide { grid-column: auto; } }
  .img { aspect-ratio: 4 / 3; display: flex; align-items: center; justify-content: center; }
  .wide .img { aspect-ratio: auto; height: 300px; }
  .img img { width: 100%; height: 100%; object-fit: contain; padding: 8% 10%; position: relative; z-index: 1; transition: transform 0.25s ease; }
  .mc:not(.ed):hover .img img { transform: scale(1.035); }
  .hit { position: absolute; inset: 0; z-index: 2; }
  .hit:focus-visible { outline-offset: -4px; }
  .ph { width: 34%; aspect-ratio: 1; border-radius: 50%; box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.15); position: relative; z-index: 1; }
  .ghost { color: var(--plinth-line); position: relative; z-index: 1; }
  /* Plakette auf dem Stein: immer helle Farbwerte, auch nachts */
  .badge { position: absolute; top: 10px; left: 10px; z-index: 3; display: inline-flex; align-items: center; gap: 4px; border-radius: 999px; background: rgba(255, 255, 255, 0.85);
    --ink2: #4A4543; --muted: #6B6563; --edge: #BFAFAB; --pill: #E6E3E2; --brand: #4D231B; --on-brand: #FFFFFF; }
  .badge.r { left: auto; right: 10px; background: rgba(255, 255, 255, 0.85); color: var(--plinth-ink); border-radius: 999px; padding: 4px 10px; font-size: 12px; font-weight: 600; }
  .ed .img { outline: 2px dashed var(--plinth-line); outline-offset: -8px; }
  .img:global([data-over]) { outline: 3px dashed var(--plinth-ink); outline-offset: -8px; background: #EAD3B1; }
  .dz-label { position: absolute; left: 50%; top: 50%; z-index: 3; transform: translate(-50%, -50%); padding: 6px 14px; border-radius: 999px; background: #4D231B; color: #fff; font-size: 13px; font-weight: 600; opacity: 0; pointer-events: none; }
  .img:global([data-over]) .dz-label { opacity: 1; }
  .imgact { position: absolute; left: 10px; bottom: 10px; z-index: 3; display: flex; gap: 6px; }
  .imgact .btn { background: rgba(255, 255, 255, 0.9); color: #2A1410; }
  .body { padding: 14px 16px 14px; display: flex; flex-direction: column; gap: 10px; }
  .hd { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
  .nm { font-weight: 600; font-size: 17px; color: var(--ink); text-decoration: none; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .nm:hover { text-decoration: underline; text-underline-offset: 3px; }
  .ek { font-weight: 600; font-size: 15px; white-space: nowrap; }
  .sws { display: flex; flex-wrap: wrap; align-items: center; gap: 0; min-height: 28px; }
  .ochip { height: 26px; padding: 0 10px; margin-left: 6px; border: 0; box-shadow: inset 0 0 0 1px var(--edge); border-radius: 999px; background: transparent; font-size: 12px; font-weight: 600; color: var(--ink2); }
  .ochip.on { background: var(--ink); color: var(--surface); box-shadow: none; }
  .ochip.on::before { content: '✓ '; }
  .meta { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 10px; font-size: 13px; color: var(--muted); border-top: 1px solid var(--line); padding-top: 10px; }
  .meta .sku { color: var(--brand); font-size: 12px; }
  .mr { margin-left: auto; }
  .erow { display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 1fr) minmax(0, 1fr); gap: 10px; }
  .nmi { font-weight: 600; }
  .thumbs { display: flex; flex-wrap: wrap; gap: 8px; }
  .th { position: relative; width: 66px; border-radius: 12px; }
  .thb { width: 100%; border: 0; background: none; padding: 0; display: flex; flex-direction: column; align-items: stretch; gap: 4px; border-radius: 12px; }
  .tpl { height: 46px; border-radius: 10px; background: var(--plinth); display: flex; align-items: center; justify-content: center; overflow: hidden; }
  .tpl img { width: 100%; height: 100%; object-fit: contain; padding: 4px; mix-blend-mode: multiply; }
  .th.on .tpl { box-shadow: 0 0 0 2.5px var(--ink); }
  .th.on .tsku { color: var(--ink); }
  .th.off .tpl { opacity: 0.5; }
  .th.off .tsku { text-decoration: line-through; }
  .th:global([data-over]) .tpl { outline: 3px dashed var(--brand); background: #EAD3B1; }
  .tsku { font-size: 11px; font-weight: 650; letter-spacing: 0.04em; color: var(--muted); text-align: center; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .x { position: absolute; right: -6px; top: -6px; width: 22px; height: 22px; border-radius: 50%; border: 0; background: var(--brand); color: var(--on-brand); font-size: 13px; line-height: 1; display: none; z-index: 2; }
  .th:hover .x, .th:focus-within .x { display: block; }
  @media (hover: none) { .x { display: block; } }
  .add { height: 46px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0; font-size: 11px; font-weight: 600; background: transparent; border-width: 1.5px; border-radius: 10px; }
</style>
