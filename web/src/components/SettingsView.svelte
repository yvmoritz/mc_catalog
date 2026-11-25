<script>
  import { ui, t, lab, api, mutate, loadTenants, toast, openTenant, go } from '../lib/store.svelte.js';
  import { renderSku, formatBase, tokens } from '$shared/sku.js';
  import { LANGS } from '../lib/i18n.js';
  import Glasses from './Glasses.svelte';

  const d = $derived(ui.data);
  const tn = $derived(d.tenant);
  let access = $state(null);

  const saveT = async (f, v) => { await mutate(() => api.patch(`/tenants/${tn.id}`, { [f]: v === '' ? null : v })); loadTenants(); };
  const saveC = (c, f, v) => mutate(() => api.patch(`/categories/${c.id}`, { [f]: v }));
  const saveO = (o, f, v) => mutate(() => api.patch(`/options/${o.id}`, { [f]: v }));
  const saveV = (v, f, val) => mutate(() => api.patch(`/values/${v.id}`, { [f]: val === '' ? null : val }));
  const setLabel = (obj, lang, val, fn) => fn({ ...obj.labels, [lang]: val });

  async function addCat() { const name = prompt(t('newCategory')); if (name) await mutate(() => api.post(`/tenants/${tn.id}/categories`, { name, sku_pattern: '{basis}' })); }
  async function addOpt(c) {
    const key = prompt(`${t('optKey')} (a–z, 0–9, _)`);
    if (key) await mutate(() => api.post(`/categories/${c.id}/options`, { key, labels: key }));
  }
  const addVal = (o) => mutate(() => api.post(`/options/${o.id}/values`, { code: `N${o.values.length + 1}`, labels: t('value'), hex: o.is_color ? '#888888' : undefined }));
  function del(kind, x, label) {
    ui.dialog = { type: 'confirm', title: `${t('delete')} ${label}?`, onYes: () => mutate(() => api.del(`/${kind}/${x.id}`)) };
  }
  function insertToken(c, tok) {
    const el = document.getElementById(`pat-${c.id}`);
    const pos = el?.selectionStart ?? c.sku_pattern.length;
    const v = c.sku_pattern.slice(0, pos) + tok + c.sku_pattern.slice(pos);
    saveC(c, 'sku_pattern', v);
  }
  /** Vorschau: erstes Produkt der Kategorie, sonst Beispiel aus den ersten Werten */
  function previewFor(c) {
    const p = d.products.find((x) => x.category_id === c.id);
    if (p?.variants.length) return p.variants.slice(0, 4).map((v) => renderSku(c.sku_pattern, {
      basis: p.base_no, lieferant: d.suppliers.find((s) => s.id === p.supplier_id)?.code || '',
      values: Object.fromEntries(c.options.map((o) => [o.key, o.values.find((x) => x.id === v.values[o.id])?.code || ''])),
    }));
    const base = formatBase(tn.sku_prefix, tn.sku_digits, tn.next_no);
    return [renderSku(c.sku_pattern, { basis: base, lieferant: 'SUP', values: Object.fromEntries(c.options.map((o) => [o.key, o.values.at(-1)?.code || ''])) })];
  }
  const unknownTokens = (c) => tokens(c.sku_pattern).filter((k) => !['basis', 'lieferant', 'jahr', ...c.options.map((o) => o.key)].includes(k));

  async function uploadLogo(variant, e) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    const mime = f.type === 'image/svg+xml' || /\.svg$/i.test(f.name) ? 'image/svg+xml' : f.type;
    const buf = new Uint8Array(await f.arrayBuffer());
    let bin = '';
    for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    await mutate(() => api.put(`/tenants/${tn.id}/logo/${variant}`, { mime, data: btoa(bin) }));
    loadTenants();
  }
  const delLogo = async (variant) => { await mutate(() => api.del(`/tenants/${tn.id}/logo/${variant}`)); loadTenants(); };

  async function loadAccess() { try { access = (await api.get(`/tenants/${tn.id}/access`)).users; } catch (e) { toast(e.message, 'error'); } }
  $effect(() => { if (ui.isAdmin && tn) loadAccess(); });
  async function toggleAccess(u) {
    const names = access.filter((x) => (x.name === u.name ? !x.access : x.access) && !x.is_admin).map((x) => x.name);
    access = (await api.put(`/tenants/${tn.id}/access`, { users: names })).users;
  }
  async function toggleAdmin(u) {
    try { await api.patch(`/users/${encodeURIComponent(u.name)}`, { is_admin: !u.is_admin }); loadAccess(); } catch (e) { toast(e.message, 'error'); }
  }
  function delTenant() {
    ui.dialog = { type: 'confirm', title: `${t('delete')} ${tn.name}?`, text: t('confirmDelProduct'), onYes: async () => {
      await api.del(`/tenants/${tn.id}`); await loadTenants(); if (ui.tenants[0]) await openTenant(ui.tenants[0].id); go('products');
    } };
  }
</script>

<div class="wrap">

  <div class="cols">
    <section class="box">
      <h2>{t('branding')}</h2>
      <div class="grid2">
        <label class="field"><span>{t('tenantName')}</span><input class="input" value={tn.name} onchange={(e) => saveT('name', e.target.value)}></label>
        <label class="field"><span>{t('short')}</span><input class="input mono" maxlength="3" value={tn.short ?? ''} onchange={(e) => saveT('short', e.target.value)}></label>
      </div>
      <div class="grid3">
        <label class="field"><span>{t('primary')}</span><input type="color" value={tn.color_primary || '#4D231B'} onchange={(e) => saveT('color_primary', e.target.value)}></label>
        <label class="field"><span>{t('accent')}</span><input type="color" value={tn.color_accent || '#EAD3B1'} onchange={(e) => saveT('color_accent', e.target.value)}></label>
        <label class="field"><span>{t('currency')}</span>
          <select class="select" value={tn.currency} onchange={(e) => saveT('currency', e.target.value)}>{#each ['EUR', 'USD', 'CNY', 'GBP'] as c (c)}<option value={c}>{c}</option>{/each}</select></label>
      </div>
      <div class="grid2">
        {#each [['light', tn.logo, t('logoLight')], ['dark', tn.logo_dark, t('logoDark')]] as [v, url, label] (v)}
          <div class="field">
            <span>{label}</span>
            <div class="lg" style={v === 'dark' ? `background:${tn.color_primary || '#4D231B'}` : ''}>
              {#if url}<img src={url} alt="{t('logo')} {v}">{:else}<span class="cap">—</span>{/if}
            </div>
            <span class="row">
              <label class="btn sm">{t('add')}…<input type="file" accept="image/png,image/svg+xml,.svg" hidden onchange={(e) => uploadLogo(v, e)}></label>
              {#if url}<button type="button" class="btn ghost sm" onclick={() => delLogo(v)}>{t('delete')}</button>{/if}
            </span>
          </div>
        {/each}
      </div>
      <span class="cap">{t('logoHint')}</span>
      {#if ui.isAdmin && ui.tenants.length > 1}<button type="button" class="btn ghost sm al" onclick={delTenant}>{t('delete')} {tn.name}</button>{/if}
    </section>

    <section class="box">
      <h2>{t('skuSchema')}</h2>
      <div class="grid3">
        <label class="field"><span>{t('prefix')}</span><input class="input mono" value={tn.sku_prefix} onchange={(e) => saveT('sku_prefix', e.target.value)}></label>
        <label class="field"><span>{t('digits')}</span><input class="input" type="number" min="1" max="8" value={tn.sku_digits} onchange={(e) => saveT('sku_digits', Number(e.target.value))}></label>
        <label class="field"><span>{t('nextBase')}</span><input class="input mono" type="number" min="1" value={tn.next_no} onchange={(e) => saveT('next_no', Number(e.target.value))}></label>
      </div>
      <span class="cap">{t('preview')}: <span class="sku">{formatBase(tn.sku_prefix, tn.sku_digits, tn.next_no)}</span></span>
      <p class="cap hint">{t('patternHint')}</p>
    </section>
  </div>

  <div class="row"><h2 class="h2 f1">{t('categories')}</h2><button type="button" class="btn sm" onclick={addCat}>+ {t('newCategory')}</button></div>
  {#each d.categories as c (c.id)}
    <section class="box">
      <div class="row">
        <input class="input catn" value={c.name} aria-label={t('category')} onchange={(e) => saveC(c, 'name', e.target.value)}>
        <span class="f1"></span>
        <button type="button" class="btn ghost sm" onclick={() => del('categories', c, c.name)}>{t('delete')}</button>
      </div>
      <label class="field"><span>{t('pattern')}</span><input id="pat-{c.id}" class="input mono pat" value={c.sku_pattern} onchange={(e) => saveC(c, 'sku_pattern', e.target.value)}></label>
      <div class="row">
        <span class="cap">{t('insert')}</span>
        {#each ['basis', ...c.options.map((o) => o.key), 'lieferant', 'jahr'] as k (k)}
          <button type="button" class="tok mono" onclick={() => insertToken(c, `{${k}}`)}>{'{' + k + '}'}</button>
        {/each}
        {#each ['.', '-'] as s (s)}<button type="button" class="tok mono" onclick={() => insertToken(c, s)}>{s}</button>{/each}
      </div>
      <div class="pv">
        <span class="cap">{t('preview')}</span>
        {#each previewFor(c) as s, i (i)}<span class="sku pvs">{s}</span>{/each}
        {#each unknownTokens(c) as k (k)}<span class="manual">?{'{' + k + '}'}</span>{/each}
      </div>

      {#each c.options as o (o.id)}
        <div class="opt">
          <div class="row">
            <span class="sku tokn">{'{' + o.key + '}'}</span>
            {#each LANGS as l (l)}
              <label class="lab"><span class="cap">{l.toUpperCase()}</span><input class="cell" value={o.labels[l] ?? ''} onchange={(e) => setLabel(o, l, e.target.value, (v) => saveO(o, 'labels', v))}></label>
            {/each}
            <label class="cap chk"><input type="checkbox" checked={o.is_color} onchange={(e) => saveO(o, 'is_color', e.target.checked)}> {t('isColor')}</label>
            <span class="f1"></span>
            <button type="button" class="ico sm" aria-label="{t('delete')} {o.key}" onclick={() => del('options', o, '{' + o.key + '}')}>×</button>
          </div>
          <div class="tbl-wrap">
            <table class="tbl">
              <thead><tr>{#if o.is_color}<th>{t('color')}</th>{/if}<th>{t('code')}</th>{#each LANGS as l (l)}<th>{l.toUpperCase()}</th>{/each}<th class="r">{t('surcharge')}</th><th></th></tr></thead>
              <tbody>
                {#each o.values.filter((x) => !x.product_id) as v (v.id)}
                  <tr>
                    {#if o.is_color}
                      <td><span class="cl"><Glasses value={v} width={58} />
                        {#each [['hex', 'frame1'], ['hex2', 'color2'], ['hex3', 'color3']] as [f, k] (f)}
                          <label class="cp" class:off={!v[f]}>
                            <input type="color" value={v[f] || (f === 'hex2' ? '#ffffff' : '#888888')} aria-label="{lab(v.labels, v.code)} {t(k)}" onchange={(e) => saveV(v, f, e.target.value)}>
                            <span>{t(k)}</span>
                            {#if v[f] && f !== 'hex'}<button type="button" class="xs-x" aria-label="{t(k)} {t('delete')}" onclick={(e) => { e.preventDefault(); saveV(v, f, null); }}>×</button>{/if}
                          </label>
                        {/each}
                      </span></td>
                    {/if}
                    <td><input class="cell mono" style="width:80px" value={v.code} aria-label={t('code')} onchange={(e) => saveV(v, 'code', e.target.value)}></td>
                    {#each LANGS as l (l)}
                      <td><input class="cell" style="width:120px" value={v.labels[l] ?? ''} aria-label="{t('label')} {l}" onchange={(e) => setLabel(v, l, e.target.value, (x) => saveV(v, 'labels', x))}></td>
                    {/each}
                    <td class="r"><input class="cell num" inputmode="decimal" value={v.ek_delta || ''} aria-label={t('surcharge')} onchange={(e) => saveV(v, 'ek_delta', e.target.value || 0)}></td>
                    <td><button type="button" class="ico sm" aria-label="{t('delete')} {lab(v.labels, v.code)}" onclick={() => del('values', v, lab(v.labels, v.code))}>×</button></td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
          <button type="button" class="btn sm al" onclick={() => addVal(o)}>+ {t('value')}</button>
          {#if o.values.some((x) => x.product_id)}
            <div class="locs">
              <span class="cap">{t('localValues')}</span>
              {#each o.values.filter((x) => x.product_id) as v (v.id)}
                {@const pr = d.products.find((x) => x.id === v.product_id)}
                <span class="lrow">
                  <Glasses value={v} width={36} />
                  <span><strong>{lab(v.labels, v.code)}</strong> <span class="sku">{v.code}</span></span>
                  <a class="cap" href="#/product/{v.product_id}">{pr ? `${pr.base_no} ${pr.name}` : ''}</a>
                  <button type="button" class="btn sm ghost" onclick={() => saveV(v, 'product_id', null)}>{t('makeTemplate')}</button>
                </span>
              {/each}
            </div>
          {/if}
        </div>
      {/each}
      <button type="button" class="btn sm al" onclick={() => addOpt(c)}>+ {t('newOption')}</button>
    </section>
  {/each}

  {#if ui.isAdmin && access}
    <section class="box">
      <h2>{t('access')}</h2>
      <span class="cap">{t('accessHint')}</span>
      <table class="tbl">
        <thead><tr><th>{t('signedIn')}</th><th>{t('access')}</th><th>{t('admin')}</th><th>{t('lastSeen')}</th></tr></thead>
        <tbody>
          {#each access as u (u.name)}
            <tr><td>{u.name}</td>
              <td><input type="checkbox" checked={u.access} disabled={!!u.is_admin} aria-label="{t('access')} {u.name}" onchange={() => toggleAccess(u)}></td>
              <td><input type="checkbox" checked={!!u.is_admin} aria-label="{t('admin')} {u.name}" onchange={() => toggleAdmin(u)}></td>
              <td class="cap">{u.last_seen}</td></tr>
          {/each}
        </tbody>
      </table>
    </section>
  {/if}
</div>

<style>
  .wrap { max-width: 1200px; margin: 0 auto; padding: 24px 16px 48px; display: flex; flex-direction: column; gap: 18px; }
  h1 { margin: 0; font-weight: 300; font-size: 32px; }
  .cols { display: flex; flex-wrap: wrap; gap: 18px; }
  .cols > .box { flex: 1 1 420px; }
  .f1 { flex: 1 1 auto; }
  .al { align-self: flex-start; }
  .lg { height: 84px; border-radius: 12px; background: #F2F1F1; display: flex; align-items: center; justify-content: center; padding: 10px; box-sizing: border-box; }
  .lg.dk { background: var(--brand-fixed, #4D231B); }
  .lg img { max-height: 100%; max-width: 100%; object-fit: contain; }
  label.btn { cursor: pointer; display: inline-flex; align-items: center; }
  .hint { margin: 0; line-height: 1.5; }
  input[type='color'] { width: 44px; height: 44px; border: 0; padding: 0; background: none; border-radius: 10px; }
  .cl input[type='color'] { width: 32px; height: 32px; }
  input.off { opacity: 0.4; }
  .catn { max-width: 320px; font-weight: 600; font-size: 17px; }
  .pat { font-size: 16px; font-weight: 700; color: var(--brand); }
  .tok { height: 30px; padding: 0 10px; border: 0; border-radius: 999px; background: var(--pill); font-size: 12px; }
  .tok:hover { background: var(--hover); }
  .pv { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; padding: 12px 14px; border-radius: 12px; background: var(--panel); }
  .pvs { padding: 5px 10px; border-radius: 8px; background: var(--surface); }
  .opt { display: flex; flex-direction: column; gap: 10px; padding: 14px; border-radius: 14px; box-shadow: inset 0 0 0 1px var(--line); }
  .tokn { font-size: 15px; color: var(--brand); }
  .lab { display: inline-flex; align-items: center; gap: 4px; }
  .lab .cell { width: 110px; }
  .chk { display: inline-flex; align-items: center; gap: 6px; }
  .locs { display: flex; flex-direction: column; gap: 6px; padding-top: 6px; border-top: 1px solid var(--line); }
  .lrow { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; font-size: 14px; }
  .lrow a { color: var(--ink2); }
  .cl { display: inline-flex; align-items: center; gap: 10px; }
  .cp { display: inline-flex; flex-direction: column; align-items: center; gap: 1px; font-size: 10px; font-weight: 500; color: var(--muted); position: relative; }
  /* leer: gestricheltes Feld mit +, statt Weiß vorzutäuschen */
  .cp.off input { opacity: 0; }
  .cp.off::before { content: '+'; position: absolute; top: 2px; left: 50%; transform: translateX(-50%); width: 26px; height: 26px; box-sizing: border-box; border: 1.5px dashed var(--edge); border-radius: 6px; display: flex; align-items: center; justify-content: center; font-size: 15px; font-weight: 600; color: var(--muted); pointer-events: none; }
  .xs-x { position: absolute; top: -6px; right: -6px; width: 18px; height: 18px; border-radius: 50%; border: 0; background: var(--ink); color: var(--surface); font-size: 11px; line-height: 1; padding: 0; }
</style>
