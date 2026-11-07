<script setup lang="ts">
import { computed } from 'vue'
import { highlightJson } from '@/lib/jsonHighlight'

const props = withDefaults(
  defineProps<{
    value: unknown
    /** Render as compact JSON (useful for inline previews). */
    compact?: boolean
  }>(),
  { compact: false },
)

const html = computed(() => {
  if (props.compact) {
    return highlightJson(JSON.stringify(props.value))
  }
  return highlightJson(props.value)
})
</script>

<template>
  <pre class="json-view" v-html="html" />
</template>
