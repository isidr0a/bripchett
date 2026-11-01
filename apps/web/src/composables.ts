import {ref,watch,onMounted,onUnmounted,type Ref} from 'vue';
import type {Page} from '@briochett/contracts';
import {api,errorMessage} from './api';
export function useList<T>(source:()=>string){const data=ref<Page<T>>({items:[],total:0,page:1,pageSize:20}) as Ref<Page<T>>,page=ref(1),busy=ref(false),error=ref('');let controller:AbortController|undefined;
async function load(){controller?.abort();controller=new AbortController();const current=controller;busy.value=true;error.value='';try{const p=source();const result=await api<Page<T>>(p+(p.includes('?')?'&':'?')+'page='+page.value,{signal:controller.signal});if(current===controller)data.value=result;}catch(e){if(!(e instanceof DOMException&&e.name==='AbortError'))error.value=errorMessage(e);}finally{if(current===controller)busy.value=false;}}
watch([page,source],load);onMounted(load);onUnmounted(()=>controller?.abort());return{data,page,busy,error,load};}
export function debounceRef(source:Ref<string>,delay=300){const target=ref(source.value);let timer:ReturnType<typeof setTimeout>;watch(source,v=>{clearTimeout(timer);timer=setTimeout(()=>target.value=v,delay);});onUnmounted(()=>clearTimeout(timer));return target;}
