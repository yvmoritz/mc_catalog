<script>
  import { onMount } from 'svelte';
  import { ui, t } from '../lib/store.svelte.js';
  import { LANGS } from '../lib/i18n.js';

  let dlg;
  let lang = $state(ui.lang);
  let inactive = $state(false);
  let supplier = $state(ui.filter.supplier || 0);
  let category = $state(ui.filter.category || 0);
  onMount(() => dlg.showModal());
  const close = () => dlg.close();
  const url = $derived(`/api/tenants/${ui.tenantId}/catalog.pdf?lang=${lang}${inactive ? '&inactive=1' : ''}${supplier ? '&supplier=' + supplier : ''}${category ? '&category=' + category : ''}`);
</script>

<dialog class="sheet" bind:this={dlg} onclose={() => { if (ui.dialog?.type === 'pdf') ui.dialog = null; }} aria-labelledby="pdf-t">
  <div class="sheet-body">
    <h2 id="pdf-t">{t('pdfTitle')}</h2>
    <p class="cap">{t('pdfHint')}</p>
    <div class="field"><span>{t('pdfLang')}</span>
      <div class="pillset">{#each LANGS as l (l)}<button type="button" class="pz" class:on={lang === l} aria-pressed={lang === l} onclick={() => (lang = l)}>{l.toUpperCase()}</button>{/each}</div>
    </div>
    <div class="grid2">
      <label class="field"><span>{t('supplier')}</span>
        <select class="select" bind:value={supplier}><option value={0}>{t('all')}</option>{#each ui.data.suppliers as s (s.id)}<option value={s.id}>{s.name}</option>{/each}</select></label>
      <label class="field"><span>{t('category')}</span>
        <select class="select" bind:value={category}><option value={0}>{t('all')}</option>{#each ui.data.categories as c (c.id)}<option value={c.id}>{c.name}</option>{/each}</select></label>
    </div>
    <label class="chk"><input type="checkbox" bind:checked={inactive}> {t('pdfInactive')}</label>
    <div class="sheet-actions">
      <a class="btn ghost" href="/api/tenants/{ui.tenantId}/variants.csv?lang={lang}" download>{t('csv')}</a>
      <button type="button" class="btn ghost" onclick={close}>{t('cancel')}</button>
      <a class="btn primary" href={url} target="_blank" rel="noopener" onclick={close}>{t('pdfOpen')}</a>
    </div>
  </div>
</dialog>

<style>
  p { margin: 0; }
  .chk { display: flex; align-items: center; gap: 8px; font-size: 15px; }
  a.btn { display: inline-flex; align-items: center; text-decoration: none; color: inherit; }
  a.btn.primary { color: var(--on-brand); }
</style>
