<script>
  import { ui, t, plural } from '../lib/store.svelte.js';
  const d = $derived(ui.data);
  const n = $derived(d.products.reduce((s, p) => s + p.variants.length, 0));
  const bySup = (id) => d.products.filter((p) => p.supplier_id === id).length;
  const sups = $derived(d.suppliers.filter((s) => s.status !== 'ko' || bySup(s.id)));
</script>

<div class="fl">
  <div class="bar" role="group" aria-label={t('supplier')}>
    <button type="button" class="fc" class:on={!ui.filter.supplier} aria-pressed={!ui.filter.supplier} onclick={() => (ui.filter.supplier = 0)}>{t('all')}<span class="n">{d.products.length}</span></button>
    {#each sups as s (s.id)}
      <button type="button" class="fc" class:on={ui.filter.supplier === s.id} aria-pressed={ui.filter.supplier === s.id} onclick={() => (ui.filter.supplier = ui.filter.supplier === s.id ? 0 : s.id)}>{s.name}<span class="n">{bySup(s.id)}</span></button>
    {/each}
    <span class="cnt">{plural(d.products.length, 'model1', 'models')}, {plural(n, 'nVar1', 'nVar')}</span>
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
  .cnt { font-size: 13px; color: var(--muted); flex: 1 1 auto; text-align: right; padding-right: 6px; }
  .bar { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
  .sp { flex: 1 1 12px; }
  .fc { display: inline-flex; align-items: center; gap: 7px; height: 32px; padding: 0 6px 0 12px; border: 0; border-radius: 999px; background: transparent; box-shadow: inset 0 0 0 1px var(--line); font-size: 13px; font-weight: 500; color: var(--ink2); }
  .fc:hover { box-shadow: inset 0 0 0 1px var(--edge); color: var(--ink); }
  .n { min-width: 20px; height: 20px; padding: 0 6px; border-radius: 999px; background: var(--pill); font-size: 12px; font-weight: 600; display: inline-flex; align-items: center; justify-content: center; }
  /* aktiv: gefüllt + Häkchen, nicht nur Farbe */
  .fc.on { background: var(--surface); color: var(--ink); box-shadow: inset 0 0 0 1.5px var(--ink); }
  .fc.on::before { content: '✓'; margin-right: -2px; }
  .fc.on .n { background: var(--ink); color: var(--surface); }
  .seg .pz { height: 26px; padding: 0 12px; font-size: 13px; }
  .st .select { min-height: 32px; font-size: 13px !important; width: auto; padding: 0 10px; font-size: 14px; background: transparent; box-shadow: inset 0 0 0 1px var(--line); }
  @media (max-width: 640px) {
    .cnt { display: none; }
    .bar { flex-wrap: nowrap; overflow-x: auto; margin: 0 -16px; padding: 0 16px 2px; scrollbar-width: none; }
    .fc, .seg, .st { flex: none; }
    .sp { display: none; }
  }
</style>
