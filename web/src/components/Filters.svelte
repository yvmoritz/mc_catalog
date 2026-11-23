<script>
  import { ui, t } from '../lib/store.svelte.js';
  const d = $derived(ui.data);
  const n = $derived(d.products.reduce((s, p) => s + p.variants.length, 0));
</script>

<div class="fl">
  <div class="top">
    <div class="ttl">
      <h1>{t('products')}</h1>
      <span class="cap">{d.products.length} {t('models')} · {n} {t('variants')} · {d.suppliers.length} {t('suppliers')}</span>
    </div>
    <label class="search">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle><path d="M20 20l-3.5-3.5"></path></svg>
      <span class="sr">{t('search')}</span>
      <input type="search" placeholder={t('search')} bind:value={ui.filter.q}>
    </label>
  </div>
  <div class="row">
    <span class="cap">{t('supplier')}</span>
    <button type="button" class="fc" class:on={!ui.filter.supplier} aria-pressed={!ui.filter.supplier} onclick={() => (ui.filter.supplier = 0)}>{t('all')}</button>
    {#each d.suppliers.filter((s) => s.status !== 'ko' || d.products.some((p) => p.supplier_id === s.id)) as s (s.id)}
      <button type="button" class="fc" class:on={ui.filter.supplier === s.id} aria-pressed={ui.filter.supplier === s.id} onclick={() => (ui.filter.supplier = ui.filter.supplier === s.id ? 0 : s.id)}>{s.name}</button>
    {/each}
    {#if d.categories.length > 1}
      <span class="div" aria-hidden="true"></span>
      <span class="cap">{t('category')}</span>
      {#each d.categories as c (c.id)}
        <button type="button" class="fc" class:on={ui.filter.category === c.id} aria-pressed={ui.filter.category === c.id} onclick={() => (ui.filter.category = ui.filter.category === c.id ? 0 : c.id)}>{c.name}</button>
      {/each}
    {/if}
    <span class="div" aria-hidden="true"></span>
    <label class="cap st">{t('status')}
      <select class="select" bind:value={ui.filter.status}>
        <option value="">{t('all')}</option>
        {#each ['active', 'draft', 'inactive'] as s (s)}<option value={s}>{t('st.' + s)}</option>{/each}
      </select>
    </label>
  </div>
</div>

<style>
  .fl { display: flex; flex-direction: column; gap: 14px; }
  .top { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 16px; }
  .ttl { flex: 1 1 260px; display: flex; flex-direction: column; gap: 2px; }
  h1 { margin: 0; font-weight: 300; font-size: 32px; }
  .search { display: flex; align-items: center; gap: 8px; height: 44px; padding: 0 14px; border-radius: 12px; background: var(--surface); flex: 0 1 340px; border: 1.5px solid var(--line); color: var(--muted); }
  .search:focus-within { border-color: var(--brand); }
  .search input { border: 0; outline: 0; background: transparent; font-size: 15px; width: 100%; color: var(--ink); }
  .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
  .fc { height: 34px; padding: 0 14px; border: 0; border-radius: 999px; background: var(--pill); font-size: 13px; font-weight: 500; }
  .fc:hover { background: var(--hover); }
  /* aktiv: gefüllt + Häkchen, nicht nur Farbe */
  .fc.on { background: var(--brand); color: var(--on-brand); }
  .fc.on::before { content: '✓ '; }
  .div { width: 1px; height: 22px; background: var(--line); margin: 0 4px; }
  .st { display: inline-flex; align-items: center; gap: 8px; }
  .st .select { min-height: 34px; width: auto; padding: 0 10px; }
</style>
