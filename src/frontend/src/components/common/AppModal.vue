<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import { useUiStore } from '@/stores/ui'

const ui = useUiStore()

const closing = ref(false)
const confirmButton = ref<HTMLButtonElement | null>(null)
let closeTimer: ReturnType<typeof setTimeout> | null = null

const modal = computed(() => ui.currentModal)
const visible = computed(() => Boolean(modal.value) && !closing.value)

function close(result: boolean): void {
  if (!modal.value || closing.value) return
  closing.value = true
  closeTimer = setTimeout(() => {
    closeTimer = null
    closing.value = false
    ui.resolveModal(result)
  }, 200)
}

function onOverlayClick(event: MouseEvent): void {
  if (event.target !== event.currentTarget || !modal.value) return
  // 有取消按钮（确认框）时点遮罩视为取消，否则视为知晓
  close(!modal.value.confirm)
}

function onKeydown(event: KeyboardEvent): void {
  if (!modal.value || closing.value) return
  if (event.key === 'Enter') {
    close(true)
  } else if (event.key === 'Escape') {
    close(!modal.value.confirm)
  }
}

watch(
  () => modal.value,
  async (entry) => {
    if (!entry) return
    closing.value = false
    await nextTick()
    confirmButton.value?.focus()
  },
)

onMounted(() => {
  document.addEventListener('keydown', onKeydown)
})

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown)
  if (closeTimer !== null) clearTimeout(closeTimer)
})
</script>

<template>
  <div
    v-if="modal"
    id="modal-overlay"
    :class="{ 'modal-closing': closing }"
    :aria-hidden="!visible"
    @click="onOverlayClick"
  >
    <div
      id="modal-panel"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      aria-describedby="modal-message"
    >
      <p id="modal-title">{{ modal.title }}</p>
      <p id="modal-message">{{ modal.message }}</p>
      <div id="modal-actions">
        <button
          ref="confirmButton"
          id="modal-confirm-button"
          class="modal-button modal-confirm"
          type="button"
          @click="close(true)"
        >
          {{ modal.confirm ? '确定' : '知晓' }}
        </button>
        <button
          v-if="modal.confirm"
          id="modal-cancel-button"
          class="modal-button modal-cancel"
          type="button"
          @click="close(false)"
        >
          取消
        </button>
      </div>
    </div>
  </div>
</template>