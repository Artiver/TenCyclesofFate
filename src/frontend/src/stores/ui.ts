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

/**
 * 全局 UI 状态：加载遮罩、人物业力侧栏折叠、场景背景图、主题化弹窗队列。
 */
export const useUiStore = defineStore('ui', () => {
  const fullscreenLoading = ref(false)
  const statusCollapsed = ref(isNarrowScreen())
  const sceneImage = ref<string | null>(null)
  const modalQueue = ref<ModalEntry[]>([])

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

  return {
    fullscreenLoading,
    statusCollapsed,
    sceneImage,
    modalQueue,
    currentModal,
    setFullscreenLoading,
    setStatusCollapsed,
    toggleStatusPanel,
    setSceneImage,
    openModal,
    alert,
    confirm,
    resolveModal,
  }
})