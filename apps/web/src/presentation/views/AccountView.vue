<script setup lang="ts">
import PageHeader from '../components/PageHeader.vue';
import { useAccount } from '../../application/composables/useAccount';
const { auth, currentPassword, newPassword, confirmation, busy, error, success, change } =
  useAccount();
</script>
<template>
  <PageHeader title="Mi cuenta" description="Seguridad y datos de acceso" />
  <section class="card narrow">
    <h2>{{ auth.user?.name }}</h2>
    <p class="muted">{{ auth.user?.username }}</p>
    <p v-if="auth.user?.mustChangePassword" class="notice">
      Cambia tu contraseña inicial para comenzar a usar el sistema.
    </p>
    <form class="stack" @submit.prevent="change">
      <label
        >Contraseña actual<input
          v-model="currentPassword"
          type="password"
          required
          autocomplete="current-password" /></label
      ><label
        >Nueva contraseña<input
          v-model="newPassword"
          type="password"
          required
          minlength="10"
          maxlength="128"
          autocomplete="new-password" /></label
      ><label
        >Confirmar nueva contraseña<input
          v-model="confirmation"
          type="password"
          required
          minlength="10"
          maxlength="128"
          autocomplete="new-password"
      /></label>
      <p class="muted small">Usa al menos 10 caracteres.</p>
      <p v-if="error" class="notice error" role="alert">{{ error }}</p>
      <p v-if="success" class="notice success" role="status">{{ success }}</p>
      <button :disabled="busy">{{ busy ? 'Guardando…' : 'Cambiar contraseña' }}</button>
    </form>
  </section>
</template>
