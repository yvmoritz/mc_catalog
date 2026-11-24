<script>
  import { lab } from '../lib/store.svelte.js';
  /** value: opt_value {hex = Gestell 1, hex2 = Gestell 2, hex3 = Glas, code, labels}; label: Name + Code daneben (farbfehlsichtig-sicher) */
  let { value, size = 18, label = false, selected = false, onclick = null, chip = false } = $props();
  const name = $derived(value ? lab(value.labels, value.code) : '');
  // oben Gestell (1 | 2 diagonal), unten Glas, getrennt durch eine helle Linie
  const frame = $derived(value?.hex ? (value.hex2 ? `linear-gradient(120deg, ${value.hex} 52%, ${value.hex2} 52%)` : `linear-gradient(${value.hex}, ${value.hex})`) : null);
  const bg = $derived(frame ? (value.hex3 ? `linear-gradient(to bottom, transparent 56%, rgba(255,255,255,.85) 56% 64%, ${value.hex3} 64%), ${frame}` : frame) : 'transparent');
  const tip = $derived(value ? `${name}${value.code ? ' · ' + value.code : ''}` : '');
</script>

{#if onclick}
  <button type="button" class="sw-wrap" class:sel={selected} aria-pressed={selected} aria-label={tip} title={tip} {onclick}>
    <span class="dot" class:chip class:none={!value?.hex} style="width:{chip ? Math.round(size * 1.5) : size}px;height:{size}px;background:{bg}"></span>
    {#if label}<span class="lb">{name}{#if value?.code}<span class="cd">{value.code}</span>{/if}</span>{/if}
  </button>
{:else}
  <span class="sw-wrap" title={tip}>
    <span class="dot" class:chip class:none={!value?.hex} style="width:{chip ? Math.round(size * 1.5) : size}px;height:{size}px;background:{bg}" role="img" aria-label={tip}></span>
    {#if label}<span class="lb">{name}{#if value?.code}<span class="cd">{value.code}</span>{/if}</span>{/if}
  </span>
{/if}

<style>
  .sw-wrap { display: inline-flex; align-items: center; gap: 7px; border: 0; background: none; padding: 0; color: inherit; font: inherit; min-width: 0; }
  button.sw-wrap { padding: 3px; border-radius: 999px; }
  .dot { border-radius: 50%; flex: none; box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.18), 0 0 0 1px rgba(255, 255, 255, 0.12); }
  /* Acetat-Musterplättchen: Rechteck mit Glanzkante */
  .dot.chip { border-radius: 5px; background-clip: padding-box; position: relative; }
  .dot.chip::after { content: ''; position: absolute; inset: 0; border-radius: inherit; background: linear-gradient(160deg, rgba(255, 255, 255, 0.32), rgba(255, 255, 255, 0) 45%); }
  .sel .dot.chip { outline-offset: 2px; border-radius: 5px; }
  .dot { position: relative; display: inline-flex; align-items: center; justify-content: center; }
  .dot.none { border: 1.5px dashed var(--muted); box-shadow: none; }
  /* Auswahl: Ring + Abstand, nicht nur Farbwechsel */
  .sel .dot { outline: 2.5px solid var(--ink); outline-offset: 2px; }
  .lb { font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .cd { margin-left: 6px; font-weight: 650; letter-spacing: 0.045em; font-size: 12px; color: var(--brand); }
</style>
