<script setup lang="ts">
withDefaults(defineProps<{ size?: number; glow?: boolean }>(), { size: 36, glow: false })
</script>

<template>
  <svg
    class="brand-mark"
    :class="{ glow }"
    :width="size"
    :height="size"
    viewBox="0 0 48 48"
    fill="none"
    aria-hidden="true"
  >
    <defs>
      <linearGradient id="qbotwire-mark" x1="4" y1="2" x2="44" y2="46" gradientUnits="userSpaceOnUse">
        <stop stop-color="#3D7BFF" />
        <stop offset="1" stop-color="#1B47C7" />
      </linearGradient>
    </defs>
    <rect x="1" y="1" width="46" height="46" rx="13" fill="url(#qbotwire-mark)" />
    <rect x="1" y="1" width="46" height="46" rx="13" stroke="rgba(255,255,255,0.2)" />
    <circle cx="23" cy="23" r="10.5" stroke="#fff" stroke-width="3.4" fill="none" />
    <path d="M30.5 30.5 36.5 36.5" stroke="#fff" stroke-width="3.4" stroke-linecap="round" />
    <circle cx="23" cy="23" r="3" fill="#7EE7C7" />
    <circle cx="11.5" cy="11.5" r="1.7" fill="#fff" fill-opacity="0.55" />
    <circle cx="37" cy="13" r="1.5" fill="#fff" fill-opacity="0.35" />
  </svg>
</template>

<style scoped>
.brand-mark {
  flex: none;
  display: block;
  filter: drop-shadow(0 2px 6px rgba(20, 52, 140, 0.28));
}

.brand-mark.glow {
  filter: drop-shadow(0 8px 26px rgba(28, 74, 200, 0.45));
}
</style>
