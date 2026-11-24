<script>
  import { ui, t, plural } from '../lib/store.svelte.js';
  const d = $derived(ui.data);
  const n = $derived(d.products.reduce((s, p) => s + p.variants.length, 0));
  const bySup = (id) => d.products.filter((p) => p.supplier_id === id).length;
  const sups = $derived(d.suppliers.filter((s) => s.status !== 'ko' || bySup(s.id)));
  let search = $state();
  // "/" fokussiert die Suche
  function onKey(e) {
    if (e.key === '/' && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName) && !e.metaKey && !e.ctrlKey) { e.preventDefault(); search?.focus(); }
  }
</script>

<svelte:window onkeydown={onKey} />

<div class="fl">
  <div class="top">
    <h1>{t('products')}</h1>
    <span class="cnt">{plural(d.products.length, 'model1', 'models')}, {plural(n, 'nVar1', 'nVar')}</span>
    <label class="search">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle><path d="M20 20l-3.5-3.5"></path></svg>
      <span class="sr">{t('search')}</span>
      <input type="search" placeholder={t('search')} bind:this={search} bind:value={ui.filter.q}>
      {#if !ui.filter.q}<span class="kbd" aria-hidden="true">/</span>{/if}
    </label>
  </div>
  <div class="bar" role="group" aria-label={t('supplier')}>
    <button type="button" class="fc" class:on={!ui.filter.supplier} aria-pressed={!ui.filter.supplier} onclick={() => (ui.filter.supplier = 0)}>{t('all')}<span class="n">{d.products.length}</span></button>
    {#each sups as s (s.id)}
      <button type="button" class="fc" class:on={ui.filter.supplier === s.id} aria-pressed={ui.filter.supplier === s.id} onclick={() => (ui.filter.supplier = ui.filter.supplier === s.id ? 0 : s.id)}>{s.name}<span class="n">{bySup(s.id)}</span></button>
    {/each}
    <span class="sp"></span>
    {#if d.categories.length > 1}
      <div class="pillset seg" role="group" aria-label={t('category')}>
        <button type="button" class="pz" class:on={!ui.filter.category} aria-pressed={!ui.filter.category} onclick={() => (ui.filter.category = 0)}>{t('all')}</button>
        {#each d.categories as c (c.id)}
          <button type="button" class="pz" class:on={ui.filter.category === c.id} aria-pressed={ui.filter.category === c.id} onclick={() => (ui.filter.category = ui.filter.category === c.id ? 0 : c.id)}>{c.name}</button>
        {/each}
      </div>
    {/if}
    <label class="st"><span class="sr">{t('status')}</span>
      <select class="select" bind:value={ui.filter.status} aria-label={t('status')}>
        <option value="">{t('status')}: {t('all')}</option>
        {#each ['active', 'draft', 'inactive'] as s (s)}<option value={s}>{t('st.' + s)}</option>{/each}
      </select>
    </label>
  </div>
</div>

<style>
  .fl { display: flex; flex-direction: column; gap: 14px; }
  .top { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px 14px; }
  h1 { margin: 0; font-weight: 300; font-size: 34px; letter-spacing: -0.01em; }
  .cnt { font-size: 15px; color: var(--muted); flex: 1 1 auto; }
  .search { display: flex; align-items: center; gap: 8px; height: 42px; padding: 0 12px; border-radius: 12px; background: var(--surface); flex: 0 1 340px; box-shadow: inset 0 0 0 1px var(--line); color: var(--muted); align-self: center; }
  .search:focus-within { box-shadow: inset 0 0 0 1.5px var(--brand); }
  .search input { border: 0; outline: 0; background: transparent; font-size: 15px; width: 100%; color: var(--ink); }
  .bar { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
  .sp { flex: 1 1 12px; }
  .fc { display: inline-flex; align-items: center; gap: 8px; height: 36px; padding: 0 8px 0 14px; border: 0; border-radius: 999px; background: transparent; box-shadow: inset 0 0 0 1px var(--line); font-size: 14px; font-weight: 500; color: var(--ink2); }
  .fc:hover { box-shadow: inset 0 0 0 1px var(--edge); color: var(--ink); }
  .n { min-width: 22px; height: 22px; padding: 0 6px; border-radius: 999px; background: var(--pill); font-size: 12px; font-weight: 600; display: inline-flex; align-items: center; justify-content: center; }
  /* aktiv: gefüllt + Häkchen, nicht nur Farbe */
  .fc.on { background: var(--brand); color: var(--on-brand); box-shadow: none; }
  .fc.on::before { content: '✓'; margin-right: -2px; }
  .fc.on .n { background: color-mix(in srgb, var(--on-brand) 22%, transparent); }
  .seg .pz { height: 30px; padding: 0 12px; font-size: 13px; }
  .st .select { min-height: 36px; width: auto; padding: 0 10px; font-size: 14px; background: transparent; box-shadow: inset 0 0 0 1px var(--line); }
  @media (max-width: 640px) {
    h1 { font-size: 28px; }
    .search { flex: 1 1 100%; }
    .bar { flex-wrap: nowrap; overflow-x: auto; margin: 0 -16px; padding: 0 16px 2px; scrollbar-width: none; }
    .fc, .seg, .st { flex: none; }
    .sp { display: none; }
  }
</style>
