import DOMPurify from 'dompurify'
import { marked } from 'marked'

/**
 * 与旧实现（index.js:298 renderMarkdownSafe）等价的安全渲染策略：
 * marked 解析 → DOMPurify 白名单净化，禁止脚本类标签与内联事件/样式。
 */
const SANITIZE_OPTIONS = {
  USE_PROFILES: { html: true },
  FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'link', 'meta'],
  FORBID_ATTR: [
    'onerror',
    'onload',
    'onclick',
    'onmouseover',
    'onfocus',
    'onmouseenter',
    'onmouseleave',
    'style',
  ],
}

export function renderMarkdownSafe(markdownText: string | null | undefined): string {
  const source = markdownText ?? ''
  const raw = marked.parse(source, { async: false }) as string
  return DOMPurify.sanitize(raw, SANITIZE_OPTIONS) as string
}

export function useMarkdown() {
  return { renderMarkdownSafe }
}