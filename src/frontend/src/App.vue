<script setup lang="ts">
import { onBeforeUnmount, watch } from 'vue'
import { RouterView } from 'vue-router'

import AppModal from '@/components/common/AppModal.vue'
import AppToast from '@/components/common/AppToast.vue'
import LoadingOverlay from '@/components/common/LoadingOverlay.vue'
import { useUiStore } from '@/stores/ui'

const ui = useUiStore()

watch(
  () => ui.sceneImage,
  (src) => {
    document.body.classList.toggle('has-scene-background', Boolean(src))
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  document.body.classList.remove('has-scene-background')
})
</script>

<template>
  <img id="scene-background-image" :src="ui.sceneImage ?? undefined" alt="" aria-hidden="true" />
  <div id="app-container">
    <RouterView />
    <LoadingOverlay />
  </div>
  <AppModal />
  <AppToast />
</template>