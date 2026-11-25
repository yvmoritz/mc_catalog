<script>
  import { ui, t, lab, api, mutate, valuesFor, money, go, imgUrl, uploadImage, toast, catOf, supOf, colorOpt, valueById, currencyOf, fmtNum } from '../lib/store.svelte.js';
  import { droppable } from '../lib/dnd.js';
  import Swatch from './Swatch.svelte';
  import LocalValue from './LocalValue.svelte';
  import Status from './Status.svelte';

  const p = $derived(ui.data.products.find((x) => x.id === ui.route.id));
  const cat = $derived(p && catOf(p));
  const sup = $derived(p && supOf(p));
  const co = $derived(colorOpt(cat));
  const cur = $derived(p ? currencyOf(p) : '');

  let checked = $state(new Set());
  let localFor = $state(null);
  let peek = $state(null); // Variante unter dem Zeiger → Vitrine zeigt ihr Bild
  const pv = $derived(p && peek ? p.variants.find((v) => v.id === peek) : null);
  const vimg = $derived(pv?.image_id ?? p?.cover);
  let gen = $state({}); // optId -> Set(valueIds)
  let tiers = $state([]);
  let surs = $state([]);
  let lastId = 0;
  $effect(() => {
    if (p && p.id !== lastId) {
      lastId = p.id;
      checked = new Set();
      gen = {};
      tiers = p.tiers.map((x) => ({ ...x }));
      surs = p.surcharges.map((x) => ({ ...x }));
    }
  });

  const save = (field, value) => mutate(() => api.patch(`/products/${p.id}`, { [field]: value === '' ? null : value }));
  const saveV = (v, field, value) => mutate(() => api.patch(`/variants/${v.id}`, { [field]: value === '' ? null : value }));
  const setVal = (v, o, valueId) => mutate(() => api.patch(`/variants/${v.id}`, { values: { ...v.values, [o.id]: valueId ? Number(valueId) : null } }));

  function toggleGen(o, id) {
    const s = new Set(gen[o.id] || []);
    s.has(id) ? s.delete(id) : s.add(id);
    gen = { ...gen, [o.id]: s };
  }
  const genCount = $derived(cat ? cat.options.reduce((n, o) => n * Math.max(1, gen[o.id]?.size || 0), 1) * (cat.options.some((o) => gen[o.id]?.size) ? 1 : 0) : 0);
  async function generate() {
    const values = Object.fromEntries(Object.entries(gen).map(([o, s]) => [o, [...s]]));
    const r = await mutate(() => api.post(`/products/${p.id}/generate`, { values }));
    if (r) { toast(`${r.created} ${t('generated')}${r.skipped.length ? ` · ${r.skipped.length} ${t('skipped')}` : ''}`); gen = {}; }
  }
  async function resku() {
    const r = await mutate(() => api.post(`/products/${p.id}/resku`, { ids: checked.size ? [...checked] : undefined }));
    if (r) toast(`${t('reskuDone')}: ${r.changed.length}${r.conflicts.length ? ` · ${r.conflicts.length} ${t('err.exists')}` : ''}`);
  }
  function toggleCheck(id) { const s = new Set(checked); s.has(id) ? s.delete(id) : s.add(id); checked = s; }
  const allChecked = $derived(p && p.variants.length > 0 && checked.size === p.variants.length);
  function bulk(field) {
    let value;
    if (field === 'status') {
      const anyActive = p.variants.some((v) => checked.has(v.id) && v.status === 'active');
      value = anyActive ? 'inactive' : 'active';
    } else {
      value = prompt(field === 'ek' ? t('setEk') : t('setMoq'));
      if (value === null) return;
    }
    mutate(() => api.patch(`/tenants/${ui.tenantId}/variants`, { ids: [...checked], [field]: value === '' ? null : value }));
  }
  const saveTiers = () => mutate(() => api.put(`/products/${p.id}/tiers`, { tiers }));
  const saveSurs = () => mutate(() => api.put(`/products/${p.id}/surcharges`, { surcharges: surs }));

  function delProduct() {
    ui.dialog = { type: 'confirm', title: `${t('delete')} ${p.base_no}?`, text: t('confirmDelProduct'), onYes: async () => { await mutate(() => api.del(`/products/${p.id}`)); go('products'); } };
  }
  function delVariant(v) {
    ui.dialog = { type: 'confirm', title: `${t('delete')} ${v.sku}?`, text: t('confirmDelVariant'), onYes: () => mutate(() => api.del(`/variants/${v.id}`)) };
  }
  async function dup() { const n = await mutate(() => api.post(`/products/${p.id}/duplicate`)); if (n) go('product', n.id); }
  async function addImg(src, variantId = null) {
    if (src.error) return toast(t('err.fetch_failed'), 'error');
    try { await uploadImage(p.id, src.file || src.url, variantId); await mutate(async () => {}); } catch (e) { toast(e.message, 'error'); }
  }
  let filePick = $state();
  function onFiles(e) { for (const f of e.target.files || []) addImg({ file: f }); e.target.value = ''; }
</script>

{#if !p}
  <p class="cap pad">—</p>
{:else}
<div class="wrap">
  <div class="top">
    <a class="ico" href="#/products" aria-label={t('back')}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M15 6l-6 6 6 6"></path></svg>
    </a>
    <div class="tt">
      <span class="crumbs"><a href="#/products">{t('products')}</a><span aria-hidden="true">›</span>{cat?.name}{#if sup}<span aria-hidden="true">›</span>{sup.name}{/if}</span>
      <h1><span class="sku big">{p.base_no}</span> {p.name}</h1>
    </div>
    <Status value={p.status} />
    <span class="sp"></span>
    <button type="button" class="btn" onclick={dup}>{t('duplicate')}</button>
    <button type="button" class="btn ghost" onclick={delProduct}>{t('delete')}</button>
  </div>

  <div class="cols">
    <div class="left">
      <figure class="vit plinth" use:droppable={{ onDrop: (s) => addImg(s, pv?.id ?? null) }}>
        {#if vimg}<img src={imgUrl(vimg)} alt={p.name}>{:else}<span class="cap">{t('dropAdd')}</span>{/if}
        <figcaption class="sku">{pv?.sku ?? p.base_no}</figcaption>
      </figure>
      {#if co}
        <div class="rail" aria-label={lab(co.labels, co.key)}>
          {#each [...new Set(p.variants.map((v) => v.values[co.id]).filter(Boolean))] as cid (cid)}
            {@const cv = valueById(cat, cid)}
            <Swatch value={cv} size={14} chip label />
          {/each}
        </div>
      {/if}
      <section class="box">
        <h2>{t('master')}</h2>
        <label class="field"><span>{t('model')}</span><input class="input" value={p.name} onchange={(e) => save('name', e.target.value)}></label>
        <div class="grid2">
          <label class="field"><span>{t('baseNo')}</span><input class="input mono" value={p.base_no} onchange={(e) => save('base_no', e.target.value)}></label>
          <label class="field"><span>{t('status')}</span>
            <select class="select" value={p.status} onchange={(e) => save('status', e.target.value)}>
              {#each ['draft', 'active', 'inactive'] as s (s)}<option value={s}>{t('st.' + s)}</option>{/each}
            </select></label>
        </div>
        <div class="grid2">
          <label class="field"><span>{t('category')}</span>
            <select class="select" value={p.category_id} disabled={p.variants.length > 0} title={p.variants.length ? t('err.has_variants') : ''} onchange={(e) => save('category_id', Number(e.target.value))}>
              {#each ui.data.categories as c (c.id)}<option value={c.id}>{c.name}</option>{/each}
            </select></label>
          <label class="field"><span>{t('supplier')}</span>
            <select class="select" value={p.supplier_id ?? ''} onchange={(e) => save('supplier_id', e.target.value ? Number(e.target.value) : null)}>
              <option value="">—</option>
              {#each ui.data.suppliers as s (s.id)}<option value={s.id}>{s.name}</option>{/each}
            </select></label>
        </div>
        <div class="grid2">
          <label class="field"><span>{t('supModelNo')}</span><input class="input mono" value={p.supplier_model_no ?? ''} onchange={(e) => save('supplier_model_no', e.target.value)}></label>
          <label class="field"><span>{t('material')}</span><input class="input" value={p.material ?? ''} onchange={(e) => save('material', e.target.value)}></label>
        </div>
        <div class="grid3">
          <label class="field"><span>{t('ek')}</span><input class="input" inputmode="decimal" value={fmtNum(p.ek)} onchange={(e) => save('ek', e.target.value)}></label>
          <label class="field"><span>{t('currency')}</span>
            <select class="select" value={p.currency ?? ''} onchange={(e) => save('currency', e.target.value)}>
              <option value="">{sup?.currency || ui.data.tenant.currency} ({t('supplier')})</option>
              {#each ['EUR', 'USD', 'CNY', 'GBP'] as c (c)}<option value={c}>{c}</option>{/each}
            </select></label>
          <label class="field"><span>{t('incoterm')}</span><input class="input" value={p.incoterm ?? ''} placeholder={sup?.incoterm ?? ''} onchange={(e) => save('incoterm', e.target.value)}></label>
        </div>
        <div class="grid3">
          <label class="field"><span>{t('moq')}</span><input class="input" inputmode="numeric" value={p.moq ?? ''} onchange={(e) => save('moq', e.target.value)}></label>
          <label class="field"><span>{t('moqUnit')}</span><input class="input" value={p.moq_unit ?? ''} onchange={(e) => save('moq_unit', e.target.value)}></label>
          <label class="field"><span>{t('leadTime')}</span><input class="input" value={p.lead_time ?? ''} placeholder={sup?.lead_time ?? ''} onchange={(e) => save('lead_time', e.target.value)}></label>
        </div>
        <label class="field"><span>{t('notes')}</span><textarea class="textarea" rows="3" value={p.notes ?? ''} onchange={(e) => save('notes', e.target.value)}></textarea></label>
      </section>

      <section class="box">
        <h2>{t('generate')}</h2>
        <span class="cap">{t('generateHint')}</span>
        {#each cat?.options || [] as o (o.id)}
          <div class="go">
            <span class="cap">{lab(o.labels, o.key)} · <span class="mono">{'{' + o.key + '}'}</span></span>
            <div class="vals">
              {#each valuesFor(o, p) as v (v.id)}
                {@const on = gen[o.id]?.has(v.id)}
                <button type="button" class="vb" class:on class:loc={!!v.product_id} aria-pressed={on} onclick={() => toggleGen(o, v.id)}>
                  {#if o.is_color}<Swatch value={v} size={14} chip />{/if}
                  <span>{lab(v.labels, v.code || '—')}</span><span class="mono cd">{v.code || '∅'}</span>
                  {#if v.product_id}<span class="lt">{t('local')}</span>{/if}
                </button>
              {/each}
              {#if localFor !== o.id}<button type="button" class="vb add" onclick={() => (localFor = o.id)}>{t('addLocal')}</button>{/if}
            </div>
            {#if localFor === o.id}<LocalValue {o} {p} onclose={() => (localFor = null)} />{/if}
            {#each valuesFor(o, p).filter((v) => v.product_id) as v (v.id)}
              <span class="promo cap">{t('local')}: <strong>{lab(v.labels, v.code)}</strong> ({v.code})
                <button type="button" class="lnk" onclick={() => mutate(() => api.patch(`/values/${v.id}`, { product_id: null }))}>{t('makeTemplate')}</button>
                {#if !p.variants.some((x) => Object.values(x.values).includes(v.id))}
                  <button type="button" class="lnk" onclick={() => mutate(() => api.del(`/values/${v.id}`))}>{t('delete')}</button>
                {/if}
              </span>
            {/each}
          </div>
        {/each}
        <button type="button" class="btn primary sm al" disabled={!genCount} onclick={generate}>{t('generate')}{genCount ? ` (${genCount})` : ''}</button>
      </section>
    </div>

    <div class="right">
      <section class="box">
        <div class="row">
          <h2 class="h2 f1">{t('variants')} <span class="cap">{p.variants.length}</span></h2>
          <span class="cap">{t('pattern')} <span class="sku">{cat?.sku_pattern}</span></span>
          <button type="button" class="btn sm" onclick={resku}>{t('resku')}</button>
        </div>
        <div class="tbl-wrap">
          <table class="tbl">
            <thead><tr>
              <th><input type="checkbox" aria-label={t('all')} checked={allChecked} onchange={() => (checked = allChecked ? new Set() : new Set(p.variants.map((v) => v.id)))}></th>
              <th></th><th>{t('intSku')}</th>
              {#each cat?.options || [] as o (o.id)}<th>{lab(o.labels, o.key)}</th>{/each}
              <th>{t('supSku')}</th><th class="r">{t('ek')} {cur}</th><th class="r">{t('moq')}</th><th>{t('status')}</th><th></th>
            </tr></thead>
            <tbody>
              {#each p.variants as v (v.id)}
                <tr class:dim={v.status === 'inactive'} onmouseenter={() => (peek = v.id)} onmouseleave={() => (peek = null)} onfocusin={() => (peek = v.id)}>
                  <td><input type="checkbox" aria-label={v.sku} checked={checked.has(v.id)} onchange={() => toggleCheck(v.id)}></td>
                  <td class="vth" use:droppable={{ onDrop: (s) => addImg(s, v.id) }}>
                    <span class="plinth tp" title={t('dropAdd')}>{#if v.image_id}<img src={imgUrl(v.image_id, true)} alt="">{:else}<span aria-hidden="true">+</span>{/if}</span>
                  </td>
                  <td>
                    <span class="skucell">
                      <input class="cell mono skuin" value={v.sku} aria-label={t('intSku')} onchange={(e) => saveV(v, 'sku', e.target.value)}>
                      {#if v.sku_manual}<span class="manual" title={t('manualHint')}>✎ {t('manual')}</span>{/if}
                    </span>
                  </td>
                  {#each cat?.options || [] as o (o.id)}
                    <td>
                      <span class="vsel">
                        {#if o.is_color}<Swatch value={valueById(cat, v.values[o.id])} size={14} />{/if}
                        <select class="cell" value={v.values[o.id] ?? ''} aria-label={lab(o.labels, o.key)} onchange={(e) => setVal(v, o, e.target.value)}>
                          <option value="">—</option>
                          {#each valuesFor(o, p) as ov (ov.id)}<option value={ov.id}>{lab(ov.labels, ov.code)}{ov.code ? ' · ' + ov.code : ''}</option>{/each}
                        </select>
                      </span>
                    </td>
                  {/each}
                  <td><input class="cell mono" style="width:96px" value={v.supplier_sku ?? ''} aria-label={t('supSku')} onchange={(e) => saveV(v, 'supplier_sku', e.target.value)}></td>
                  <td class="r"><input class="cell num" inputmode="decimal" value={fmtNum(v.ek)} placeholder={fmtNum(v.ek_eff)} aria-label={t('ek')} onchange={(e) => saveV(v, 'ek', e.target.value)}></td>
                  <td class="r"><input class="cell num" inputmode="numeric" value={v.moq ?? ''} placeholder={p.moq ?? ''} aria-label={t('moq')} style="width:70px" onchange={(e) => saveV(v, 'moq', e.target.value)}></td>
                  <td><button type="button" class="stbtn" onclick={() => saveV(v, 'status', v.status === 'active' ? 'inactive' : 'active')}><Status value={v.status} /></button></td>
                  <td><button type="button" class="ico sm" aria-label="{t('delete')} {v.sku}" onclick={() => delVariant(v)}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12"></path></svg></button></td>
                </tr>
              {:else}
                <tr><td colspan="20" class="cap emp">{t('noVariants')}</td></tr>
              {/each}
            </tbody>
          </table>
        </div>
        {#if checked.size}
          <div class="bulk">
            <span class="cap">{t('selection')} ({checked.size}):</span>
            <button type="button" class="btn sm" onclick={() => bulk('ek')}>{t('setEk')}</button>
            <button type="button" class="btn sm" onclick={() => bulk('moq')}>{t('setMoq')}</button>
            <button type="button" class="btn sm" onclick={() => bulk('status')}>{t('toggleActive')}</button>
            <button type="button" class="btn sm" onclick={resku}>{t('resku')}</button>
          </div>
        {/if}
      </section>

      <section class="box">
        <div class="row"><h2 class="h2 f1">{t('images')} <span class="cap">{p.images.length}</span></h2>
          <button type="button" class="btn sm" onclick={() => filePick.click()}>{t('dropAdd')}…</button>
          <input type="file" accept="image/*" multiple hidden bind:this={filePick} onchange={onFiles}></div>
        <div class="gal">
          {#each p.images as im (im.id)}
            <figure class="gi" class:cover={im.id === p.cover}>
              <span class="plinth gp">
                <img src={imgUrl(im.id, true)} alt="">
                <span class="ov">
                  <button type="button" class="btn sm" disabled={im.id === p.cover} onclick={() => save('cover_image_id', im.id)}>{t('setCover')}</button>
                  <button type="button" class="ico sm del" aria-label={t('removeImg')} onclick={() => (ui.dialog = { type: 'confirm', title: t('removeImg'), onYes: () => mutate(() => api.del(`/images/${im.id}`)) })}>×</button>
                </span>
                {#if im.id === p.cover}<span class="star" title={t('setCover')}>★</span>{/if}
              </span>
              <figcaption>
                <select class="cell" value={im.variant_id ?? ''} aria-label={t('assignTo')} onchange={(e) => mutate(() => api.patch(`/images/${im.id}`, { variant_id: e.target.value ? Number(e.target.value) : null }))}>
                  <option value="">{t('productOnly')}</option>
                  {#each p.variants as v (v.id)}<option value={v.id}>{v.sku}</option>{/each}
                </select>
              </figcaption>
            </figure>
          {/each}
          <div class="drop gdrop" use:droppable={{ onDrop: (s) => addImg(s) }}><span>{t('dropAdd')}</span></div>
        </div>
      </section>

      <div class="duo">
        <section class="box">
          <h2>{t('tiers')}</h2>
          <table class="tbl"><thead><tr><th>{t('fromQty')}</th><th class="r">{t('ek')} {cur}</th><th>{t('notes')}</th><th></th></tr></thead>
            <tbody>
              {#each tiers as x, i (i)}
                <tr><td><input class="cell num" inputmode="numeric" bind:value={x.qty_from} aria-label={t('fromQty')}></td>
                  <td class="r"><input class="cell num" inputmode="decimal" bind:value={x.ek} aria-label={t('ek')}></td>
                  <td><input class="cell" bind:value={x.note} aria-label={t('notes')}></td>
                  <td><button type="button" class="ico sm" aria-label={t('delete')} onclick={() => tiers.splice(i, 1)}>×</button></td></tr>
              {/each}
            </tbody></table>
          <span class="row"><button type="button" class="btn sm" onclick={() => tiers.push({ qty_from: '', ek: '', note: '' })}>{t('addTier')}</button>
            <button type="button" class="btn sm primary" onclick={saveTiers}>{t('save')}</button></span>
        </section>
        <section class="box">
          <h2>{t('surcharges')}</h2>
          <table class="tbl"><thead><tr><th>{t('service')}</th><th>{t('condition')}</th><th class="r">{t('amount')}</th><th></th></tr></thead>
            <tbody>
              {#each surs as s, i (i)}
                <tr><td><input class="cell" bind:value={s.label} aria-label={t('service')} style="width:100%;min-width:90px"></td>
                  <td><input class="cell" bind:value={s.cond} aria-label={t('condition')} style="width:100%;min-width:80px"></td>
                  <td class="r"><span class="mm"><input class="cell num" style="width:52px" bind:value={s.amount_min} aria-label="min">–<input class="cell num" style="width:52px" bind:value={s.amount_max} aria-label="max"></span></td>
                  <td><button type="button" class="ico sm" aria-label={t('delete')} onclick={() => surs.splice(i, 1)}>×</button></td></tr>
              {/each}
            </tbody></table>
          <span class="row"><button type="button" class="btn sm" onclick={() => surs.push({ label: '', cond: '', amount_min: '', amount_max: '' })}>+ {t('surcharge')}</button>
            <button type="button" class="btn sm primary" onclick={saveSurs}>{t('save')}</button></span>
        </section>
      </div>
    </div>
  </div>
</div>
{/if}

<style>
  .pad { padding: 32px; }
  .wrap { max-width: 1440px; margin: 0 auto; padding: 18px 16px 48px; display: flex; flex-direction: column; gap: 18px; }
  .top { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; }
  .tt { display: flex; flex-direction: column; }
  .crumbs { display: flex; gap: 8px; font-size: 13px; color: var(--muted); }
  .crumbs a { color: inherit; }
  .right .tbl td, .right .tbl th { padding-left: 6px; padding-right: 6px; }
  h1 { margin: 0; font-size: 20px; font-weight: 500; }
  .big { font-size: 14px; color: var(--brand); margin-right: 6px; }
  .sp { flex: 1; }
  a.ico { color: var(--ink); }
  .cols { display: flex; flex-wrap: wrap; gap: 18px; align-items: flex-start; }
  .left { flex: 1 1 340px; max-width: 400px; display: flex; flex-direction: column; gap: 18px; min-width: 0; }
  .right { flex: 999 1 560px; min-width: 0; display: flex; flex-direction: column; gap: 18px; }
  @media (max-width: 900px) { .left { max-width: none; } }
  .f1 { flex: 1 1 auto; }
  .go { display: flex; flex-direction: column; gap: 6px; }
  .vals { display: flex; flex-wrap: wrap; gap: 6px; }
  .vb { display: inline-flex; align-items: center; gap: 6px; height: 34px; padding: 0 12px; border: 1.5px solid var(--line); border-radius: 999px; background: var(--surface); font-size: 13px; }
  .vb.on { border-color: var(--ink); background: var(--pill); font-weight: 600; }
  .vb.on::before { content: '✓'; font-weight: 700; }
  .cd { font-size: 11px; color: var(--brand); font-weight: 700; }
  .vb.loc { border-style: dashed; }
  .lt { font-size: 10px; font-weight: 600; color: var(--muted); }
  .vb.add { border-style: dashed; color: var(--ink2); background: transparent; }
  .promo { display: flex; flex-wrap: wrap; gap: 8px; align-items: baseline; font-size: 12px; }
  .lnk { border: 0; background: none; padding: 0; font-size: 12px; color: var(--brand); text-decoration: underline; text-underline-offset: 2px; }
  .al { align-self: flex-start; }
  .vth { width: 56px; padding: 4px 6px; }
  .tp { width: 48px; height: 34px; border-radius: 7px; display: flex; align-items: center; justify-content: center; color: var(--plinth-ink); font-weight: 600; }
  .tp::after, .gp::after { display: none; }
  .tp img { width: 100%; height: 100%; object-fit: contain; padding: 2px; }
  .vth:global([data-over]) .tp { outline: 3px dashed var(--brand); background: #EAD3B1; }
  .vit { margin: 0; aspect-ratio: 4 / 3; border-radius: 20px; display: flex; align-items: center; justify-content: center; }
  .vit img { width: 100%; height: 100%; object-fit: contain; padding: 8% 10%; position: relative; z-index: 1; }
  .vit figcaption { position: absolute; left: 14px; bottom: 12px; z-index: 2; color: var(--plinth-ink); font-size: 12px; }
  .vit:global([data-over]) { outline: 3px dashed var(--plinth-ink); outline-offset: -8px; background: #EAD3B1; }
  .rail { display: flex; flex-wrap: wrap; gap: 6px 14px; padding: 0 4px; }
  .mini { width: 44px; height: 34px; display: flex; align-items: center; justify-content: center; border-radius: 8px; border-width: 1.5px; font-weight: 700; }
  .skucell { display: inline-flex; align-items: center; gap: 6px; }
  .skuin { width: 118px; font-weight: 700; }
  .vsel { display: inline-flex; align-items: center; gap: 6px; }
  .vsel .cell { width: auto; max-width: 128px; }
  .stbtn { border: 0; background: none; padding: 0; }
  .emp { text-align: center; padding: 24px; }
  .bulk { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; padding: 10px 12px; border-radius: 12px; background: var(--panel); }
  .gal { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 12px; }
  .gi { margin: 0; display: flex; flex-direction: column; gap: 6px; }
  .gp { aspect-ratio: 4 / 3; border-radius: 12px; display: block; }
  .gp img { width: 100%; height: 100%; object-fit: contain; padding: 6px; display: block; }
  .gi.cover .gp { box-shadow: 0 0 0 2.5px var(--ink); }
  .star { position: absolute; top: 6px; left: 8px; color: var(--plinth-ink); font-size: 14px; }
  .ov { position: absolute; inset: auto 6px 6px 6px; display: flex; justify-content: space-between; gap: 6px; opacity: 0; transition: opacity 0.12s; }
  .gp:hover .ov, .gp:focus-within .ov { opacity: 1; }
  @media (hover: none) { .ov { opacity: 1; } }
  .ov .btn { background: rgba(255, 255, 255, 0.92); color: #2A1410; height: 30px; padding: 0 10px; font-size: 12px; }
  .ov .del { width: 30px; height: 30px; background: rgba(255, 255, 255, 0.92); color: #2A1410; }
  figcaption { display: flex; flex-direction: column; gap: 6px; }
  figcaption .cell { width: 100%; }
  .gdrop { aspect-ratio: 4 / 3; display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 600; }
  .duo { display: flex; flex-wrap: wrap; gap: 18px; }
  .duo > .box { flex: 1 1 340px; }
  .mm { display: inline-flex; align-items: center; gap: 4px; }
  .duo .tbl td { padding: 8px 6px; }
  .duo .tbl-wrap, .duo .box { overflow-x: auto; }
</style>
