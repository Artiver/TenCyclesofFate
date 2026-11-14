<script setup lang="ts">
import { useUiStore } from '@/stores/ui'

const ui = useUiStore()
</script>

<template>
  <!-- 非模态轻提示：不进 top layer、不抢焦点，只负责把「存档成功」这类结果告知玩家 -->
  <Transition name="toast">
    <div v-if="ui.toastMessage" id="app-toast" role="status" aria-live="polite">
      {{ ui.toastMessage }}
    </div>
  </Transition>
</template>
