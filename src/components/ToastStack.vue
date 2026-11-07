<script setup lang="ts">
import { app, type Toast } from '@/stores/app'
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-vue-next'

const icons = { success: CheckCircle2, error: AlertTriangle, info: Info } as const

function remove(toast: Toast) {
  const index = app.toasts.indexOf(toast)
  if (index >= 0) app.toasts.splice(index, 1)
}
</script>

<template>
  <div class="toast-stack" aria-live="polite">
    <TransitionGroup name="toast">
      <div v-for="item in app.toasts" :key="item.id" class="toast" :class="item.kind">
        <component :is="icons[item.kind]" :size="15" class="toast-icon" />
        <span class="toast-text">{{ item.message }}</span>
        <button class="toast-close" aria-label="关闭" @click="remove(item)">
          <X :size="13" />
        </button>
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.toast-stack {
  position: fixed;
  right: 20px;
  bottom: 20px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  z-index: 90;
  pointer-events: none;
}

.toast {
  display: flex;
  align-items: center;
  gap: 9px;
  max-width: 380px;
  padding: 10px 12px;
  border-radius: 10px;
  background: #fff;
  border: 1px solid var(--line);
  box-shadow: var(--shadow);
  font-size: 12.5px;
  pointer-events: auto;
  animation: toast-in 0.18s ease;
}

.toast-icon {
  flex: none;
}

.toast.success .toast-icon {
  color: var(--green);
}

.toast.error .toast-icon {
  color: var(--red);
}

.toast.info .toast-icon {
  color: var(--accent);
}

.toast-text {
  flex: 1;
  color: var(--ink-2);
  word-break: break-word;
}

.toast-close {
  flex: none;
  color: var(--ink-3);
  display: inline-flex;
  padding: 2px;
  border-radius: 4px;
}

.toast-close:hover {
  background: var(--panel-3);
  color: var(--ink);
}

.toast-enter-active,
.toast-leave-active {
  transition: opacity 0.16s ease, transform 0.16s ease;
}

.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateY(6px);
}

@keyframes toast-in {
  from {
    opacity: 0;
    transform: translateY(6px);
  }
}
</style>
