<script>
  import { ui, t, setPref, openTenant, go, api, mutate, toast, loadTenants } from '../lib/store.svelte.js';
  import { LANGS } from '../lib/i18n.js';

  let open = $state(null); // 'tenant' | 'menu'
  const tn = $derived(ui.data?.tenant);
  const logo = $derived(tn ? (ui.theme === 'dark' ? tn.logo_dark || tn.logo : tn.logo || tn.logo_dark) : null);
  const page = $derived(ui.route.page);
  const onProducts = $derived(page === 'products');
  const toggle = (k) => (open = open === k ? null : k);
  function onDocClick(e) { if (open && !e.target.closest('.pop')) open = null; }
  function onKey(e) {
    if (e.key === 'Escape' && open) { open = null; e.stopPropagation(); return; }
    // Kürzel: e = Bearbeiten, v = Liste/Visuell, n = neues Produkt
    if (e.metaKey || e.ctrlKey || e.altKey || ui.dialog || /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName)) return;
    if (!onProducts) return;
    if (e.key === 'v') setPref('view', ui.view === 'list' ? 'visual' : 'list');
    else if (e.key === 'e') { if (ui.view !== 'visual') setPref('view', 'visual'); ui.edit = !ui.edit; }
    else if (e.key === 'n') newProduct();
  }
  async function pick(id) { open = null; await openTenant(id); go('products'); }
  async function newTenant() {
    open = null;
    const name = prompt(t('newTenant'));
    if (!name) return;
    try {
      const x = await api.post('/tenants', { name });
      await loadTenants();
      await openTenant(x.id);
      go('settings');
    } catch (e) { toast(e.message, 'error'); }
  }
  async function newProduct() {
    const p = await mutate(() => api.post(`/tenants/${ui.tenantId}/products`, { category_id: ui.filter.category || undefined, supplier_id: ui.filter.supplier || undefined }));
    if (p) go('product', p.id);
  }
  const nav = $derived([['products', t('products')], ['suppliers', t('suppliers')], ['settings', t('settings')]]);
</script>

<svelte:document onclick={onDocClick} onkeydown={onKey} />

<header>
  <div class="pop">
    <button type="button" class="tbtn" aria-haspopup="menu" aria-expanded={open === 'tenant'} onclick={() => toggle('tenant')}>
      {#if logo}
        <img class="limg" src={logo} alt={tn.name}>
        <span class="sr">{t('tenant')}: {tn.name}</span>
      {:else}
        <span class="logo" aria-hidden="true">{tn?.short || '·'}</span>
        <span class="tt"><span class="cap sm">{t('tenant')}</span><span class="tnm">{tn?.name ?? '—'}</span></span>
      {/if}
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 9l6 6 6-6"></path></svg>
    </button>
    {#if open === 'tenant'}
      <div class="menu" role="menu">
        {#each ui.tenants as x (x.id)}
          <button type="button" role="menuitemradio" aria-checked={x.id === ui.tenantId} class:on={x.id === ui.tenantId} onclick={() => pick(x.id)}>
            <span>{x.name}</span><span class="cap">{x.product_count}</span>
          </button>
        {/each}
        {#if ui.isAdmin}<hr><button type="button" role="menuitem" onclick={newTenant}>{t('newTenant')}</button>{/if}
      </div>
    {/if}
  </div>

  <nav class="pillset" aria-label={t('app')}>
    {#each nav as [k, label] (k)}
      <a class="pz" class:on={page === k || (k === 'products' && page === 'product')} href="#/{k}" aria-current={page === k ? 'page' : undefined}>{label}</a>
    {/each}
  </nav>

  <div class="sp"></div>

  {#if onProducts}
    <div class="pillset vt" role="group" aria-label={t('visual')}>
      <button type="button" class="pz" class:on={ui.view === 'list'} aria-pressed={ui.view === 'list'} onclick={() => setPref('view', 'list')}>{t('list')}</button>
      <button type="button" class="pz" class:on={ui.view === 'visual'} aria-pressed={ui.view === 'visual'} onclick={() => setPref('view', 'visual')}>{t('visual')}</button>
    </div>
    {#if ui.view === 'visual'}
      <button type="button" role="switch" aria-checked={ui.edit} class="sw edsw" class:on={ui.edit} title="{t('edit')} (E)" onclick={() => (ui.edit = !ui.edit)}>
        <span class="tr"><span class="kn"></span></span>{t('edit')}
      </button>
    {/if}
    <button type="button" class="btn pdfb" title={t('pdf')} onclick={() => (ui.dialog = { type: 'pdf' })}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><path d="M14 3v6h6M12 12v6M9 15l3 3 3-3"></path></svg>
      <span class="lbl">{t('pdf')}</span>
    </button>
    <button type="button" class="btn primary newb" title="{t('newProduct')} (N)" onclick={newProduct}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"></path></svg>
      <span class="lbl">{t('newProduct')}</span>
    </button>
  {/if}

  <div class="pop">
    <button type="button" class="ico" aria-label={t('settings')} title={t('settings')} aria-haspopup="menu" aria-expanded={open === 'menu'} onclick={() => toggle('menu')}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M4 7h10M18 7h2M4 17h4M12 17h8"></path><circle cx="16" cy="7" r="2"></circle><circle cx="10" cy="17" r="2"></circle></svg>
    </button>
    {#if open === 'menu'}
      <div class="menu right" role="menu">
        <span class="cap grp">{t('lang')}</span>
        <div class="pillset">
          {#each LANGS as l (l)}
            <button type="button" class="pz" class:on={ui.lang === l} aria-pressed={ui.lang === l} onclick={() => setPref('lang', l)}>{l.toUpperCase()}</button>
          {/each}
        </div>
        <span class="cap grp">{t('theme')}</span>
        <div class="pillset">
          <button type="button" class="pz" class:on={ui.theme !== 'dark'} aria-pressed={ui.theme !== 'dark'} onclick={() => setPref('theme', 'light')}>{t('day')}</button>
          <button type="button" class="pz" class:on={ui.theme === 'dark'} aria-pressed={ui.theme === 'dark'} onclick={() => setPref('theme', 'dark')}>{t('night')}</button>
        </div>
        {#if ui.me}<span class="cap grp">{t('signedIn')}: {ui.me}{ui.isAdmin ? ' · ' + t('admin') : ''}</span>{/if}
      </div>
    {/if}
  </div>
</header>

<style>
  header {
    display: flex; flex-wrap: wrap; align-items: center; gap: 12px; padding: calc(10px + env(safe-area-inset-top)) 16px 10px;
    background: var(--surface); border-bottom: 1px solid var(--line); position: relative; z-index: 20;
  }
  .sp { flex: 1 1 0; }
  .pop { position: relative; }
  .tbtn { display: flex; align-items: center; gap: 10px; border: 0; background: transparent; padding: 4px 8px 4px 4px; border-radius: 14px; text-align: left; }
  .tbtn:hover { background: var(--pill); }
  .logo { width: 40px; height: 40px; border-radius: 10px; background: var(--brand); color: var(--sand); display: flex; align-items: center; justify-content: center; font-weight: 600; font-size: 15px; letter-spacing: 0.04em; }
  :global(.dark) .logo { color: var(--on-brand); }
  .limg { height: 40px; width: auto; max-width: 140px; object-fit: contain; display: block; }
  .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
  .tt { display: flex; flex-direction: column; line-height: 1.2; }
  .sm { font-size: 12px; }
  .tnm { font-size: 16px; font-weight: 600; }
  a.pz { display: inline-flex; align-items: center; text-decoration: none; }
  .menu {
    position: absolute; top: calc(100% + 6px); left: 0; min-width: 240px; padding: 8px; border-radius: 16px; background: var(--surface);
    box-shadow: 0 16px 48px var(--shadow), 0 0 0 1px var(--line); display: flex; flex-direction: column; gap: 4px; z-index: 30;
  }
  .menu.right { left: auto; right: 0; }
  .menu > button { display: flex; justify-content: space-between; gap: 12px; height: 42px; padding: 0 12px; border: 0; border-radius: 10px; background: transparent; text-align: left; font-size: 15px; }
  .menu > button:hover, .menu > button.on { background: var(--pill); }
  .menu > button.on { font-weight: 600; }
  .menu hr { border: 0; border-top: 1px solid var(--line); margin: 4px 0; width: 100%; }
  .grp { padding: 8px 6px 2px; }
  .btn { display: inline-flex; align-items: center; gap: 8px; }
  .sw { display: inline-flex; align-items: center; gap: 10px; height: 44px; padding: 0 16px 0 8px; border: 0; border-radius: 999px; background: var(--pill); font-size: 14px; font-weight: 500; }
  .tr { width: 40px; height: 24px; border-radius: 999px; background: var(--hover); position: relative; transition: background 0.15s; }
  .kn { position: absolute; left: 3px; top: 3px; width: 18px; height: 18px; border-radius: 50%; background: var(--surface); transition: left 0.15s; }
  /* An: Knopf rechts + Häkchen-Form, nicht nur Farbe */
  .sw.on { background: var(--brand); color: var(--on-brand); font-weight: 600; }
  .sw.on .tr { background: var(--sand); }
  .sw.on .kn { left: 19px; background: var(--brand); }
  @media (max-width: 760px) {
    header { gap: 8px; }
    .lbl { display: none; }
    .btn { padding: 0 14px; }
    .pop:first-child { order: 1; margin-right: auto; }
    .sp { display: none; }
    .pdfb { order: 3; } .newb { order: 4; } .pop:last-child { order: 5; }
    nav { order: 10; flex: 1 1 auto; }
    nav .pz { flex: 1; justify-content: center; padding: 0 10px; }
    .vt { order: 11; }
    .edsw { order: 12; }
    .edsw, .vt .pz { font-size: 13px; }
  }
  @media (max-width: 480px) { nav { flex-basis: 100%; } .vt { flex: 1; } .vt .pz { flex: 1; justify-content: center; } .edsw { padding: 0 12px 0 6px; } }
</style>
