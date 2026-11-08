<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { app, findGroup, findUser } from '@/stores/app'
import type { IdKind } from '@/lib/apiCatalog'
import { resolveUserAvatar } from '@/lib/avatar'
import Avatar from './Avatar.vue'
import { ChevronDown, Search } from 'lucide-vue-next'

const props = withDefaults(
  defineProps<{
    modelValue: string
    kind?: IdKind
    placeholder?: string
    disabled?: boolean
  }>(),
  { kind: 'generic', placeholder: '输入 ID 或从缓存选择', disabled: false },
)

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const open = ref(false)
const query = ref('')
const root = ref<HTMLElement | null>(null)
const input = ref<HTMLInputElement | null>(null)

const candidates = computed(() => {
  if (props.kind === 'group') {
    return app.cache.groups.map((group) => ({
      openid: group.openid,
      name: group.name || findGroup(group.openid)?.name || '未命名群聊',
      avatar: group.avatar,
      kind: 'group' as const,
    }))
  }
  if (props.kind === 'user') {
    return app.cache.users.map((user) => ({
      openid: user.openid,
      name: user.name || '未命名用户',
      avatar: resolveUserAvatar(app.credentials?.appId, user),
      kind: 'user' as const,
    }))
  }
  return []
})

const filtered = computed(() => {
  const needle = query.value.trim().toLowerCase()
  const list = needle
    ? candidates.value.filter(
        (item) =>
          item.openid.toLowerCase().includes(needle) ||
          item.name.toLowerCase().includes(needle),
      )
    : candidates.value
  return list.slice(0, 30)
})

const currentName = computed(() => {
  if (!props.modelValue) return ''
  if (props.kind === 'group') return findGroup(props.modelValue)?.name ?? ''
  if (props.kind === 'user') {
    const user = findUser(props.modelValue)
    return user?.name ?? ''
  }
  return ''
})

function toggle() {
  if (props.disabled) return
  open.value = !open.value
  if (open.value) {
    query.value = ''
    void nextTick(() => input.value?.focus())
  }
}

function choose(openid: string) {
  emit('update:modelValue', openid)
  open.value = false
}

function onInput(event: Event) {
  const value = (event.target as HTMLInputElement).value
  emit('update:modelValue', value)
  query.value = value
  open.value = true
}

function closeOnOutside(event: MouseEvent) {
  if (!root.value?.contains(event.target as Node)) open.value = false
}

onMounted(() => document.addEventListener('mousedown', closeOnOutside))
onBeforeUnmount(() => document.removeEventListener('mousedown', closeOnOutside))
</script>

<template>
  <div ref="root" class="id-picker" :class="{ open }">
    <div class="input-wrap">
      <input
        class="input mono"
        :value="modelValue"
        :placeholder="placeholder"
        :disabled="disabled"
        spellcheck="false"
        @input="onInput"
        @focus="open = true"
      />
      <span v-if="currentName" class="resolved" :class="{ long: modelValue.length > 18 }">{{ currentName }}</span>
      <button
        v-if="candidates.length"
        class="picker-toggle"
        type="button"
        :title="`从缓存选择（${candidates.length} 条）`"
        :disabled="disabled"
        @mousedown.prevent
        @click="toggle"
      >
        <ChevronDown :size="14" :class="{ 'chevron-up': open }" />
      </button>
    </div>
    <Transition name="drop">
      <div v-if="open && candidates.length" class="dropdown">
        <div class="search-row">
          <Search :size="13" class="search-icon" />
          <input
            ref="input"
            v-model="query"
            class="search-input"
            type="text"
            placeholder="搜索缓存中的名称或 OpenID"
            spellcheck="false"
          />
        </div>
        <div class="options">
          <button
            v-for="item in filtered"
            :key="item.openid"
            type="button"
            class="option"
            @click="choose(item.openid)"
          >
            <Avatar :name="item.name" :src="item.avatar" :kind="item.kind" :size="26" />
            <span class="option-name">{{ item.name }}</span>
            <span class="option-id mono">{{ item.openid }}</span>
          </button>
          <div v-if="!filtered.length" class="empty">没有匹配的缓存记录</div>
        </div>
        <div class="hint">也可以直接在输入框手动填写</div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.id-picker {
  position: relative;
  min-width: 0;
}

.input-wrap {
  position: relative;
  display: flex;
  align-items: center;
}

.input-wrap .input {
  padding-right: 30px;
  height: 34px;
}

.resolved.long {
  display: none;
}

.resolved {
  position: absolute;
  right: 34px;
  max-width: 38%;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  font-size: 11px;
  color: var(--ink-3);
  pointer-events: none;
}

.picker-toggle {
  position: absolute;
  right: 3px;
  width: 26px;
  height: 26px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--ink-3);
  border-radius: 6px;
}

.picker-toggle:hover {
  background: var(--panel-3);
  color: var(--ink);
}

.chevron-up {
  transform: rotate(180deg);
}

.dropdown {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  right: 0;
  min-width: 300px;
  max-width: 420px;
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 10px;
  box-shadow: var(--shadow);
  z-index: 30;
  overflow: hidden;
}

.search-row {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 8px 10px;
  border-bottom: 1px solid var(--line);
  color: var(--ink-3);
}

.search-input {
  flex: 1;
  border: none;
  outline: none;
  font-size: 12px;
  background: transparent;
  color: var(--ink);
}

.options {
  max-height: 264px;
  overflow: auto;
  padding: 4px;
}

.option {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 7px;
  border-radius: 7px;
  text-align: left;
}

.option:hover {
  background: var(--accent-soft);
}

.option-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12.5px;
}

.option-id {
  font-size: 10.5px;
  color: var(--ink-3);
  max-width: 45%;
  overflow: hidden;
  text-overflow: ellipsis;
}

.empty {
  padding: 12px;
  text-align: center;
  color: var(--ink-3);
  font-size: 12px;
}

.hint {
  padding: 6px 10px;
  border-top: 1px solid var(--line);
  font-size: 10.5px;
  color: var(--ink-3);
  background: var(--panel-2);
}

.drop-enter-active,
.drop-leave-active {
  transition: opacity 0.12s ease, transform 0.12s ease;
}

.drop-enter-from,
.drop-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
