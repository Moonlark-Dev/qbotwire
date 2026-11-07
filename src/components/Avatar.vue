<script setup lang="ts">
import { computed, ref, watch } from 'vue'

const props = withDefaults(
  defineProps<{
    name?: string | null
    src?: string | null
    size?: number
    kind?: 'user' | 'group' | 'bot'
    square?: boolean
  }>(),
  { name: '', src: null, size: 36, kind: 'user', square: false },
)

const broken = ref(false)

watch(
  () => props.src,
  () => {
    broken.value = false
  },
)

const palette = ['#4f7cff', '#17a673', '#e08b2d', '#ba5cff', '#e35d6a', '#0f9bb5']

const initial = computed(() => {
  const name = props.name?.trim()
  if (name) return name.slice(0, 1).toUpperCase()
  return props.kind === 'group' ? '#' : props.kind === 'bot' ? 'B' : 'U'
})

const color = computed(() => {
  const seed = props.name || props.src || props.kind
  let hash = 0
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0
  return palette[hash % palette.length]
})

const radius = computed(() => (props.square || props.kind === 'group' ? Math.round(props.size * 0.28) : 999))

const style = computed(() => ({
  width: `${props.size}px`,
  height: `${props.size}px`,
  borderRadius: `${radius.value}px`,
  fontSize: `${Math.max(11, Math.round(props.size * 0.4))}px`,
  background:
    broken.value || !props.src
      ? props.kind === 'bot'
        ? 'linear-gradient(135deg, #3d7bff, #1b47c7)'
        : color.value
      : 'transparent',
}))

const showImage = computed(() => Boolean(props.src) && !broken.value)
</script>

<template>
  <span class="avatar" :style="style" :title="name || undefined">
    <img v-if="showImage" :src="src ?? ''" alt="" @error="broken = true" />
    <span v-else class="initial">{{ initial }}</span>
  </span>
</template>

<style scoped>
.avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  overflow: hidden;
  color: #fff;
  font-weight: 650;
  letter-spacing: 0.01em;
  user-select: none;
}

.avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
</style>
