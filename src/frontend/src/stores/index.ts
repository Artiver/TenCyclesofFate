import { createPinia } from 'pinia'

/** 单独导出 pinia，供路由守卫在组件树外使用同一实例。 */
export const pinia = createPinia()