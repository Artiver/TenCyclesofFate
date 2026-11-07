<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'

import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const auth = useAuthStore()

const isRegisterMode = ref(false)
const username = ref('')
const password = ref('')
const errorMessage = ref('')

const submitting = computed(() => auth.pending)
const submitLabel = computed(() => (isRegisterMode.value ? '注册' : '登录'))
const toggleLabel = computed(() => (isRegisterMode.value ? '已有账号？登录' : '没有账号？注册'))
const passwordAutocomplete = computed(() =>
  isRegisterMode.value ? 'new-password' : 'current-password',
)

function toggleMode(): void {
  isRegisterMode.value = !isRegisterMode.value
  errorMessage.value = ''
}

async function submit(): Promise<void> {
  const name = username.value.trim()

  // 用户名格式由输入框的 pattern 属性与后端共同校验，此处只拦空值。
  if (!name || !password.value) {
    errorMessage.value = '请输入用户名和密码'
    return
  }

  errorMessage.value = ''

  try {
    if (isRegisterMode.value) {
      await auth.register(name, password.value)
    } else {
      await auth.login(name, password.value)
    }
    await router.replace({ name: 'game' })
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '认证失败'
  }
}
</script>

<template>
  <div id="login-view" class="view">
    <h1>浮生十梦</h1>
    <p>此乃试炼之地，请先表明身份。</p>
    <form id="auth-form" class="auth-form" @submit.prevent="submit">
      <input
        id="username-input"
        v-model="username"
        type="text"
        placeholder="用户名"
        autocomplete="username"
        pattern="[A-Za-z0-9_]+"
        title="用户名只能包含字母、数字和下划线"
        required
      />
      <input
        id="password-input"
        v-model="password"
        type="password"
        placeholder="密码"
        :autocomplete="passwordAutocomplete"
        required
      />
      <button id="auth-submit-button" class="login-button" type="submit" :disabled="submitting">
        {{ submitLabel }}
      </button>
      <button
        id="auth-toggle-button"
        class="auth-toggle-button"
        type="button"
        @click="toggleMode"
      >
        {{ toggleLabel }}
      </button>
    </form>
    <p id="login-error" class="error-message" role="alert">{{ errorMessage }}</p>
  </div>
</template>