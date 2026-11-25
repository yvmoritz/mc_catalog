<script>
  import { ui, t, plural, api, mutate, uploadImage, setUndo, runUndo, toast, filteredProducts } from '../lib/store.svelte.js';
  import { droppable, extractImage } from '../lib/dnd.js';
  import Filters from './Filters.svelte';
  import ModelCard from './ModelCard.svelte';
  import Status from './Status.svelte';

  const groups = $derived.by(() => {
    const d = ui.data;
    const list = filteredProducts();
    const out = [];
    for (const s of [...d.suppliers, { id: null, name: '—' }]) {
      const ps = list.filter((p) => (p.supplier_id ?? null) === s.id);
      if (ps.length || (ui.edit && s.id && s.status !== 'ko' && (!ui.filter.supplier || ui.filter.supplier === s.id))) out.push({ sup: s, products: ps });
    }
    return out;
  });
  let nextBase = $state('');
  $effect(() => {
    if (ui.edit && ui.data) api.get(`/tenants/${ui.tenantId}/next-base`).then((r) => (nextBase = r.base_no)).catch(() => {});
  });

  async function newModel(supId, src) {
    if (src?.error) return toast(t('err.fetch_failed'), 'error');
    try {
      const p = await api.post(`/tenants/${ui.tenantId}/products`, { supplier_id: supId || undefined, category_id: ui.filter.category || undefined, name: t('newModel') });
      if (src) { try { await uploadImage(p.id, src.file || src.url); } catch (e) { toast(e.message, 'error'); } }
      setUndo(`${t('newModel')} ${p.base_no}`, () => api.del(`/products/${p.id}`));
      await mutate(async () => {});
    } catch (e) { toast(e.message, 'error'); }
  }
  const pickers = {};
  function onPick(supId, e) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (f) newModel(supId, { file: f });
  }

  // ⌘V: Bild aus der Zwischenablage → neue Variante am zuletzt berührten Modell
  function onPaste(e) {
    if (!ui.edit || /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName)) return;
    const src = extractImage(e.clipboardData);
    if (!src || src.error) return;
    e.preventDefault();
    if (ui.hoverCard) ui.pasteTo = { productId: ui.hoverCard, src };
    else toast(t('editHint'));
  }
  // Ablage neben die Ziele soll den Browser nicht zum Bild navigieren lassen
  function swallow(e) { if (ui.edit) e.preventDefault(); }
</script>

<svelte:window onpaste={onPaste} ondragover={swallow} ondrop={swallow} />

<div class="wrap">
  {#if ui.edit}
    <div class="editbar" role="status">
      <strong class="eo">{t('editOn')}</strong>
      <span>{t('editHint')}</span>
      {#if ui.busy}<span class="busy">{t('dropping')}</span>{/if}
      {#if ui.undo}
        <span class="undo">{t('lastAction')}: {ui.undo.label} · <button type="button" onclick={runUndo}>{t('undo')}</button></span>
      {/if}
    </div>
  {/if}
  <Filters />

  {#each groups as g (g.sup.id ?? 'none')}
    <section>
      <div class="gh">
        <h2>{g.sup.name}</h2>
        <span class="gc">{plural(g.products.length, 'model1', 'models')}</span>
        {#if g.sup.currency}<span class="chip tg-sup">{g.sup.currency}</span>{/if}
        {#if g.sup.status === 'favorite'}<Status value="favorite" />{/if}
      </div>
      <div class="grid">
        {#each g.products as p (p.id)}<ModelCard {p} />{/each}
        {#if ui.edit && g.sup.id !== undefined}
          <div class="drop newm" use:droppable={{ enabled: () => ui.edit, onDrop: (s) => newModel(g.sup.id, s) }}>
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="3"></rect><path d="M3 15l5-4 4 3 3-2 6 5"></path></svg>
            <strong>{t('newModel')}</strong>
            <span class="cap">{t('newModelHint')}{#if nextBase}<br>{t('nextNo')} <span class="sku">{nextBase}</span>{/if}</span>
            <span class="row">
              <button type="button" class="btn sm" onclick={() => pickers[g.sup.id ?? 0].click()}>{t('images')}…</button>
              <button type="button" class="btn sm" onclick={() => newModel(g.sup.id, null)}>{t('noImgCreate')}</button>
            </span>
            <input type="file" accept="image/*" hidden bind:this={pickers[g.sup.id ?? 0]} onchange={(e) => onPick(g.sup.id, e)}>
          </div>
        {/if}
      </div>
    </section>
  {:else}
    <p class="cap">{t('noProducts')}</p>
  {/each}
</div>

<style>
  .wrap { max-width: 1400px; margin: 0 auto; padding: 0 16px 48px; display: flex; flex-direction: column; gap: 24px; }
  .wrap > :global(.fl) { padding-top: 24px; }
  .editbar {
    position: sticky; top: 0; z-index: 10; margin: 0 -16px; padding: 10px 24px; display: flex; flex-wrap: wrap; gap: 6px 14px; align-items: center;
    background: color-mix(in srgb, var(--bg) 88%, transparent); backdrop-filter: blur(8px); color: var(--ink2); font-size: 13px;
    border-bottom: 1px solid var(--line);
  }
  .editbar + :global(.fl) { padding-top: 0; }
  .eo { color: var(--brand); display: inline-flex; align-items: center; gap: 6px; }
  .eo::before { content: ''; width: 7px; height: 7px; border-radius: 50%; background: currentColor; }
  .busy::before { content: '⟳ '; }
  .undo { margin-left: auto; }
  .undo button { border: 0; background: none; color: inherit; text-decoration: underline; font-weight: 600; padding: 0; }
  section { display: flex; flex-direction: column; gap: 16px; }
  .gh { display: flex; align-items: center; gap: 10px; padding-bottom: 10px; border-bottom: 1px solid var(--line); }
  .gh h2 { margin: 0; font-weight: 400; font-size: 19px; letter-spacing: -0.005em; }
  .gc { font-size: 14px; color: var(--muted); margin-right: auto; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(264px, 1fr)); gap: 16px; align-items: start; }
  .newm { min-height: 280px; align-self: stretch; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; padding: 24px; text-align: center; border-radius: 20px; }
  .newm .row { justify-content: center; }
</style>
