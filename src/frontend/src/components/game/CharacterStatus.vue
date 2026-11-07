<script setup lang="ts">
import { computed } from 'vue'

import StatusValue from '@/components/game/StatusValue.vue'
import { useGameStore } from '@/stores/game'

const game = useGameStore()

const currentLife = computed(() => game.currentLife)
const entries = computed(() => (currentLife.value ? Object.entries(currentLife.value) : []))
</script>

<template>
  <div id="character-status">
    <template v-if="!currentLife">静待天命...</template>
    <template v-else>
      <details v-for="[key, value] in entries" :key="key">
        <summary>{{ key }}</summary>
        <div class="details-content">
          <StatusValue :value="value" :level="0" />
        </div>
      </details>
    </template>
  </div>
</template>