<script>
  import { lab } from '../lib/store.svelte.js';
  /** value: opt_value {hex, hex2, code, labels}; label: Name + Code daneben zeigen (farbfehlsichtig-sicher) */
  let { value, size = 18, label = false, selected = false, onclick = null } = $props();
  const name = $derived(value ? lab(value.labels, value.code) : '');
  const bg = $derived(value?.hex ? (value.hex2 ? `linear-gradient(90deg, ${value.hex} 50%, ${value.hex2} 50%)` : value.hex) : 'transparent');
  const tip = $derived(value ? `${name}${value.code ? ' · ' + value.code : ''}` : '');
</script>

{#if onclick}
  <button type="button" class="sw-wrap" class:sel={selected} aria-pressed={selected} aria-label={tip} title={tip} {onclick}>
    <span class="dot" class:none={!value?.hex} style="width:{size}px;height:{size}px;background:{bg}"></span>
    {#if label}<span class="lb">{name}{#if value?.code}<span class="cd">{value.code}</span>{/if}</span>{/if}
  </button>
{:else}
  <span class="sw-wrap" title={tip}>
    <span class="dot" class:none={!value?.hex} style="width:{size}px;height:{size}px;background:{bg}" role="img" aria-label={tip}></span>
    {#if label}<span class="lb">{name}{#if value?.code}<span class="cd">{value.code}</span>{/if}</span>{/if}
  </span>
{/if}

<style>
  .sw-wrap { display: inline-flex; align-items: center; gap: 7px; border: 0; background: none; padding: 0; color: inherit; font: inherit; min-width: 0; }
  button.sw-wrap { padding: 3px; border-radius: 999px; }
  .dot { border-radius: 50%; flex: none; box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.18), 0 0 0 1px rgba(255, 255, 255, 0.12); }
  .dot.none { border: 1.5px dashed var(--muted); box-shadow: none; }
  /* Auswahl: Ring + Abstand, nicht nur Farbwechsel */
  .sel .dot { outline: 2.5px solid var(--ink); outline-offset: 2px; }
  .lb { font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .cd { margin-left: 6px; font-family: ui-monospace, Menlo, monospace; font-weight: 700; font-size: 12px; color: var(--brand); }
</style>
