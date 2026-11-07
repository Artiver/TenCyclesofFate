<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'

import { useAuthStore } from '@/stores/auth'
import { useGameStore } from '@/stores/game'
import { useUiStore } from '@/stores/ui'

const game = useGameStore()
const auth = useAuthStore()
const ui = useUiStore()
const router = useRouter()

const toggleLabel = computed(() => (ui.statusCollapsed ? '展开状态' : '收起状态'))
const connectionLabel = computed(() => {
  if (game.socketStatus === 'reconnecting') return '重连中…'
  if (game.socketStatus === 'connecting') return '连接中…'
  return ''
})

async function onLogout(): Promise<void> {
  await auth.logout()
  await router.replace({ name: 'login' })
}

async function onDeleteAccount(): Promise<void> {
  const deleted = await auth.deleteAccount()
  if (deleted) await router.replace({ name: 'login' })
}
</script>

<template>
  <header id="game-header">
    <h1>浮生一梦</h1>
    <div id="game-status">
      <span>剩余机缘: <span id="opportunities">{{ game.opportunities }}</span></span>
      <span v-if="connectionLabel" class="connection-status" role="status">
        {{ connectionLabel }}
      </span>
      <button
        id="save-button"
        class="header-button"
        type="button"
        :disabled="!game.canSave"
        @click="game.save()"
      >
        {{ game.saveLabel }}
      </button>
      <button
        id="load-button"
        class="header-button"
        type="button"
        :disabled="!game.canLoad"
        @click="game.load()"
      >
        读档
      </button>
      <button
        id="delete-save-button"
        class="header-button header-button-danger"
        type="button"
        :disabled="!game.canDeleteSave"
        @click="game.deleteSave()"
      >
        删除存档
      </button>
      <button
        id="status-toggle-button"
        class="header-button"
        type="button"
        aria-controls="status-panel"
        :aria-expanded="!ui.statusCollapsed"
        @click="ui.toggleStatusPanel()"
      >
        {{ toggleLabel }}
      </button>
      <button id="logout-button" class="header-button" type="button" @click="onLogout">
        登出
      </button>
      <button
        id="delete-account-button"
        class="header-button header-button-danger"
        type="button"
        @click="onDeleteAccount"
      >
        注销账户
      </button>
    </div>
  </header>
</template>