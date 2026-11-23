<script>
  import { ui, t, api, mutate } from '../lib/store.svelte.js';
  import Status from './Status.svelte';

  const d = $derived(ui.data);
  const count = (s) => d.products.filter((p) => p.supplier_id === s.id).length;
  const save = (s, f, v) => mutate(() => api.patch(`/suppliers/${s.id}`, { [f]: v === '' ? null : v }));
  const add = () => mutate(() => api.post(`/tenants/${ui.tenantId}/suppliers`, { name: t('newSupplier') }));
  function del(s) {
    ui.dialog = { type: 'confirm', title: `${t('delete')} ${s.name}?`, onYes: () => mutate(() => api.del(`/suppliers/${s.id}`)) };
  }
</script>

<div class="wrap">
  <div class="row"><h1 class="f1">{t('suppliers')}</h1><button type="button" class="btn primary" onclick={add}>+ {t('newSupplier')}</button></div>
  <div class="card tbl-wrap">
    <table class="tbl">
      <thead><tr><th>{t('supplier')}</th><th>{t('supCode')}</th><th>{t('contact')}</th><th>{t('currency')}</th><th>{t('incoterm')}</th><th>{t('leadTime')}</th><th>{t('moqNote')}</th><th>{t('status')}</th><th class="r">{t('products')}</th><th></th></tr></thead>
      <tbody>
        {#each d.suppliers as s (s.id)}
          <tr class:dim={s.status === 'ko'}>
            <td><input class="cell nm" value={s.name} aria-label={t('supplier')} onchange={(e) => save(s, 'name', e.target.value)}></td>
            <td><input class="cell mono" style="width:64px" value={s.code ?? ''} aria-label={t('supCode')} onchange={(e) => save(s, 'code', e.target.value)}></td>
            <td><input class="cell" style="width:140px" value={s.contact ?? ''} aria-label={t('contact')} onchange={(e) => save(s, 'contact', e.target.value)}></td>
            <td><select class="cell" style="width:80px" value={s.currency ?? ''} aria-label={t('currency')} onchange={(e) => save(s, 'currency', e.target.value)}>
              <option value="">—</option>{#each ['EUR', 'USD', 'CNY', 'GBP'] as c (c)}<option value={c}>{c}</option>{/each}</select></td>
            <td><input class="cell" style="width:70px" value={s.incoterm ?? ''} aria-label={t('incoterm')} onchange={(e) => save(s, 'incoterm', e.target.value)}></td>
            <td><input class="cell" style="width:110px" value={s.lead_time ?? ''} aria-label={t('leadTime')} onchange={(e) => save(s, 'lead_time', e.target.value)}></td>
            <td><input class="cell" style="width:240px" value={s.moq_note ?? ''} aria-label={t('moqNote')} onchange={(e) => save(s, 'moq_note', e.target.value)}></td>
            <td><span class="st"><Status value={s.status} />
              <select class="cell" style="width:auto" value={s.status} aria-label={t('status')} onchange={(e) => save(s, 'status', e.target.value)}>
                {#each ['active', 'favorite', 'ko'] as x (x)}<option value={x}>{t('st.' + x)}</option>{/each}</select></span></td>
            <td class="r">{count(s)}</td>
            <td><button type="button" class="ico sm" aria-label="{t('delete')} {s.name}" onclick={() => del(s)}>×</button></td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
</div>

<style>
  .wrap { max-width: 1400px; margin: 0 auto; padding: 24px 16px 48px; display: flex; flex-direction: column; gap: 18px; }
  h1 { margin: 0; font-weight: 300; font-size: 32px; }
  .f1 { flex: 1; }
  .nm { width: 200px; font-weight: 600; }
  .st { display: inline-flex; gap: 6px; align-items: center; }
</style>
