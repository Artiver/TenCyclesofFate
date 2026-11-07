<script setup lang="ts">
import CharacterStatus from '@/components/game/CharacterStatus.vue'
import { useUiStore } from '@/stores/ui'

const ui = useUiStore()
</script>

<template>
  <aside id="status-panel">
    <div class="status-panel-header">
      <p>【人物业力】</p>
      <button
        id="status-close-button"
        class="header-button"
        type="button"
        aria-controls="status-panel"
        @click="ui.setStatusCollapsed(true)"
      >
        收起
      </button>
    </div>
    <button
      id="status-rail-button"
      type="button"
      aria-controls="status-panel"
      aria-label="展开人物业力"
      :aria-expanded="!ui.statusCollapsed"
      @click="ui.setStatusCollapsed(false)"
    >
      人物业力
    </button>
    <CharacterStatus />
  </aside>
</template>