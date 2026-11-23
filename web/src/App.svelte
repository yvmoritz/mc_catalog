<script>
  import { onMount } from 'svelte';
  import { ui, t, init } from './lib/store.svelte.js';
  import Header from './components/Header.svelte';
  import ListView from './components/ListView.svelte';
  import VisualView from './components/VisualView.svelte';
  import ProductView from './components/ProductView.svelte';
  import SuppliersView from './components/SuppliersView.svelte';
  import SettingsView from './components/SettingsView.svelte';
  import ConfirmDialog from './components/ConfirmDialog.svelte';
  import PdfDialog from './components/PdfDialog.svelte';

  onMount(init);
  function onKey(e) { if (e.key === 'Escape' && !ui.dialog && ui.edit) ui.edit = false; }
</script>

<svelte:window onkeydown={onKey} />

<div class="shell">
  <Header />
  <main class="scroll">
    {#if ui.data}
      {#if ui.route.page === 'product'}<ProductView />
      {:else if ui.route.page === 'suppliers'}<SuppliersView />
      {:else if ui.route.page === 'settings'}<SettingsView />
      {:else if ui.view === 'visual'}<VisualView />
      {:else}<ListView />{/if}
    {:else if !ui.loading}
      <p class="cap empty">{t('noProducts')}</p>
    {/if}
  </main>
</div>

{#if ui.dialog?.type === 'confirm'}<ConfirmDialog />{/if}
{#if ui.dialog?.type === 'pdf'}<PdfDialog />{/if}

{#if ui.toast}
  <div class="toast" class:error={ui.toast.kind === 'error'} role={ui.toast.kind === 'error' ? 'alert' : 'status'}>
    {#if ui.toast.kind === 'error'}<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><path d="M12 7v6M12 16.5v.5"></path></svg>{/if}
    {ui.toast.msg}
  </div>
{/if}

<style>
  .shell { height: 100vh; height: 100dvh; display: flex; flex-direction: column; padding: 0 env(safe-area-inset-right) 0 env(safe-area-inset-left); }
  main { flex: 1; min-height: 0; padding-bottom: env(safe-area-inset-bottom); }
  .empty { padding: 48px 28px; }
  .toast {
    position: fixed; left: 50%; bottom: calc(24px + env(safe-area-inset-bottom)); transform: translateX(-50%); z-index: 60;
    max-width: min(560px, calc(100vw - 32px)); padding: 14px 22px; border-radius: 999px; display: flex; align-items: center; gap: 10px;
    background: var(--ink); color: var(--bg); font-size: 14px; font-weight: 500; box-shadow: 0 12px 32px var(--shadow);
  }
  .toast.error { background: var(--info); color: var(--on-info); }
</style>
