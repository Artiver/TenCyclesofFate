<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'

import { useUiStore } from '@/stores/ui'

const ui = useUiStore()

const dialog = ref<HTMLDialogElement | null>(null)
const confirmButton = ref<HTMLButtonElement | null>(null)
/** 记录本次关闭对应的按钮结果，统一在原生 close 事件里结算。 */
let pendingResult: boolean | null = null

const modal = computed(() => ui.currentModal)

/**
 * 用原生 `<dialog>` + `showModal()` 承载弹窗：
 * 焦点陷阱、Esc、惰性背景与 ::backdrop 都由浏览器实现，不再手写 keydown 监听与关闭定时器。
 */
async function sync(entry: { confirm: boolean } | null): Promise<void> {
  const el = dialog.value
  if (!el) return

  if (entry) {
    if (!el.open) el.showModal()
    await nextTick()
    confirmButton.value?.focus()
    return
  }

  if (el.open) el.close()
}

function close(result: boolean): void {
  const el = dialog.value
  if (!el?.open) return
  pendingResult = result
  el.close()
}

function onClosed(): void {
  const result = pendingResult ?? false
  pendingResult = null
  ui.resolveModal(result)
}

/** Esc：浏览器会先派发 cancel 再自动关闭，这里接管语义（确认框视为取消，提示框视为知晓）。 */
function onCancel(event: Event): void {
  event.preventDefault()
  close(!modal.value?.confirm)
}

/** 点击 ::backdrop 时事件目标是 dialog 自身，点面板内部不会命中。 */
function onBackdropClick(event: MouseEvent): void {
  if (event.target !== dialog.value) return
  close(!modal.value?.confirm)
}

watch(modal, (entry) => void sync(entry), { flush: 'post' })
onMounted(() => void sync(modal.value))
</script>

<template>
  <dialog
    ref="dialog"
    id="modal-panel"
    aria-labelledby="modal-title"
    aria-describedby="modal-message"
    @close="onClosed"
    @cancel="onCancel"
    @click="onBackdropClick"
  >
    <template v-if="modal">
      <!-- 内容放在单独容器里：点内边距时事件目标是它而不是 dialog，避免被当成点遮罩 -->
      <div id="modal-content">
        <p id="modal-title">{{ modal.title }}</p>
        <p id="modal-message">{{ modal.message }}</p>
        <div id="modal-actions">
          <button
            ref="confirmButton"
            id="modal-confirm-button"
            class="modal-button modal-confirm seal-button"
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
    </template>
  </dialog>
</template>