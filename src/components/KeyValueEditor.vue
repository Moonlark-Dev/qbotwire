<script setup lang="ts">
import type { QueryParam } from '@/types'
import { Plus, X } from 'lucide-vue-next'

const props = withDefaults(
  defineProps<{
    modelValue: QueryParam[]
    keyPlaceholder?: string
    valuePlaceholder?: string
    addLabel?: string
  }>(),
  {
    keyPlaceholder: '参数名',
    valuePlaceholder: '参数值',
    addLabel: '添加参数',
  },
)

const emit = defineEmits<{ 'update:modelValue': [rows: QueryParam[]] }>()

function clone(): QueryParam[] {
  return props.modelValue.map((row) => ({ ...row }))
}

function update(index: number, patch: Partial<QueryParam>) {
  const rows = clone()
  rows[index] = { ...rows[index], ...patch }
  emit('update:modelValue', rows)
}

function remove(index: number) {
  const rows = clone()
  rows.splice(index, 1)
  emit('update:modelValue', rows)
}

function add() {
  emit('update:modelValue', [...clone(), { key: '', value: '', enabled: true }])
}
</script>

<template>
  <div class="kv-editor">
    <div v-for="(row, index) in modelValue" :key="index" class="kv-row">
      <label class="toggle" :title="row.enabled ? '停用该参数' : '启用该参数'">
        <input
          type="checkbox"
          :checked="row.enabled"
          @change="update(index, { enabled: ($event.target as HTMLInputElement).checked })"
        />
        <span class="box" />
      </label>
      <input
        class="input mono key-input"
        :value="row.key"
        :placeholder="keyPlaceholder"
        spellcheck="false"
        @input="update(index, { key: ($event.target as HTMLInputElement).value })"
      />
      <input
        class="input mono value-input"
        :value="row.value"
        :placeholder="valuePlaceholder"
        spellcheck="false"
        @input="update(index, { value: ($event.target as HTMLInputElement).value })"
      />
      <button class="remove" type="button" title="删除参数" @click="remove(index)">
        <X :size="13" />
      </button>
    </div>
    <button v-if="modelValue.length < 20" type="button" class="add-row" @click="add">
      <Plus :size="13" />
      {{ addLabel }}
    </button>
  </div>
</template>

<style scoped>
.kv-editor {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.kv-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.key-input {
  flex: 0 0 34%;
}

.value-input {
  flex: 1;
}

.toggle {
  display: inline-flex;
  flex: none;
  cursor: pointer;
}

.toggle input {
  position: absolute;
  opacity: 0;
  width: 0;
  height: 0;
}

.box {
  width: 15px;
  height: 15px;
  border-radius: 4px;
  border: 1px solid var(--line-strong);
  background: #fff;
  display: inline-block;
  position: relative;
  transition: background 0.12s ease, border-color 0.12s ease;
}

.toggle input:checked + .box {
  background: var(--accent);
  border-color: var(--accent);
}

.toggle input:checked + .box::after {
  content: '';
  position: absolute;
  left: 4px;
  top: 1px;
  width: 4px;
  height: 8px;
  border: solid #fff;
  border-width: 0 2px 2px 0;
  transform: rotate(42deg);
}

.remove {
  width: 28px;
  height: 28px;
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--ink-3);
  border-radius: 6px;
}

.remove:hover {
  background: var(--red-soft);
  color: var(--red);
}

.add-row {
  align-self: flex-start;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 11.5px;
  color: var(--ink-3);
  padding: 3px 6px;
  border-radius: 6px;
}

.add-row:hover {
  background: var(--panel-3);
  color: var(--ink-2);
}
</style>
