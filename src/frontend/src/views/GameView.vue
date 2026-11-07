<script setup lang="ts">
import ActionBar from '@/components/layout/ActionBar.vue'
import GameHeader from '@/components/layout/GameHeader.vue'
import NarrativeWindow from '@/components/layout/NarrativeWindow.vue'
import StatusPanel from '@/components/layout/StatusPanel.vue'
import RollOverlay from '@/components/game/RollOverlay.vue'
import { useUiStore } from '@/stores/ui'

const ui = useUiStore()
</script>

<template>
  <div id="game-view" class="view active" :class="{ 'status-collapsed': ui.statusCollapsed }">
    <GameHeader />
    <StatusPanel />
    <main id="main-content">
      <NarrativeWindow />
    </main>
    <ActionBar />
    <RollOverlay />
  </div>
</template>