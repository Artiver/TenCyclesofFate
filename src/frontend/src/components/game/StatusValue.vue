<script setup lang="ts">
import { computed } from 'vue'

defineOptions({ name: 'StatusValue' })

const props = withDefaults(defineProps<{ value: unknown; level?: number }>(), {
  level: 0,
})

const isArray = computed(() => Array.isArray(props.value))
const isObject = computed(
  () => !isArray.value && typeof props.value === 'object' && props.value !== null,
)
const arrayItems = computed<unknown[]>(() => (Array.isArray(props.value) ? props.value : []))
const entries = computed<[string, unknown][]>(() =>
  isObject.value ? Object.entries(props.value as Record<string, unknown>) : [],
)
</script>

<template>
  <template v-if="isArray">
    <StatusValue
      v-for="(item, index) in arrayItems"
      :key="index"
      :value="item"
      :level="level + 1"
    />
  </template>
  <div v-else-if="isObject" :style="{ paddingLeft: `${level * 10}px` }">
    <div v-for="[key, val] in entries" :key="key" class="property-item">
      <span class="property-key">{{ key }}: </span>
      <StatusValue :value="val" :level="level + 1" />
    </div>
  </div>
  <span v-else class="property-value">{{ value === null ? 'null' : value }}</span>
</template>