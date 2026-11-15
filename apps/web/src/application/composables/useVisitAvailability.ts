import { computed, type Ref } from 'vue';
import { allVisitDays } from '@briochett/contracts';

const names = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
export const visitPresets = [
  { name: 'Todos los días', days: allVisitDays },
  { name: 'Entre semana', days: [1, 2, 3, 4, 5] },
  { name: 'Fines de semana', days: [6, 0] },
];
export function useVisitAvailability(days: Ref<number[]>) {
  const week = computed(() =>
    allVisitDays.map((day) => ({ day, name: names[day], selected: days.value.includes(day) })),
  );
  function toggleDay(day: number) {
    days.value = days.value.includes(day)
      ? days.value.filter((value) => value !== day)
      : [...days.value, day];
  }
  function applyPreset(preset: readonly number[]) {
    days.value = [...preset];
  }
  function presetSelected(preset: readonly number[]) {
    return days.value.length === preset.length && preset.every((day) => days.value.includes(day));
  }
  return { week, toggleDay, applyPreset, presetSelected };
}
