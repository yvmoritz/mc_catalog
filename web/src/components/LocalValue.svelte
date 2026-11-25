<script>
  import { t, api, mutate, normCodeUi } from '../lib/store.svelte.js';
  import Glasses from './Glasses.svelte';
  /** Lokalen Wert (nur dieses Produkt) für eine Option anlegen */
  let { o, p, onclose } = $props();
  let code = $state('');
  let name = $state('');
  let hex = $state('#888888');
  let hex2 = $state('');
  let hex3 = $state('#5B6168');
  let saving = $state(false);
  const val = $derived({ hex, hex2, hex3 });
  async function save() {
    saving = true;
    const r = await mutate(() => api.post(`/options/${o.id}/values`, {
      code, product_id: p.id, labels: name ? { es: name, de: name, en: name } : undefined,
      hex: o.is_color ? hex : undefined, hex2: o.is_color && hex2 ? hex2 : undefined, hex3: o.is_color ? hex3 : undefined,
    }));
    saving = false;
    if (r) onclose();
  }
</script>

<div class="lv">
  <input class="input code" placeholder={t('code')} aria-label={t('code')} bind:value={code} maxlength="12" oninput={() => (code = normCodeUi(code))}>
  <input class="input" placeholder={t('label')} aria-label={t('label')} bind:value={name} maxlength="40">
  {#if o.is_color}
    <label class="cp"><input type="color" bind:value={hex}><span>{t('frame1')}</span></label>
    <label class="cp" class:off={!hex2}><input type="color" value={hex2 || '#ffffff'} oninput={(e) => (hex2 = e.target.value)}><span>{t('color2')}</span></label>
    <label class="cp"><input type="color" bind:value={hex3}><span>{t('color3')}</span></label>
    <Glasses value={val} width={56} />
  {/if}
  <span class="act">
    <button type="button" class="btn sm ghost" onclick={onclose}>{t('cancel')}</button>
    <button type="button" class="btn sm primary" disabled={saving || !code} onclick={save}>{t('create')}</button>
  </span>
  <span class="cap hint">{t('localHint')}</span>
</div>

<style>
  .lv { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; padding: 10px; border-radius: 12px; background: var(--panel); }
  .lv .input { min-height: 36px; font-size: 14px; width: 120px; }
  .code { width: 80px !important; text-transform: uppercase; }
  .cp { display: inline-flex; flex-direction: column; align-items: center; gap: 1px; font-size: 10px; color: var(--muted); position: relative; }
  input[type='color'] { width: 30px; height: 30px; border: 0; padding: 0; background: none; border-radius: 8px; }
  .cp.off input { opacity: 0; }
  .cp.off::before { content: '+'; position: absolute; top: 2px; left: 50%; transform: translateX(-50%); width: 26px; height: 26px; box-sizing: border-box; border: 1.5px dashed var(--edge); border-radius: 6px; display: flex; align-items: center; justify-content: center; color: var(--muted); pointer-events: none; }
  .act { display: flex; gap: 6px; margin-left: auto; }
  .hint { width: 100%; font-size: 12px; }
</style>
