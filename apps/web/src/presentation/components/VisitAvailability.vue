<script setup lang="ts">
import { useId } from 'vue';
import {
  useVisitAvailability,
  visitPresets,
} from '../../application/composables/useVisitAvailability';
const days = defineModel<number[]>({ required: true });
const helpId = useId();
const { week, toggleDay, applyPreset, presetSelected } = useVisitAvailability(days);
</script>
<template>
  <fieldset class="visit-availability" :aria-describedby="helpId">
    <legend>Días permitidos de visita</legend>
    <p :id="helpId" class="muted small">
      En un día habilitado se puede programar la visita a cualquier hora.
    </p>
    <div class="visit-presets" role="group" aria-label="Selección rápida de días">
      <button
        v-for="preset in visitPresets"
        :key="preset.name"
        type="button"
        class="compact"
        :class="{ secondary: !presetSelected(preset.days) }"
        :aria-pressed="presetSelected(preset.days)"
        @click="applyPreset(preset.days)"
      >
        {{ preset.name }}
      </button>
    </div>
    <div class="visit-week">
      <label
        v-for="day in week"
        :key="day.day"
        class="check visit-day visit-day-heading"
        :class="{ selected: day.selected }"
      >
        <input type="checkbox" :checked="day.selected" @change="toggleDay(day.day)" />{{ day.name }}
      </label>
    </div>
    <p v-if="!days.length" class="notice" role="status">
      Sin días habilitados. No se podrán programar visitas.
    </p>
  </fieldset>
</template>
