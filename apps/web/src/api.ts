import { createAuthClient } from 'better-auth/vue';
import { usernameClient } from 'better-auth/client/plugins';
export const apiOrigin=import.meta.env.VITE_API_ORIGIN||'https://api.briochettvzla.com';
export const authClient=createAuthClient({baseURL:apiOrigin,plugins:[usernameClient()],fetchOptions:{credentials:'include'}});
export class ApiFailure extends Error {constructor(public code:string,message:string,public details?:any,public status=0){super(message);}}
export async function api<T=any>(path:string,options:{method?:string;body?:unknown;headers?:Record<string,string>;signal?:AbortSignal}={}):Promise<T>{let response:Response;try{response=await fetch(apiOrigin+'/api/v1'+path,{method:options.method||'GET',credentials:'include',headers:{...(options.body!==undefined?{'Content-Type':'application/json'}:{}),...options.headers},body:options.body!==undefined?JSON.stringify(options.body):undefined,signal:options.signal});}catch(e){if(e instanceof DOMException&&e.name==='AbortError')throw e;throw new ApiFailure('NETWORK','No hay conexión con el servidor. Conservamos tus datos para reintentar.');}const data=await response.json().catch(()=>({}));if(!response.ok){if(response.status===401)window.dispatchEvent(new CustomEvent('auth:expired'));throw new ApiFailure(data.error?.code||'SERVER',data.error?.message||'No se pudo completar la solicitud.',data.error?.details,response.status);}return data as T;}
export const errorMessage=(e:unknown)=>e instanceof Error?e.message:'Ocurrió un error. Vuelve a intentar.';
export function dateTime(value:string){return new Intl.DateTimeFormat('es-VE',{timeZone:'America/Caracas',dateStyle:'medium',timeStyle:'short'}).format(new Date(value));}
export function today(){return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Caracas',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());}
export const toISO=(value:string)=>new Date(value+':00-04:00').toISOString();
export function readDraft<T>(key:string,fallback:T):T{try{return JSON.parse(localStorage.getItem(key)||'null')||fallback;}catch{return fallback;}}
export function writeDraft(key:string,data:unknown){try{localStorage.setItem(key,JSON.stringify(data));return true;}catch{return false;}}
export function removeDraft(key:string){try{localStorage.removeItem(key);}catch{/* Storage may be disabled. */}}
