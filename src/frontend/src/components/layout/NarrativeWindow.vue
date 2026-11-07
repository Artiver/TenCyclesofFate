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

/** 历史数组被整体替换（全量/增量/读档）时滚动并刷新背景。 */
watch(
  () => game.history,
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
  scheduleUpdate(container.value)
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
    <NarrativeEntry v-for="(entry, index) in game.history" :key="index" :text="entry" />
  </div>
</template>