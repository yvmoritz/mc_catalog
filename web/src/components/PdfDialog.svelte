<script>
  import { onMount } from 'svelte';
  import { ui, t, filteredProducts, plural } from '../lib/store.svelte.js';
  import { LANGS } from '../lib/i18n.js';

  let dlg;
  let lang = $state(ui.lang);
  let supplier = $state(ui.filter.supplier || 0);
  let category = $state(ui.filter.category || 0);
  // Status aus dem aktuellen Filter übernehmen, sonst aktiv + Entwurf
  let sts = $state(ui.filter.status ? [ui.filter.status] : ['active', 'draft']);
  let onlyHits = $state(!!ui.filter.q.trim());
  onMount(() => dlg.showModal());
  const close = () => dlg.close();
  const toggle = (s) => (sts = sts.includes(s) ? sts.filter((x) => x !== s) : [...sts, s]);

  const hitIds = $derived(onlyHits ? filteredProducts().map((p) => p.id) : null);
  const count = $derived(ui.data.products.filter((p) => sts.includes(p.status) && (!supplier || p.supplier_id === supplier)
    && (!category || p.category_id === category) && (!hitIds || hitIds.includes(p.id))).length);
  const url = $derived(`/api/tenants/${ui.tenantId}/catalog.pdf?lang=${lang}&status=${sts.join(',')}`
    + (supplier ? '&supplier=' + supplier : '') + (category ? '&category=' + category : '')
    + (hitIds ? '&products=' + (hitIds.join(',') || '0') : ''));
</script>

<dialog class="sheet" bind:this={dlg} onclose={() => { if (ui.dialog?.type === 'pdf') ui.dialog = null; }} aria-labelledby="pdf-t">
  <div class="sheet-body">
    <h2 id="pdf-t">{t('pdfTitle')}</h2>
    <p class="cap">{t('pdfHint')}</p>
    <div class="field"><span>{t('pdfLang')}</span>
      <div class="pillset fit">{#each LANGS as l (l)}<button type="button" class="pz" class:on={lang === l} aria-pressed={lang === l} onclick={() => (lang = l)}>{l.toUpperCase()}</button>{/each}</div>
    </div>
    <fieldset class="field">
      <legend>{t('pdfStatus')}</legend>
      <div class="chks">
        {#each ['active', 'draft', 'inactive'] as s (s)}
          <label class="chk"><input type="checkbox" checked={sts.includes(s)} onchange={() => toggle(s)}> {t('st.' + s)}</label>
        {/each}
      </div>
    </fieldset>
    <div class="grid2">
      <label class="field"><span>{t('supplier')}</span>
        <select class="select" bind:value={supplier}><option value={0}>{t('all')}</option>{#each ui.data.suppliers as s (s.id)}<option value={s.id}>{s.name}</option>{/each}</select></label>
      <label class="field"><span>{t('category')}</span>
        <select class="select" bind:value={category}><option value={0}>{t('all')}</option>{#each ui.data.categories as c (c.id)}<option value={c.id}>{c.name}</option>{/each}</select></label>
    </div>
    {#if ui.filter.q.trim()}
      <label class="chk"><input type="checkbox" bind:checked={onlyHits}> {t('onlyHits')} („{ui.filter.q.trim()}“)</label>
    {/if}
    <p class="cnt">{plural(count, 'model1', 'models')}</p>
    <div class="sheet-actions">
      <a class="btn ghost" href="/api/tenants/{ui.tenantId}/variants.csv?lang={lang}" download>{t('csv')}</a>
      <button type="button" class="btn ghost" onclick={close}>{t('cancel')}</button>
      <a class="btn primary" class:dis={!count || !sts.length} href={url} target="_blank" rel="noopener" onclick={close} aria-disabled={!count || !sts.length}>{t('pdfOpen')}</a>
    </div>
  </div>
</dialog>

<style>
  p { margin: 0; }
  fieldset { border: 0; padding: 0; margin: 0; }
  legend { font-size: 13px; font-weight: 500; color: var(--muted); padding: 0; margin-bottom: 6px; }
  .chks { display: flex; flex-wrap: wrap; gap: 6px 18px; }
  .chk { display: flex; align-items: center; gap: 8px; font-size: 14px; }
  .fit { align-self: flex-start; }
  .cnt { font-size: 13px; color: var(--muted); }
  a.btn { display: inline-flex; align-items: center; text-decoration: none; color: inherit; }
  a.btn.primary { color: var(--on-brand); }
  a.dis { opacity: 0.45; pointer-events: none; }
</style>
