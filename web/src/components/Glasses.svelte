<script>
  /** Brille als Platzhalter ohne Foto: Rahmen = Gestell 1, Brauenlinie = Gestell 2, Gläser = Glas */
  let { value, width = 160, label = '' } = $props();
  const f1 = $derived(value?.hex || '#9A918C');
  const f2 = $derived(value?.hex2 || null);
  const lens = $derived(value?.hex3 || '#D9DDE0');
</script>

<svg {width} height={width * 0.42} viewBox="0 0 200 84" role={label ? 'img' : undefined} aria-label={label || undefined} aria-hidden={label ? undefined : 'true'}>
  <g fill={lens} fill-opacity="0.85">
    <path d="M14 26 Q14 16 24 16 H80 Q90 16 90 27 V40 Q90 68 60 68 H44 Q14 68 14 40 Z"></path>
    <path d="M110 27 Q110 16 120 16 H176 Q186 16 186 26 V40 Q186 68 156 68 H140 Q110 68 110 40 Z"></path>
  </g>
  <g fill="none" stroke={f1} stroke-width="7" stroke-linecap="round" stroke-linejoin="round">
    <path d="M14 26 Q14 16 24 16 H80 Q90 16 90 27 V40 Q90 68 60 68 H44 Q14 68 14 40 Z"></path>
    <path d="M110 27 Q110 16 120 16 H176 Q186 16 186 26 V40 Q186 68 156 68 H140 Q110 68 110 40 Z"></path>
    <path d="M90 30 Q100 21 110 30"></path>
  </g>
  {#if f2}<path d="M20 14 H84 M116 14 H180" fill="none" stroke={f2} stroke-width="6" stroke-linecap="round"></path>{/if}
  <path d="M22 26 L34 22" stroke="#fff" stroke-opacity="0.6" stroke-width="3" stroke-linecap="round"></path>
</svg>
