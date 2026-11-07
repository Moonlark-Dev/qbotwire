<script setup lang="ts">
import { computed } from 'vue'
import type { ConnectionStatus } from '@/types'

const props = defineProps<{ status: ConnectionStatus; compact?: boolean }>()

const labels: Record<ConnectionStatus['state'], string> = {
  connected: '已连接',
  connecting: '连接中',
  reconnecting: '重连中',
  disconnected: '未连接',
  error: '连接失败',
}

const label = computed(() => labels[props.status.state])
</script>

<template>
  <span
    class="status-pill"
    :class="status.state"
    :title="status.error || status.gatewayUrl || undefined"
  >
    <span class="dot" />
    <span v-if="!compact">{{ label }}</span>
  </span>
</template>

<style scoped>
.status-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 26px;
  padding: 0 9px;
  border-radius: 999px;
  font-size: 11.5px;
  font-weight: 600;
  border: 1px solid var(--line);
  background: var(--panel-2);
  color: var(--ink-3);
  white-space: nowrap;
}

.dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #a8b3c4;
  flex: none;
}

.status-pill.connected {
  color: #157347;
  background: var(--green-soft);
  border-color: #bfead1;
}

.status-pill.connected .dot {
  background: var(--green);
  box-shadow: 0 0 0 3px rgba(22, 163, 74, 0.12);
}

.status-pill.connecting,
.status-pill.reconnecting {
  color: #9a5b00;
  background: var(--amber-soft);
  border-color: #f1d9a8;
}

.status-pill.connecting .dot,
.status-pill.reconnecting .dot {
  background: var(--amber);
  animation: pulse 1.2s ease-in-out infinite;
}

.status-pill.error {
  color: #b42318;
  background: var(--red-soft);
  border-color: #f2c9c9;
}

.status-pill.error .dot {
  background: var(--red);
}

@keyframes pulse {
  50% {
    opacity: 0.35;
  }
}
</style>
