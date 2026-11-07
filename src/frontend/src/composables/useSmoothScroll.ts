import { onBeforeUnmount, onMounted, type Ref } from 'vue'

interface ScrollOptions {
  /** 首次渲染/重连后直接跳到底部，不做缓动。 */
  instant?: boolean
  /** 缓动速度，默认 150px/s（沿用旧实现）。 */
  pixelsPerSecond?: number
}

const MIN_SCROLL_DISTANCE = 50
const MAX_RETRY = 10
const USER_SCROLL_COOLDOWN = 2000

/**
 * 叙事区自动滚动：
 * - 距底 < 50px 时最多重试 10 次（内容未完成布局时不放弃）；
 * - 150px/s 二次缓动；
 * - 用户滚轮/触摸立即中断，2s 后恢复允许自动滚动。
 */
export function useSmoothScroll(target: Ref<HTMLElement | null>) {
  let animationId: number | null = null
  let retryTimer: ReturnType<typeof setTimeout> | null = null
  let idleTimer: ReturnType<typeof setTimeout> | null = null
  let userScrolling = false
  let boundElement: HTMLElement | null = null

  function cancelAnimation(): void {
    if (animationId !== null) {
      cancelAnimationFrame(animationId)
      animationId = null
    }
    if (retryTimer !== null) {
      clearTimeout(retryTimer)
      retryTimer = null
    }
  }

  function scrollToBottom(options: ScrollOptions = {}): void {
    const element = target.value
    if (!element) return

    if (options.instant) {
      cancelAnimation()
      element.scrollTop = element.scrollHeight
      return
    }

    if (userScrolling) return
    cancelAnimation()

    const pixelsPerSecond = options.pixelsPerSecond ?? 150
    const startScrollTop = element.scrollTop

    const tryStart = (retryCount = 0): void => {
      const targetScrollTop = element.scrollHeight - element.clientHeight
      const distance = targetScrollTop - startScrollTop

      if (distance < MIN_SCROLL_DISTANCE && retryCount < MAX_RETRY) {
        retryTimer = setTimeout(() => tryStart(retryCount + 1), 100)
        return
      }
      if (distance <= 0 || userScrolling) return

      const startTime = performance.now()
      const duration = (distance / pixelsPerSecond) * 1000

      const animate = (currentTime: number): void => {
        if (userScrolling) {
          animationId = null
          return
        }
        const progress = Math.min((currentTime - startTime) / duration, 1)
        const eased = 1 - (1 - progress) * (1 - progress)
        element.scrollTop = startScrollTop + distance * eased
        animationId = progress < 1 ? requestAnimationFrame(animate) : null
      }

      animationId = requestAnimationFrame(animate)
    }

    tryStart()
  }

  function beginUserScroll(): void {
    userScrolling = true
    cancelAnimation()
    if (idleTimer !== null) {
      clearTimeout(idleTimer)
      idleTimer = null
    }
  }

  function endUserScrollSoon(): void {
    if (idleTimer !== null) clearTimeout(idleTimer)
    idleTimer = setTimeout(() => {
      userScrolling = false
      idleTimer = null
    }, USER_SCROLL_COOLDOWN)
  }

  const onWheel = (): void => {
    beginUserScroll()
    endUserScrollSoon()
  }
  const onTouchStart = (): void => beginUserScroll()
  const onTouchEnd = (): void => endUserScrollSoon()

  onMounted(() => {
    boundElement = target.value
    if (!boundElement) return
    boundElement.addEventListener('wheel', onWheel, { passive: true })
    boundElement.addEventListener('touchstart', onTouchStart, { passive: true })
    boundElement.addEventListener('touchend', onTouchEnd, { passive: true })
  })

  onBeforeUnmount(() => {
    boundElement?.removeEventListener('wheel', onWheel)
    boundElement?.removeEventListener('touchstart', onTouchStart)
    boundElement?.removeEventListener('touchend', onTouchEnd)
    cancelAnimation()
    if (idleTimer !== null) {
      clearTimeout(idleTimer)
      idleTimer = null
    }
  })

  return { scrollToBottom }
}