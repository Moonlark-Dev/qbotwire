<script setup lang="ts">
import { computed, ref } from 'vue'
import type { GatewayEvent } from '@/types'
import { formatEvent, eventCategory, prettyJson, type EventEntity, type EventLookup } from '@/lib/events'
import { formatDateTime } from '@/lib/format'
import { app, findGroup, findUser } from '@/stores/app'
import Modal from './Modal.vue'
import JsonView from './JsonView.vue'
import Avatar from './Avatar.vue'
import { Check, Copy } from 'lucide-vue-next'

const props = defineProps<{ event: GatewayEvent }>()
const emit = defineEmits<{ close: [] }>()

const tab = ref<'formatted' | 'raw'>('formatted')
const copied = ref(false)

const lookup = computed<EventLookup>(() => ({
  appId: app.credentials?.appId,
  user: findUser,
  group: findGroup,
}))

const view = computed(() => formatEvent(props.event, lookup.value))

/** Hover text for an author / group / mention badge. */
function entityTitle(entity: EventEntity): string {
  const parts = [entity.openid]
  if (entity.unionOpenid) parts.push(`Union ${entity.unionOpenid}`)
  if (entity.fromCache) parts.push('本地缓存')
  return parts.join(' · ')
}

const raw = computed(() => prettyJson(props.event.data))
const full = computed(() =>
  prettyJson({
    id: props.event.id,
    seq: props.event.seq,
    type: props.event.type,
    receivedAt: props.event.receivedAt,
    d: props.event.data,
  }),
)
const category = computed(() => eventCategory(props.event.type))

async function copy(kind: 'data' | 'full') {
  try {
    await navigator.clipboard.writeText(kind === 'data' ? raw.value : full.value)
    copied.value = true
    window.setTimeout(() => (copied.value = false), 1400)
  } catch {
    /* ignore */
  }
}
</script>

<template>
  <Modal width="780px" @close="emit('close')">
    <template #header>
      <div class="detail-head">
        <span class="event-type" :class="category">{{ event.type }}</span>
        <span class="detail-title">{{ view.title }}</span>
        <span class="detail-time mono">{{ formatDateTime(event.receivedAt) }}</span>
      </div>
    </template>

    <div class="detail-tabs">
      <button
        type="button"
        class="detail-tab"
        :class="{ active: tab === 'formatted' }"
        @click="tab = 'formatted'"
      >
        格式化
      </button>
      <button
        type="button"
        class="detail-tab"
        :class="{ active: tab === 'raw' }"
        @click="tab = 'raw'"
      >
        原始报文 JSON
      </button>
      <span class="meta mono">
        id {{ event.id }} · seq {{ event.seq ?? '—' }}
      </span>
    </div>

    <div v-if="tab === 'formatted'" class="formatted">
      <p v-if="view.content" class="content">{{ view.content }}</p>
      <p v-else class="content muted">{{ view.subtitle || '（无文本内容）' }}</p>

      <dl class="fields">
        <template v-for="field in view.fields" :key="field.label">
          <dt>{{ field.label }}</dt>
          <dd :class="{ mono: field.mono }">
            <span class="field-value">{{ field.value }}</span>
            <span
              v-if="field.entity && field.entity.name"
              class="chip"
              :title="entityTitle(field.entity)"
            >
              <Avatar
                :name="field.entity.name"
                :src="field.entity.avatar"
                :kind="field.entity.kind"
                :size="14"
              />
              <span class="chip-name">{{ field.entity.name }}</span>
            </span>
            <span
              v-for="(entity, index) in field.entities ?? []"
              :key="`${entity.openid}-${index}`"
              class="chip"
              :title="entityTitle(entity)"
            >
              <Avatar :name="entity.name" :src="entity.avatar" :kind="entity.kind" :size="14" />
              <span class="chip-name">{{ entity.name }}</span>
            </span>
          </dd>
        </template>
      </dl>
    </div>

    <div v-else class="raw-pane">
      <div class="raw-actions">
        <span class="mono raw-label">d (dispatch data)</span>
        <div class="raw-buttons">
          <button class="mini" type="button" @click="copy('data')">
            <component :is="copied ? Check : Copy" :size="11" />
            {{ copied ? '已复制' : '复制 data' }}
          </button>
          <button class="mini" type="button" @click="copy('full')">
            <Copy :size="11" /> 复制完整事件
          </button>
        </div>
      </div>
      <div class="json-wrap">
        <JsonView :value="event.data" />
      </div>
    </div>

    <template #footer>
      <button class="btn" type="button" @click="emit('close')">关闭</button>
    </template>
  </Modal>
</template>

<style scoped>
.detail-head {
  display: flex;
  align-items: center;
  gap: 9px;
  min-width: 0;
}

.event-type {
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 600;
  padding: 2px 6px;
  border-radius: 5px;
  color: var(--ink-2);
  background: var(--panel-3);
  flex: none;
}

.event-type.message {
  color: #1d4ed8;
  background: #eaf1ff;
}
.event-type.guild {
  color: #6d28d9;
  background: #f2ecff;
}
.event-type.member {
  color: #157347;
  background: #e9f9ef;
}
.event-type.lifecycle {
  color: #9a5b00;
  background: #fff4e0;
}
.event-type.interaction {
  color: #be185d;
  background: #fdeef5;
}

.detail-title {
  font-size: 14px;
  font-weight: 650;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.detail-time {
  margin-left: auto;
  font-size: 10px;
  color: var(--ink-3);
  flex: none;
}

.detail-tabs {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-bottom: 14px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--line);
}

.detail-tab {
  height: 26px;
  padding: 0 9px;
  border-radius: 6px;
  font-size: 11.5px;
  color: var(--ink-3);
}

.detail-tab:hover {
  background: var(--panel-3);
  color: var(--ink-2);
}

.detail-tab.active {
  background: var(--accent-soft);
  color: var(--accent-2);
  font-weight: 600;
}

.meta {
  margin-left: auto;
  font-size: 9px;
  color: #b3bccb;
}

.content {
  margin: 0 0 16px;
  padding: 11px 13px;
  border-radius: 9px;
  background: var(--panel-2);
  border: 1px solid var(--line);
  font-size: 13px;
  line-height: 1.75;
  color: var(--ink);
  white-space: pre-wrap;
  word-break: break-word;
}

.content.muted {
  color: var(--ink-3);
}

.chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 22px;
  max-width: 260px;
  padding: 0 8px 0 3px;
  border-radius: 999px;
  border: 1px solid var(--line);
  background: #fff;
  color: var(--ink-2);
  font-family: var(--font-sans);
  font-size: 10.5px;
}

.chip-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.fields {
  display: grid;
  grid-template-columns: 112px minmax(0, 1fr);
  gap: 8px 12px;
  margin: 0;
  font-size: 11.5px;
}

.fields dt {
  color: var(--ink-3);
}

.fields dd {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 7px;
  margin: 0;
  color: var(--ink-2);
  word-break: break-all;
}

.field-value {
  word-break: break-all;
}

.raw-pane {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.raw-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.raw-label {
  font-size: 10px;
  color: var(--ink-3);
}

.raw-buttons {
  display: flex;
  gap: 6px;
}

.mini {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 24px;
  padding: 0 7px;
  border-radius: 5px;
  border: 1px solid var(--line);
  background: #fff;
  color: var(--ink-2);
  font-size: 10px;
}

.mini:hover {
  background: var(--panel-2);
}

.json-wrap {
  margin: 0;
  padding: 12px 14px;
  border-radius: 10px;
  background: #0f172a;
  max-height: 56vh;
  overflow: auto;
}
</style>
