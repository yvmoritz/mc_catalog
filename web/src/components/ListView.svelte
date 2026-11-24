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
        <tr><th><span class="sr">{t('images')}</span></th><th>{t('model')}</th><th class="hm">{t('supplier')}</th><th class="hm">{t('supModelNo')}</th><th>{t('options')}</th><th class="r hm">{t('variants')}</th><th class="r">{t('ekFrom')}</th><th class="r hm">{t('moq')}</th><th class="hm">{t('status')}</th></tr>
      </thead>
      <tbody>
        {#each rows as r (r.p.id)}
          <tr class:dim={r.p.status === 'inactive'} onclick={() => go('product', r.p.id)}>
            <td class="th"><span class="plinth tp">{#if r.p.cover}<img src={imgUrl(r.p.cover, true)} alt="" loading="lazy">{/if}</span></td>
            <td><span class="mdl"><a class="nm" href="#/product/{r.p.id}" onclick={(e) => e.stopPropagation()}>{r.p.name}</a><span class="sku">{r.p.base_no}</span></span></td>
            <td class="hm">{r.sup?.name ?? '—'}</td>
            <td class="mono mut hm">{r.p.supplier_model_no ?? '—'}</td>
            <td><span class="opts">{#each r.colors as c (c.id)}<Swatch value={c} size={12} chip />{/each}{#each r.others as o (o.id)}<span class="chip tg-mat">{o.code}</span>{/each}</span></td>
            <td class="r hm">{r.p.variants.length}</td>
            <td class="r num">{money(r.ek, r.cur)}</td>
            <td class="r hm">{r.p.moq ?? '—'}{r.p.moq_unit ? ' / ' + r.p.moq_unit : ''}</td>
            <td class="hm"><Status value={r.p.status} /></td>
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
  .th { width: 72px; padding: 6px 4px 6px 10px; }
  .tp { width: 64px; height: 44px; border-radius: 8px; display: flex; align-items: center; justify-content: center; }
  .tp::after { display: none; }
  .tp img { width: 100%; height: 100%; object-fit: contain; padding: 3px; }
  .mdl { display: flex; flex-direction: column; line-height: 1.25; }
  .mdl .sku { color: var(--brand); font-size: 11px; }
  .nm { font-weight: 600; color: var(--ink); text-decoration: none; }
  .num { font-weight: 600; }
  @media (max-width: 760px) { .hm { display: none; } }
  .mut { color: var(--ink2); font-size: 13px; }
  .opts { display: inline-flex; align-items: center; gap: 4px; }
  .emp { padding: 32px; text-align: center; }
</style>
