<script setup lang="ts">
import { ref,computed,onMounted,onUnmounted,watch,nextTick } from 'vue';
import { useRoute,useRouter } from 'vue-router';
import { useAuth } from './stores/auth';
import { roleLabels } from '@briochett/contracts';
import { errorMessage } from './api';
const auth=useAuth(),route=useRoute(),router=useRouter(),menu=ref(false),error=ref('');
const mobile=ref(window.matchMedia('(max-width:767px)').matches),sidebar=ref<HTMLElement|null>(null);const onResize=()=>{mobile.value=window.matchMedia('(max-width:767px)').matches;if(!mobile.value)menu.value=false;};
watch(menu,async open=>{if(open){await nextTick();sidebar.value?.querySelector<HTMLElement>('a')?.focus();}});
function menuKey(e:KeyboardEvent){if(!menu.value)return;if(e.key==='Escape'){menu.value=false;return;}if(e.key!=='Tab')return;const nodes=Array.from(sidebar.value?.querySelectorAll<HTMLElement>('a,button')||[]).filter(n=>n.offsetParent!==null),first=nodes[0],last=nodes.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}
const links=[['dashboard','Dashboard'],['pedidos','Pedidos'],['comandas','Comandas'],['rutas','Rutas y visitas'],['clientes','Clientes'],['productos','Productos'],['usuarios','Usuarios'],['reportes','Reportes'],['configuracion','Configuración']];
const shown=computed(()=>links.filter(([key])=>auth.can(key)));const onExpired=()=>{auth.user=null;router.replace('/login');};
async function logout(){try{await auth.signOut();menu.value=false;router.replace('/login');}catch(e){error.value=errorMessage(e);}}
onMounted(()=>{window.addEventListener('auth:expired',onExpired);window.addEventListener('resize',onResize);document.addEventListener('keydown',menuKey);});onUnmounted(()=>{window.removeEventListener('auth:expired',onExpired);window.removeEventListener('resize',onResize);document.removeEventListener('keydown',menuKey);});
</script>
<template>
  <RouterView v-if="route.path==='/login'" />
  <div v-else-if="auth.user" class="app-shell">
    <header class="mobile-header" :inert="menu"><strong>BRIOCHETT</strong><button class="secondary" @click="menu=true" aria-label="Abrir menú">Menú</button></header>
    <div v-if="menu" class="nav-backdrop" @click="menu=false"></div>
    <aside ref="sidebar" class="sidebar" :class="{open:menu}" :inert="mobile&&!menu" :aria-hidden="mobile&&!menu" :role="mobile&&menu?'dialog':undefined" :aria-modal="mobile&&menu?true:undefined" aria-label="Navegación principal">
      <RouterLink class="brand" to="/" @click="menu=false">BRIOCHETT</RouterLink><p class="sidebar-caption">Gestión comercial</p>
      <nav><RouterLink v-for="[key,label] in shown" :key="key" :to="'/'+key" @click="menu=false"><span class="nav-dot"></span>{{label}}</RouterLink></nav>
      <RouterLink to="/cuenta" class="user-card" @click="menu=false"><small>Usuario</small><strong>{{auth.user.name}}</strong><small>{{roleLabels[auth.user.role]}}</small></RouterLink>
      <button class="sidebar-logout" @click="logout">Cerrar sesión</button><button v-if="menu" class="secondary mobile-only" @click="menu=false">Cerrar menú</button>
    </aside>
    <main class="main-content" :inert="menu"><p v-if="error" class="notice error" role="alert">{{error}}</p><RouterView /></main>
  </div>
  <div v-else class="loading-page" role="status">Cargando sesión…</div>
</template>
