import { fileURLToPath, URL } from 'node:url'

import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  // 后端默认监听 127.0.0.1:8000（见 src/backend/core/config.py），可用 .env 覆盖
  const backendTarget = env.VITE_BACKEND_TARGET || 'http://127.0.0.1:8000'

  return {
    plugins: [vue(), vueDevTools()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      proxy: {
        // REST 接口
        '/api': {
          target: backendTarget,
          changeOrigin: true,
          ws: true, // /api/ws 需要 WebSocket 升级
        },
        // AI 生成图片
        '/generated-images': {
          target: backendTarget,
          changeOrigin: true,
        },
      },
    },
  }
})