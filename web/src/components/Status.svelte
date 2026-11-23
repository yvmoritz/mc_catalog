<script>
  import { t } from '../lib/store.svelte.js';
  let { value } = $props();
</script>
<span class="stb {value}">{t('st.' + value)}</span>
