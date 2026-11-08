<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { RequestTab } from '@/lib/request'
import { Bookmark, Plus, X } from 'lucide-vue-next'

const props = defineProps<{ tabs: RequestTab[]; activeId: string }>()

const emit = defineEmits<{
  select: [id: string]
  close: [id: string]
  add: []
}>()

const scroller = ref<HTMLElement | null>(null)

/** Keep the selected tab visible when tabs are added or switched. */
function revealActiveTab(behavior: ScrollBehavior = 'smooth') {
  const box = scroller.value
  if (!box) return
  const active = box.querySelector<HTMLElement>('.tab.active')
  if (!active) return
  const boxRect = box.getBoundingClientRect()
  const tabRect = active.getBoundingClientRect()
  if (tabRect.left < boxRect.left) {
    box.scrollBy({ left: tabRect.left - boxRect.left, behavior })
  } else if (tabRect.right > boxRect.right) {
    box.scrollBy({ left: tabRect.right - boxRect.right, behavior })
  }
}

/** A plain vertical wheel over the strip scrolls it horizontally. */
function onWheel(event: WheelEvent) {
  const box = scroller.value
  if (!box) return
  // Trackpads and Shift+wheel already produce deltaX; leave those to the browser.
  if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return
  if (box.scrollWidth <= box.clientWidth) return
  event.preventDefault()
  const delta = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY
  box.scrollBy({ left: delta })
}

watch(
  () => props.activeId,
  () => {
    void nextTick(() => revealActiveTab())
  },
)

onMounted(() => {
  scroller.value?.addEventListener('wheel', onWheel, { passive: false })
  void nextTick(() => revealActiveTab('auto'))
})

onBeforeUnmount(() => {
  scroller.value?.removeEventListener('wheel', onWheel)
})
</script>

<template>
  <div class="tabs-bar">
    <div ref="scroller" class="tabs-scroll">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        type="button"
        class="tab"
        :class="{ active: tab.id === activeId }"
        :title="`${tab.method} ${tab.path}`"
        @click="emit('select', tab.id)"
        @auxclick.middle.prevent="emit('close', tab.id)"
      >
        <span class="method-dot" :class="tab.method.toLowerCase()" />
        <span class="tab-title">{{ tab.title }}</span>
        <Bookmark v-if="tab.savedId" :size="10" class="saved-mark" />
        <span
          class="close"
          role="button"
          tabindex="0"
          aria-label="关闭标签页"
          @click.stop="emit('close', tab.id)"
          @keydown.enter.stop="emit('close', tab.id)"
        >
          <X :size="11" />
        </span>
      </button>
      <button class="add-tab" type="button" title="新建自定义请求" @click="emit('add')">
        <Plus :size="14" />
      </button>
    </div>
    <span class="tabs-hint">双击路径参数可从缓存选择</span>
  </div>
</template>

<style scoped>
.tabs-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 42px;
  padding: 0 10px;
  border-bottom: 1px solid var(--line);
  background: var(--panel-2);
  flex: none;
}

.tabs-scroll {
  display: flex;
  align-items: center;
  gap: 4px;
  overflow-x: auto;
  overscroll-behavior-x: contain;
  min-width: 0;
  scrollbar-width: none;
  height: 100%;
}

.tabs-scroll::-webkit-scrollbar {
  display: none;
}

.tab {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 30px;
  max-width: 210px;
  padding: 0 7px 0 10px;
  border-radius: 7px;
  border: 1px solid transparent;
  color: var(--ink-3);
  flex: none;
  transition: background 0.12s ease, color 0.12s ease, border-color 0.12s ease;
}

.tab:hover {
  background: #eef1f6;
  color: var(--ink-2);
}

.tab.active {
  background: #fff;
  border-color: var(--line-strong);
  color: var(--ink);
  box-shadow: var(--shadow-sm);
}

.method-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex: none;
  background: #94a3b8;
}

.method-dot.get {
  background: #22c55e;
}
.method-dot.post {
  background: #3b82f6;
}
.method-dot.put,
.method-dot.patch {
  background: #f59e0b;
}
.method-dot.delete {
  background: #ef4444;
}

.tab-title {
  font-size: 11.5px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.saved-mark {
  color: #c28a2b;
  flex: none;
}

.close {
  width: 17px;
  height: 17px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  color: #aab3c2;
  flex: none;
  opacity: 0;
}

.tab:hover .close,
.tab.active .close {
  opacity: 1;
}

.close:hover {
  background: #e9edf4;
  color: var(--ink);
}

.add-tab {
  flex: none;
  width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--ink-3);
  border-radius: 6px;
}

.add-tab:hover {
  background: #eef1f6;
  color: var(--ink);
}

.tabs-hint {
  margin-left: auto;
  flex: none;
  font-size: 10px;
  color: #b3bccb;
}
</style>
