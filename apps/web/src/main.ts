import { createApp } from 'vue';
import { createPinia } from 'pinia';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import './style.css';
import App from './App.vue';
import { router } from './router';
function labelTable(el:HTMLTableElement){const labels=Array.from(el.querySelectorAll('thead th')).map(th=>th.textContent?.trim()||'');el.querySelectorAll('tbody tr').forEach(tr=>Array.from(tr.children).forEach((td,i)=>td.setAttribute('data-label',labels[i]||'')));}
const app=createApp(App);app.directive('responsive-table',{mounted:labelTable,updated:labelTable});app.use(createPinia());app.use(router);app.mount('#app');
