<script setup lang="ts">
import { useLogin } from '../../application/composables/useLogin';
const { username, password, busy, error, login } = useLogin();
</script>
<template>
  <main class="login-page">
    <form class="login-card stack" @submit.prevent="login">
      <p class="login-brand">BRIOCHETT</p>
      <h1>Inicia sesión con tu cuenta</h1>
      <p class="muted">Gestión comercial y seguimiento de pedidos.</p>
      <p v-if="error" class="notice error" role="alert">{{ error }}</p>
      <label
        >Usuario<input
          v-model="username"
          autocomplete="username"
          required
          autocapitalize="none"
          spellcheck="false"
          maxlength="40" /></label
      ><label
        >Contraseña<input
          v-model="password"
          type="password"
          autocomplete="current-password"
          required
          maxlength="128" /></label
      ><button :disabled="busy">{{ busy ? 'Ingresando…' : 'Ingresar' }}</button>
      <p class="muted small">El acceso y el rol de tu cuenta los gestiona Administración.</p>
    </form>
  </main>
</template>
