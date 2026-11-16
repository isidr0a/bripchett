<script setup lang="ts">
import DeleteRecord from '../components/DeleteRecord.vue';
import { roleLabels, roles } from '@briochett/contracts';
import PageHeader from '../components/PageHeader.vue';
import AppPagination from '../components/AppPagination.vue';
import AppModal from '../components/AppModal.vue';
import PhotoField from '../components/PhotoField.vue';
import PhotoPreview from '../components/PhotoPreview.vue';
import { photoPath } from '../../application/composables/useRecordPhoto';
import { useUsers } from '../../application/composables/useUsers';
const {
  data,
  page,
  busy,
  error,
  open,
  selected,
  saving,
  formError,
  reset,
  password,
  form,
  edit,
  save,
  resetPassword,
  load,
  photo,
  pendingId,
  close,
} = useUsers();
</script>
<template>
  <PageHeader title="Usuarios" description="Cuentas, roles y acceso al sistema" />
  <div class="toolbar"><button @click="edit(null)">+ Nuevo usuario</button></div>
  <p v-if="error" class="notice error" role="alert">{{ error }}</p>
  <section class="card">
    <h2>Equipo de trabajo</h2>
    <div class="table-wrap">
      <table v-responsive-table>
        <thead>
          <tr>
            <th>Nombre</th>
            <th>Usuario</th>
            <th>Rol</th>
            <th>Estado</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="u in data.items" :key="u.id">
            <td class="strong">
              <div class="photo-cell">
                <PhotoPreview
                  v-if="u.role === 'vendedor'"
                  :path="photoPath('users', u.id)"
                  :photo-id="u.photoId"
                  alt=""
                  compact
                  round
                  lazy
                />
                <span>{{ u.name }}</span>
              </div>
            </td>
            <td>{{ u.username }}</td>
            <td>{{ roleLabels[u.role] }}</td>
            <td>{{ u.active ? 'Activo' : 'Desactivado' }}</td>
            <td>
              <button class="secondary compact" @click="edit(u)">Gestionar</button
              ><DeleteRecord :id="u.id" type="users" :label="u.name" @deleted="load" />
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <AppPagination :page="page" :total="data.total" :busy="busy" @change="page = $event" />
  </section>
  <AppModal
    v-if="open"
    :title="reset ? 'Restablecer contraseña' : selected ? 'Gestionar usuario' : 'Nuevo usuario'"
    :busy="saving"
    @close="close"
    ><p v-if="formError" class="notice error" role="alert">{{ formError }}</p>
    <form v-if="!reset" class="stack" @submit.prevent="save">
      <template v-if="!pendingId">
        <label>Nombre<input v-model="form.name" required maxlength="100" /></label
        ><label>Correo de la cuenta<input v-model="form.email" type="email" required /></label
        ><label
          >Usuario<input
            v-model="form.username"
            required
            minlength="3"
            maxlength="40"
            pattern="[a-zA-Z0-9_.\-]+"
            :disabled="!!selected"
            autocapitalize="none" /></label
        ><label
          >Rol<select v-model="form.role">
            <option v-for="r in roles" :key="r" :value="r">{{ roleLabels[r] }}</option>
          </select></label
        ><label v-if="!selected"
          >Contraseña inicial<input
            v-model="form.password"
            type="password"
            minlength="10"
            maxlength="128"
            autocomplete="new-password"
            required
        /></label>
        <p v-if="!selected" class="muted small">
          La persona deberá cambiar esta contraseña en su primer acceso.
        </p>
        <label v-if="selected" class="check"
          ><input v-model="form.active" type="checkbox" /> Cuenta activa</label
        >
      </template>
      <p v-else class="notice" role="status">Los datos del vendedor ya se guardaron.</p>
      <PhotoField
        v-if="form.role === 'vendedor'"
        v-model="photo.draft"
        :path="pendingId || selected ? photoPath('users', pendingId || selected!.id) : undefined"
        :photo-id="photo.current"
        label="Foto del vendedor"
        :disabled="saving"
        portrait
      />
      <button :disabled="saving">
        {{ saving ? 'Guardando…' : pendingId ? 'Reintentar foto' : 'Guardar usuario' }}
      </button>
      <button v-if="pendingId" type="button" class="secondary" :disabled="saving" @click="close">
        Terminar sin aplicar la foto
      </button>
      <button
        v-if="selected && !pendingId"
        type="button"
        class="secondary"
        @click="
          reset = true;
          password = '';
        "
      >
        Restablecer contraseña
      </button>
    </form>
    <form v-else class="stack" @submit.prevent="resetPassword">
      <p>Cuenta: {{ selected?.name }}</p>
      <label
        >Nueva contraseña temporal<input
          v-model="password"
          type="password"
          required
          minlength="10"
          maxlength="128"
          autocomplete="new-password"
      /></label>
      <p class="muted small">Se cerrarán sus sesiones y deberá cambiarla en su próximo acceso.</p>
      <button :disabled="saving">Guardar contraseña temporal</button
      ><button type="button" class="secondary" @click="reset = false">Volver</button>
    </form></AppModal
  >
</template>
