<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'

import NarrativeEntry from '@/components/game/NarrativeEntry.vue'
import { useSceneBackground } from '@/composables/useSceneBackground'
import { useSmoothScroll } from '@/composables/useSmoothScroll'
import { useGameStore } from '@/stores/game'

const game = useGameStore()
const container = ref<HTMLElement | null>(null)

const { scrollToBottom } = useSmoothScroll(container)
const { scheduleUpdate, dispose } = useSceneBackground()

/**
 * 只在「整份状态被替换」（首屏 / 读档 / WS full_state）或「历史变长」时滚动并刷新背景。
 * 状态补丁只改 is_processing 等字段时不再触发滚动，避免打断玩家正在看的位置。
 */
watch(
  // 三个来源：整份状态换引用（首屏/读档/full_state）、历史变长、末条内容被改写。
  // 只看 game.history 会让「只改 is_processing」的补丁也触发滚动（补丁不再深拷贝后，历史数组引用是稳定的）。
  [() => game.session, () => game.history.length, () => game.history[game.history.length - 1]],
  async () => {
    await nextTick()
    scheduleUpdate(container.value)
    if (game.consumeFirstRender()) {
      scrollToBottom({ instant: true })
    } else {
      scrollToBottom()
    }
  },
  { immediate: true },
)

function onMediaEvent(): void {
  // 插画加载完成会撑高内容；玩家本就在底部时保持跟随（sticky 逻辑内部会判断）。
  scheduleUpdate(container.value)
  scrollToBottom()
}

onBeforeUnmount(dispose)
</script>

<template>
  <div
    id="narrative-window"
    ref="container"
    @load.capture="onMediaEvent"
    @error.capture="onMediaEvent"
  >
    <NarrativeEntry v-for="(entry, index) in game.history" :key="index" :entry="entry" />
  </div>
</template>