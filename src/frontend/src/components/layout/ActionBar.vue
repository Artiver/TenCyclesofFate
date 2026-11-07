<script setup lang="ts">
import { ref } from 'vue'

import { useGameStore } from '@/stores/game'

const game = useGameStore()
const draft = ref('')

function submit(): void {
  if (game.submitAction(draft.value)) {
    draft.value = ''
  }
}

/** 中文输入法组字过程中的 Enter 只用于确认候选词，不提交行动。 */
function onEnter(event: KeyboardEvent): void {
  if (event.isComposing) return
  event.preventDefault()
  submit()
}

function onStartTrial(): void {
  game.startTrial()
}
</script>

<template>
  <footer id="action-area">
    <div class="action-input-row" :class="{ hidden: !game.inputVisible }">
      <input
        id="action-input"
        v-model="draft"
        type="text"
        placeholder="汝欲何为..."
        autocomplete="off"
        :disabled="game.actionDisabled"
        @keydown.enter="onEnter"
      />
      <button
        id="action-button"
        type="button"
        :disabled="game.actionDisabled"
        @click="submit"
      >
        <span v-if="game.actionBusy" class="btn-spinner" aria-hidden="true"></span>
        <template v-else>定</template>
      </button>
    </div>
    <button
      id="start-trial-button"
      type="button"
      :class="{ hidden: !game.startVisible }"
      :disabled="game.startTrialDisabled"
      @click="onStartTrial"
    >
      {{ game.startTrialLabel }}
    </button>
  </footer>
</template>