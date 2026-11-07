import { createApp } from 'vue'

import App from './App.vue'
import router from './router'
import { pinia } from './stores'

import './assets/styles/theme.css'
import './assets/styles/base.css'
import './assets/styles/auth.css'
import './assets/styles/game.css'
import './assets/styles/overlays.css'
import './assets/styles/responsive.css'

const app = createApp(App)

app.use(pinia)
app.use(router)

app.mount('#app')