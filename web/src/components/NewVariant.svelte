<script>
  import { onMount } from 'svelte';
  import { ui, t, lab, api, mutate, uploadImage, setUndo, toast, catOf, supOf, valuesFor } from '../lib/store.svelte.js';
  import { renderSku, normCode } from '$shared/sku.js';
  import { guessColor } from '../lib/color.js';
  import Swatch from './Swatch.svelte';
  import Glasses from './Glasses.svelte';

  /** src: {file}|{url}|null — abgelegtes Bild */
  let { p, src = null, onclose } = $props();
  const cat = $derived(catOf(p));
  const sup = $derived(supOf(p));

  // je Option: gewählter Wert-ID oder 'new'
  let pick = $state({});
  let nv = $state({}); // optId -> {code, name, hex, hex2}
  let supplierSku = $state('');
  let ek = $state('');
  let saving = $state(false);
  let preview = $state(null);
  let fileInput;
  let source = $state(null);

  onMount(() => {
    source = src;
    const used = (oid) => new Set(p.variants.map((v) => v.values[oid]));
    for (const o of cat.options) {
      if (o.is_color) {
        const free = valuesFor(o, p).find((v) => !used(o.id).has(v.id));
        pick[o.id] = src ? 'new' : (free?.id ?? 'new');
        nv[o.id] = { code: '', name: '', hex: '#888888', hex2: '', hex3: '#5B6168', local: true };
      } else {
        pick[o.id] = valuesFor(o, p)[0]?.id ?? 'new';
        nv[o.id] = { code: '', name: '', hex: '', hex2: '', hex3: '', local: true };
      }
    }
    setSource(src);
    return () => { if (preview?.startsWith('blob:')) URL.revokeObjectURL(preview); };
  });

  async function setSource(s) {
    source = s;
    if (preview?.startsWith('blob:')) URL.revokeObjectURL(preview);
    preview = s?.file ? URL.createObjectURL(s.file) : s?.url || null;
    const co = cat.options.find((o) => o.is_color);
    if (s?.file && co) { const h = await guessColor(s.file); if (h && nv[co.id]) nv[co.id].hex = h; }
  }

  const codeOf = (o) => (pick[o.id] === 'new' ? normCode(nv[o.id]?.code) : o.values.find((v) => v.id === pick[o.id])?.code ?? '');
  const sku = $derived(cat ? renderSku(cat.sku_pattern, { basis: p.base_no, lieferant: sup?.code || '', values: Object.fromEntries(cat.options.map((o) => [o.key, codeOf(o)])) }) : '');
  const exists = $derived(ui.data.products.some((x) => x.variants.some((v) => v.sku === sku)));
  const missingNew = $derived(cat.options.some((o) => pick[o.id] === 'new' && o.is_color && !normCode(nv[o.id]?.code)));

  async function create() {
    saving = true;
    const values = {}, new_values = {};
    for (const o of cat.options) {
      if (pick[o.id] === 'new') {
        const n = nv[o.id];
        new_values[o.id] = { code: n.code, labels: n.name ? { es: n.name, de: n.name, en: n.name } : undefined, hex: o.is_color ? n.hex : undefined, hex2: o.is_color && n.hex2 ? n.hex2 : undefined, hex3: o.is_color && n.hex3 ? n.hex3 : undefined, local: n.local };
      } else if (pick[o.id]) values[o.id] = pick[o.id];
    }
    try {
      const v = await api.post(`/products/${p.id}/variants`, { values, new_values, supplier_sku: supplierSku || undefined, ek: ek === '' ? undefined : ek });
      if (source) {
        try { await uploadImage(p.id, source.file || source.url, v.id); }
        catch (e) { toast(e.message, 'error'); }
      }
      setUndo(`${t('newVariant')} ${v.sku}`, () => api.del(`/variants/${v.id}`));
      await mutate(async () => {});
      onclose(v.id);
    } catch (e) {
      toast(e.message, 'error');
    } finally { saving = false; }
  }
  function onFile(e) { const f = e.target.files?.[0]; if (f) setSource({ file: f }); }
</script>

<div class="nv" role="group" aria-label={t('newVariant')}>
  <div class="pv">
    {#if preview}<img src={preview} alt="">{:else}
      <button type="button" class="pick" onclick={() => fileInput.click()}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="3"></rect><path d="M3 15l5-4 4 3 3-2 6 5"></path></svg>
        <span>{t('images')}</span>
      </button>
    {/if}
    {#if source?.url}<span class="tag">URL</span>{/if}
    <input type="file" accept="image/*" bind:this={fileInput} onchange={onFile} hidden>
  </div>

  <div class="fields">
    <div class="hd"><strong>{t('newVariant')}</strong>{#if source?.url}<span class="cap mono src" title={source.url}>{source.url.replace(/^https?:\/\//, '').slice(0, 70)}</span>{/if}</div>
    <div class="row opts">
      {#each cat.options as o (o.id)}
        <div class="field">
          <span>{lab(o.labels, o.key)}</span>
          {#if o.is_color}
            <div class="sws">
              {#each valuesFor(o, p) as v (v.id)}<Swatch value={v} size={18} chip selected={pick[o.id] === v.id} onclick={() => (pick[o.id] = v.id)} />{/each}
              <button type="button" class="newb" class:on={pick[o.id] === 'new'} aria-pressed={pick[o.id] === 'new'} onclick={() => (pick[o.id] = 'new')}>{t('newValue')}</button>
            </div>
          {:else}
            <div class="pillset">
              {#each valuesFor(o, p) as v (v.id)}
                <button type="button" class="pz" class:on={pick[o.id] === v.id} aria-pressed={pick[o.id] === v.id} onclick={() => (pick[o.id] = v.id)}>{lab(v.labels, v.code || '—')}</button>
              {/each}
              <button type="button" class="pz" class:on={pick[o.id] === 'new'} aria-pressed={pick[o.id] === 'new'} onclick={() => (pick[o.id] = 'new')}>+</button>
            </div>
          {/if}
          {#if pick[o.id] === 'new' && nv[o.id]}
            <div class="newrow">
              <input class="input code mono" placeholder={t('code')} aria-label="{t('code')} {lab(o.labels, o.key)}" bind:value={nv[o.id].code} maxlength="12">
              <input class="input" placeholder={t('label')} aria-label="{t('label')} {lab(o.labels, o.key)}" bind:value={nv[o.id].name} maxlength="40">
              {#if o.is_color}
                <span class="cols">
                  <label class="cp"><input type="color" bind:value={nv[o.id].hex}><span>{t('frame1')}</span></label>
                  <label class="cp" class:off={!nv[o.id].hex2}><input type="color" value={nv[o.id].hex2 || '#ffffff'} oninput={(e) => (nv[o.id].hex2 = e.target.value)}><span>{t('color2')}</span>
                    {#if nv[o.id].hex2}<button type="button" class="xs-x" aria-label="{t('color2')} {t('delete')}" onclick={(e) => { e.preventDefault(); nv[o.id].hex2 = ''; }}>×</button>{/if}</label>
                  <label class="cp"><input type="color" bind:value={nv[o.id].hex3}><span>{t('color3')}</span></label>
                  <Glasses value={nv[o.id]} width={64} />
                </span>
              {/if}
            </div>
            <label class="loc"><input type="checkbox" bind:checked={nv[o.id].local}> {t('localOnly')}</label>
          {/if}
        </div>
      {/each}
    </div>
    <div class="row">
      <label class="field sm"><span>{t('supSku')}</span><input class="input mono" bind:value={supplierSku}></label>
      <label class="field xs"><span>{t('ek')}</span><input class="input" inputmode="decimal" placeholder={p.ek != null ? String(p.ek) : ''} bind:value={ek}></label>
      <div class="field"><span>{t('intSku')}</span><span class="sku out" class:bad={exists}>{sku}{#if exists} · {t('err.exists')}{/if}</span></div>
      <span class="act">
        <button type="button" class="btn sm" onclick={() => onclose(null)}>{t('cancel')}</button>
        <button type="button" class="btn sm primary" disabled={saving || exists || missingNew} onclick={create}>{t('create')}</button>
      </span>
    </div>
  </div>
</div>

<style>
  .nv { display: flex; flex-wrap: wrap; gap: 16px; padding: 16px; border-radius: 16px; background: var(--panel); box-shadow: inset 0 0 0 1px var(--line); }
  .pv { position: relative; width: 120px; height: 90px; border-radius: 12px; background: var(--bg); flex: none; display: flex; align-items: center; justify-content: center; overflow: hidden; }
  .pv img { width: 100%; height: 100%; object-fit: contain; }
  .pick { border: 0; background: none; display: flex; flex-direction: column; align-items: center; gap: 4px; color: var(--ink2); font-size: 12px; }
  .tag { position: absolute; left: 6px; bottom: 6px; font-size: 10px; font-weight: 700; background: var(--surface); border-radius: 999px; padding: 2px 6px; }
  .fields { flex: 1 1 360px; display: flex; flex-direction: column; gap: 12px; min-width: 0; }
  .hd { display: flex; gap: 12px; align-items: baseline; min-width: 0; }
  .src { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; }
  .opts { align-items: flex-start; gap: 18px; }
  .sws { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; }
  .newb { height: 30px; padding: 0 12px; border: 1.5px dashed var(--edge); border-radius: 999px; background: transparent; font-size: 13px; }
  .newb.on { border-style: solid; border-color: var(--ink); font-weight: 700; }
  .newrow { display: flex; gap: 6px; align-items: center; margin-top: 4px; }
  .newrow .input { min-height: 38px; font-size: 14px; }
  .code { width: 84px; text-transform: uppercase; }
  input[type='color'] { width: 32px; height: 32px; border: 0; padding: 0; background: none; border-radius: 8px; }
  .newrow { flex-wrap: wrap; }
  .loc { display: flex; align-items: center; gap: 6px; font-size: 13px; color: var(--ink2); margin-top: 6px; }
  .cols { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .cp { display: inline-flex; flex-direction: column; align-items: center; gap: 2px; font-size: 11px; font-weight: 500; color: var(--muted); position: relative; }
  /* leer: gestricheltes Feld mit +, statt Weiß vorzutäuschen */
  .cp.off input { opacity: 0; }
  .cp.off::before { content: '+'; position: absolute; top: 2px; left: 50%; transform: translateX(-50%); width: 26px; height: 26px; box-sizing: border-box; border: 1.5px dashed var(--edge); border-radius: 6px; display: flex; align-items: center; justify-content: center; font-size: 15px; font-weight: 600; color: var(--muted); pointer-events: none; }
  .xs-x { position: absolute; top: -6px; right: -6px; width: 18px; height: 18px; border-radius: 50%; border: 0; background: var(--ink); color: var(--surface); font-size: 11px; line-height: 1; padding: 0; }
  .pillset .pz { height: 32px; padding: 0 12px; font-size: 13px; }
  .sm { width: 160px; } .xs { width: 100px; }
  .out { height: 44px; display: flex; align-items: center; font-size: 15px; color: var(--brand); }
  .out.bad { color: var(--info); text-decoration: underline wavy; }
  .act { display: flex; gap: 8px; margin-left: auto; align-self: flex-end; }
</style>
