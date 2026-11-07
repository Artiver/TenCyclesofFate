import { useUiStore } from '@/stores/ui'

/**
 * 把叙事中「最新一张已加载完成」的插画提取为整页背景（旧实现 index.js:477）。
 * 没有图片时清除背景；有图片但尚未加载完成时，等 img 的 load/error 事件再算。
 */
export function useSceneBackground() {
  const ui = useUiStore()
  let frame: number | null = null

  function update(container: HTMLElement | null): void {
    if (!container) return

    const images = Array.from(container.querySelectorAll<HTMLImageElement>('img[src]'))
    const latest = [...images].reverse().find((img) => img.complete && img.naturalWidth > 0)

    if (latest) {
      ui.setSceneImage(latest.currentSrc || latest.src)
      return
    }

    if (images.length === 0) {
      ui.setSceneImage(null)
    }
  }

  function scheduleUpdate(container: HTMLElement | null): void {
    if (frame !== null) cancelAnimationFrame(frame)
    frame = requestAnimationFrame(() => {
      frame = null
      update(container)
    })
  }

  function dispose(): void {
    if (frame !== null) {
      cancelAnimationFrame(frame)
      frame = null
    }
  }

  return { scheduleUpdate, update, dispose }
}