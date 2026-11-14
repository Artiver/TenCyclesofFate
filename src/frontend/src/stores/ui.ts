import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

interface ModalEntry {
  title: string
  message: string
  confirm: boolean
  resolve: (value: boolean) => void
}

interface ModalOptions {
  title?: string
}

const isNarrowScreen = (): boolean =>
  typeof window !== 'undefined' && window.matchMedia('(max-width: 850px)').matches

/** 轻提示默认停留时长（毫秒）。 */
const TOAST_DURATION = 2600

/**
 * 全局 UI 状态：加载遮罩、人物业力侧栏折叠、场景背景图、主题化弹窗队列、轻提示。
 */
export const useUiStore = defineStore('ui', () => {
  const fullscreenLoading = ref(false)
  const statusCollapsed = ref(isNarrowScreen())
  const sceneImage = ref<string | null>(null)
  const modalQueue = ref<ModalEntry[]>([])
  /** 非模态轻提示：用于「存档成功」这类不需要玩家确认的反馈。 */
  const toastMessage = ref<string | null>(null)
  let toastTimer: ReturnType<typeof setTimeout> | null = null

  const currentModal = computed<ModalEntry | null>(() => modalQueue.value[0] ?? null)

  function setFullscreenLoading(value: boolean): void {
    fullscreenLoading.value = value
  }

  function setStatusCollapsed(value: boolean): void {
    statusCollapsed.value = value
  }

  function toggleStatusPanel(): void {
    statusCollapsed.value = !statusCollapsed.value
  }

  function setSceneImage(url: string | null): void {
    sceneImage.value = url
  }

  function openModal(message: string, options: ModalOptions & { confirm?: boolean } = {}): Promise<boolean> {
    const { title = '天机所示', confirm = false } = options
    return new Promise<boolean>((resolve) => {
      modalQueue.value.push({ title, message, confirm, resolve })
    })
  }

  /** 单按钮提示，对应旧实现的 showAlert。 */
  function alert(message: string, options: ModalOptions = {}): Promise<boolean> {
    return openModal(message, options)
  }

  /** 双按钮确认，对应旧实现的 showConfirm。 */
  function confirm(message: string, options: ModalOptions = {}): Promise<boolean> {
    return openModal(message, { ...options, confirm: true })
  }

  /** 关闭当前弹窗并推进队列，避免并发提示互相覆盖。 */
  function resolveModal(result: boolean): void {
    const entry = modalQueue.value.shift()
    entry?.resolve(result)
  }

  function clearToastTimer(): void {
    if (toastTimer === null) return
    clearTimeout(toastTimer)
    toastTimer = null
  }

  /** 轻提示：不打断操作、不需要点击，重复调用会重置计时并覆盖文案。 */
  function toast(message: string, duration = TOAST_DURATION): void {
    clearToastTimer()
    toastMessage.value = message
    toastTimer = setTimeout(() => {
      toastMessage.value = null
      toastTimer = null
    }, duration)
  }

  function dismissToast(): void {
    clearToastTimer()
    toastMessage.value = null
  }

  return {
    fullscreenLoading,
    statusCollapsed,
    sceneImage,
    modalQueue,
    currentModal,
    toastMessage,
    setFullscreenLoading,
    setStatusCollapsed,
    toggleStatusPanel,
    setSceneImage,
    openModal,
    alert,
    confirm,
    resolveModal,
    toast,
    dismissToast,
  }
})