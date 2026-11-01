import { defineStore } from 'pinia';
import { ref,computed } from 'vue';
import { api,authClient } from '../api';
import { moduleAccess,type SessionUser } from '@briochett/contracts';
export const useAuth=defineStore('auth',()=>{const user=ref<SessionUser|null>(null),ready=ref(false);const isAdmin=computed(()=>user.value?.role==='administracion'),canSell=computed(()=>isAdmin.value||user.value?.role==='vendedor');async function load(){try{user.value=await api<SessionUser>('/me');}catch{user.value=null;}finally{ready.value=true;}}async function signOut(){const result=await authClient.signOut();if(result.error)throw new Error('No se pudo cerrar la sesión. Vuelve a intentar.');user.value=null;}function can(module:string){return !!user.value&&moduleAccess[user.value.role].includes(module);}return{user,ready,isAdmin,canSell,load,signOut,can};});
