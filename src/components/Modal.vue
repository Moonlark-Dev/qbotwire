<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue'

withDefaults(defineProps<{ width?: string; persistent?: boolean }>(), {
  width: '640px',
  persistent: false,
})

const emit = defineEmits<{ close: [] }>()

function onKey(event: KeyboardEvent) {
  if (event.key === 'Escape') emit('close')
}

onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <Teleport to="body">
    <div class="modal-backdrop" @mousedown.self="!persistent && emit('close')">
      <section class="modal" :style="{ width }" role="dialog" aria-modal="true">
        <header class="modal-head">
          <div class="modal-title"><slot name="header" /></div>
          <button class="close" aria-label="关闭" @click="emit('close')">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </header>
        <div class="modal-body"><slot /></div>
        <footer v-if="$slots.footer" class="modal-foot"><slot name="footer" /></footer>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.38);
  backdrop-filter: blur(3px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32px;
  z-index: 60;
  animation: fadeIn 0.15s ease;
}

.modal {
  max-width: calc(100vw - 48px);
  max-height: calc(100vh - 64px);
  display: flex;
  flex-direction: column;
  background: var(--panel);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  border: 1px solid var(--line);
  animation: pop-in 0.18s ease;
  overflow: hidden;
}

.modal-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 18px 22px 14px;
  border-bottom: 1px solid var(--line);
}

.modal-title {
  min-width: 0;
  font-size: 15px;
  font-weight: 650;
}

.close {
  width: 30px;
  height: 30px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  color: var(--ink-3);
}

.close:hover {
  background: var(--panel-3);
  color: var(--ink);
}

.modal-body {
  padding: 18px 22px;
  overflow: auto;
  min-height: 0;
}

.modal-foot {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  padding: 14px 22px;
  border-top: 1px solid var(--line);
  background: var(--panel-2);
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }
}
</style>
