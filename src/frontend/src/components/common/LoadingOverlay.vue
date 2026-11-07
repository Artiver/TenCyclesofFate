<script setup lang="ts">
import { computed } from 'vue'

import { useUiStore } from '@/stores/ui'

const ui = useUiStore()

const visible = computed(() => ui.fullscreenLoading)
</script>

<template>
  <div
    v-show="visible"
    id="loading-spinner"
    class="spinner-overlay"
    role="status"
    aria-live="polite"
    aria-label="加载中"
  >
    <div class="spinner"></div>
  </div>
</template>