<script>
  import { ui, t, go, money, catOf, supOf, colorOpt, valueById, currencyOf, filteredProducts, imgUrl } from '../lib/store.svelte.js';
  import Swatch from './Swatch.svelte';
  import Status from './Status.svelte';
  import Filters from './Filters.svelte';

  const rows = $derived(filteredProducts().map((p) => {
    const cat = catOf(p);
    const co = colorOpt(cat);
    const colors = co ? [...new Set(p.variants.map((v) => v.values[co.id]).filter(Boolean))].map((id) => valueById(cat, id)) : [];
    const others = cat ? cat.options.filter((o) => !o.is_color).flatMap((o) => [...new Set(p.variants.map((v) => v.values[o.id]).filter(Boolean))].map((id) => valueById(cat, id)).filter((v) => v.code)) : [];
    const eks = p.variants.map((v) => v.ek_eff).filter((x) => x != null);
    return { p, cat, sup: supOf(p), colors, others, ek: eks.length ? Math.min(...eks) : p.ek, cur: currencyOf(p) };
  }));
</script>

<div class="wrap">
  <Filters />
  <div class="card tbl-wrap">
    <table class="tbl">
      <thead>
        <tr><th></th><th>{t('baseNo')}</th><th>{t('model')}</th><th>{t('supplier')}</th><th>{t('supModelNo')}</th><th>{t('options')}</th><th class="r">{t('variants')}</th><th class="r">{t('ekFrom')}</th><th class="r">{t('moq')}</th><th>{t('status')}</th></tr>
      </thead>
      <tbody>
        {#each rows as r (r.p.id)}
          <tr class:dim={r.p.status === 'inactive'} onclick={() => go('product', r.p.id)}>
            <td class="th">{#if r.p.cover}<img src={imgUrl(r.p.cover, true)} alt="" loading="lazy">{/if}</td>
            <td><a class="sku" href="#/product/{r.p.id}" onclick={(e) => e.stopPropagation()}>{r.p.base_no}</a></td>
            <td class="nm">{r.p.name}</td>
            <td>{r.sup?.name ?? '—'}</td>
            <td class="mono mut">{r.p.supplier_model_no ?? '—'}</td>
            <td><span class="opts">{#each r.colors as c (c.id)}<Swatch value={c} size={14} />{/each}{#each r.others as o (o.id)}<span class="chip tg-mat">{o.code}</span>{/each}</span></td>
            <td class="r">{r.p.variants.length}</td>
            <td class="r">{money(r.ek, r.cur)}</td>
            <td class="r">{r.p.moq ?? '—'}{r.p.moq_unit ? ' / ' + r.p.moq_unit : ''}</td>
            <td><Status value={r.p.status} /></td>
          </tr>
        {:else}
          <tr><td colspan="10" class="cap emp">{t('noProducts')}</td></tr>
        {/each}
      </tbody>
    </table>
  </div>
</div>

<style>
  .wrap { max-width: 1400px; margin: 0 auto; padding: 24px 16px 48px; display: flex; flex-direction: column; gap: 18px; }
  tbody tr { cursor: pointer; }
  .th { width: 56px; padding: 6px 4px 6px 12px; }
  .th img { width: 48px; height: 36px; object-fit: contain; border-radius: 6px; background: var(--bg); display: block; }
  .sku { color: var(--brand); text-decoration: none; }
  .nm { font-weight: 600; }
  .mut { color: var(--ink2); font-size: 13px; }
  .opts { display: inline-flex; align-items: center; gap: 4px; }
  .emp { padding: 32px; text-align: center; }
</style>
