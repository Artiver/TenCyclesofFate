<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'

import type { RollEvent } from '@/services/types'
import { useGameStore } from '@/stores/game'

const game = useGameStore()

const visible = ref(false)
const showResult = ref(false)
const event = ref<RollEvent | null>(null)
let resultTimer: ReturnType<typeof setTimeout> | null = null
let hideTimer: ReturnType<typeof setTimeout> | null = null

const typeLabel = computed(() => `判定: ${event.value?.type ?? ''}`)
const targetLabel = computed(() => `(<= ${event.value?.target ?? ''})`)
const outcomeClass = computed(() => (event.value ? `outcome-${event.value.outcome}` : ''))

function clearTimers(): void {
  if (resultTimer !== null) {
    clearTimeout(resultTimer)
    resultTimer = null
  }
  if (hideTimer !== null) {
    clearTimeout(hideTimer)
    hideTimer = null
  }
}

watch(
  () => game.rollEvent,
  (next) => {
    if (!next) return
    clearTimers()
    event.value = next
    visible.value = true
    showResult.value = false
    resultTimer = setTimeout(() => {
      showResult.value = true
      resultTimer = null
    }, 1000)
    hideTimer = setTimeout(() => {
      visible.value = false
      hideTimer = null
    }, 3000)
  },
)

onBeforeUnmount(clearTimers)
</script>

<template>
  <div id="roll-overlay" :class="{ hidden: !visible }" aria-live="polite">
    <div id="roll-panel">
      <div class="dice-cup">🎲</div>
      <div id="roll-details">
        <span id="roll-type">{{ typeLabel }}</span>
        <span id="roll-target">{{ targetLabel }}</span>
      </div>
      <div id="roll-result-display" :class="{ hidden: !showResult }">
        <span id="roll-outcome" :class="outcomeClass">{{ event?.outcome }}</span>
        <span id="roll-value">{{ event?.result }}</span>
      </div>
    </div>
  </div>
</template>