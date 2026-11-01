<script setup lang="ts">
import { useId } from 'vue';
import type { VisitSlot } from '@briochett/contracts';
import {
  useVisitAvailability,
  visitPresets,
} from '../../application/composables/useVisitAvailability';

const slots = defineModel<VisitSlot[]>({ required: true });
const helpId = useId();
const { week, error, toggleDay, applyPreset, presetSelected, toggleAnyTime, addSlot, removeSlot } =
  useVisitAvailability(slots);
</script>
<template>
  <fieldset class="visit-availability" :aria-describedby="helpId">
    <legend>Días y horarios de visita</legend>
    <p :id="helpId" class="muted small">
      Selecciona los días permitidos. Por defecto, se puede visitar a cualquier hora. Desmarca
      «Cualquier horario» para definir franjas específicas. Horas de Venezuela.
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
      <section
        v-for="day in week"
        :key="day.day"
        class="visit-day"
        :class="{ selected: day.selected }"
        :aria-label="day.name"
      >
        <label class="check visit-day-heading">
          <input
            type="checkbox"
            :checked="day.selected"
            :aria-label="`Habilitar ${day.name.toLowerCase()}`"
            @change="toggleDay(day.day)"
          />
          {{ day.name }}
        </label>
        <template v-if="day.selected">
          <label class="check small">
            <input
              type="checkbox"
              :checked="day.allDay"
              :aria-label="`Cualquier horario el ${day.name.toLowerCase()}`"
              @change="toggleAnyTime(day.day)"
            />
            Cualquier horario
          </label>
          <div v-if="!day.allDay" class="stack">
            <div v-for="(slot, index) in day.entries" :key="index" class="visit-time-slot">
              <label
                >Desde<input
                  v-model="slot.start"
                  type="time"
                  required
                  :aria-label="`${day.name}: desde, franja ${index + 1}`"
              /></label>
              <label
                >Hasta<input
                  v-model="slot.end"
                  type="time"
                  required
                  :min="slot.start"
                  :aria-label="`${day.name}: hasta, franja ${index + 1}`"
              /></label>
              <button
                v-if="day.entries.length > 1"
                type="button"
                class="text-button"
                :aria-label="`Quitar franja ${index + 1} del ${day.name.toLowerCase()}`"
                @click="removeSlot(slot)"
              >
                Quitar franja
              </button>
            </div>
            <button
              type="button"
              class="secondary compact"
              :disabled="slots.length >= 21"
              :aria-label="`Agregar franja el ${day.name.toLowerCase()}`"
              @click="addSlot(day.day)"
            >
              + Agregar franja
            </button>
          </div>
        </template>
        <p v-else class="muted small">Sin visitas</p>
      </section>
    </div>
    <p v-if="error" class="notice error" role="alert">{{ error }}</p>
    <p v-if="!slots.length" class="notice" role="status">
      Sin días habilitados. No se podrán programar visitas hasta seleccionar al menos uno.
    </p>
  </fieldset>
</template>
