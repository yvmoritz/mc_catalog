<script>
  import { onMount } from 'svelte';
  import { ui, t } from '../lib/store.svelte.js';
  const { title, text, onYes, yes } = ui.dialog;
  let dlg;
  onMount(() => dlg.showModal());
  const close = () => { dlg.close(); };
  async function ok() { close(); await onYes(); }
</script>

<dialog class="sheet" bind:this={dlg} onclose={() => { if (ui.dialog?.type === 'confirm') ui.dialog = null; }} aria-labelledby="cd-title">
  <div class="sheet-body">
    <h2 id="cd-title">{title || t('confirmDel')}</h2>
    {#if text}<p>{text}</p>{/if}
    <div class="sheet-actions">
      <button type="button" class="btn ghost" onclick={close}>{t('cancel')}</button>
      <button type="button" class="btn primary" onclick={ok}>{yes || t('delete')}</button>
    </div>
  </div>
</dialog>

<style> p { margin: 0; font-size: 15px; line-height: 1.5; } </style>
