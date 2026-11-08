<script setup lang="ts">
import { computed } from 'vue'

import { renderMarkdownSafe } from '@/composables/useMarkdown'
import type { HistoryEntry } from '@/services/types'

const props = defineProps<{ entry: HistoryEntry }>()

const html = computed(() => renderMarkdownSafe(props.entry.text))

/** 角色 → 既有样式类，不再解析 "> " / "【" 前缀。 */
const roleClass = computed(() => {
  if (props.entry.role === 'user') return 'user-input-message'
  if (props.entry.role === 'system') return 'system-message'
  return ''
})
</script>

<template>
  <div class="narrative-entry" :class="roleClass" v-html="html"></div>
</template>