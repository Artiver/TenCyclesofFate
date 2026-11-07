<script setup lang="ts">
import { computed } from 'vue'

import { renderMarkdownSafe } from '@/composables/useMarkdown'

const props = defineProps<{ text: string }>()

const html = computed(() => renderMarkdownSafe(props.text))

/** 旧实现的分类规则：`> ` 为玩家输入，`【` 为系统提示。 */
const entryClass = computed(() => {
  if (props.text.startsWith('> ')) return 'user-input-message'
  if (props.text.startsWith('【')) return 'system-message'
  return ''
})
</script>

<template>
  <div class="narrative-entry" :class="entryClass" v-html="html"></div>
</template>