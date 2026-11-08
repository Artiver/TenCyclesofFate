import type { Ref } from 'vue'

interface ScrollOptions {
  /** 首次渲染 / 读档后直接跳到底部，不做平滑滚动。 */
  instant?: boolean
}

/** 距底部多少像素以内视为「仍在跟随最新叙事」。 */
const STICKY_THRESHOLD = 80

/**
 * 叙事区自动滚动。
 *
 * - 平滑滚动交给浏览器原生 `scrollTo({ behavior: 'smooth' })`，不再手写 rAF 缓动、
 *   重试计数与 2s 冷却计时器；
 * - 用「上一次的内容高度」推断玩家是否仍停在底部：新叙事或插画撑高内容后，
 *   只有本来就在底部的玩家会被带着走，向上翻阅（滚轮 / 滚动条 / 键盘 / 触摸）时保持原位。
 *   旧实现只监听 wheel/touch，拖动滚动条或键盘翻页会被强行拽回底部。
 */
export function useSmoothScroll(target: Ref<HTMLElement | null>) {
  /** 上一次渲染完成时的内容高度，用于判断这次增长是否「发生在玩家脚下」。 */
  let lastHeight = 0

  function scrollToBottom(options: ScrollOptions = {}): void {
    const el = target.value
    if (!el) return

    if (options.instant) {
      el.scrollTo({ top: el.scrollHeight, behavior: 'instant' })
      lastHeight = el.scrollHeight
      return
    }

    // 内容只增不减，因此「当前到之前的底部」的距离约等于本次新增的高度；
    // 玩家原本贴底时这个距离不会超过新增高度 + 容差。
    const added = Math.max(0, el.scrollHeight - lastHeight)
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight
    lastHeight = el.scrollHeight

    if (distance > added + STICKY_THRESHOLD) return
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }

  return { scrollToBottom }
}