<script setup lang="ts">import {useAuth} from '../stores/auth';import {roleLabels} from '@briochett/contracts';defineProps<{title:string;description:string}>();const auth=useAuth();</script>
<template><header class="page-header"><div><h1>{{title}}</h1><p>{{description}}</p></div><span v-if="auth.user" class="role-badge">{{roleLabels[auth.user.role]}}</span></header></template>
