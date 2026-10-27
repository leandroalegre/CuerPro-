/**
 * "Tengo poco tiempo": arma una rutina que entra en los minutos que tenés.
 *
 * Lo que recomiendan los estudios (Iversen 2021, Weakley 2022): priorizar los
 * ejercicios compuestos, bajar series antes que sacar ejercicios y acortar la
 * entrada en calor. Los de aislamiento quedan para otro día.
 */
import { Ejercicio, EjercicioRutina, esPorTiempo } from './api';

export type ModoCorto = 'corta' | 'abandonado' | 'aerobico';

export const MODOS_CORTOS: { modo: ModoCorto; texto: string; explicacion: string }[] = [
  {
    modo: 'corta',
    texto: 'Versión corta del día',
    explicacion: 'Hacés el día que toca, pero solo los ejercicios compuestos (los que mueven más músculos), con una serie menos y 3 minutos de entrada en calor. Seguís a la par del plan y del grupo.',
  },
  {
    modo: 'abandonado',
    texto: 'Lo más abandonado',
    explicacion: 'Busca la zona que hace más días que no entrenás (o que nunca hiciste) y te arma sus ejercicios del plan.',
  },
  {
    modo: 'aerobico',
    texto: 'Aeróbico',
    explicacion: 'Un circuito de cardio con las máquinas del gimnasio, en bloques de unos 10 minutos, uno tras otro.',
  },
];
export const MINUTOS = [30, 45, 60];

// Igual que ZONAS en server/index.js
const ZONA_DE: Record<string, string> = {
  cuadriceps: 'piernas', isquios: 'piernas', gluteos: 'piernas', gemelos: 'piernas',
  espalda: 'espalda', pecho: 'pecho', hombros: 'hombros',
  biceps: 'brazos', triceps: 'brazos', abdominales: 'abdominales',
};
// Músculos que se trabajan con ejercicios compuestos (van primero)
const COMPUESTOS = new Set(['cuadriceps', 'isquios', 'gluteos', 'espalda', 'pecho', 'hombros']);

const minutosTexto = (reps: string) => Number(String(reps).match(/\d+/)?.[0] ?? 5);

// Cuánto tarda: por tiempo, lo que dice; si no, cada serie ~45'' más la pausa, y 1' para preparar
export function minutosDe(ej: Pick<EjercicioRutina, 'series' | 'repeticiones' | 'descanso_seg'>) {
  if (esPorTiempo(ej.repeticiones)) return minutosTexto(ej.repeticiones);
  return ej.series * (0.75 + (ej.descanso_seg ?? 90) / 60) + 1;
}

export const minutosTotal = (rutina: EjercicioRutina[]) => Math.round(rutina.reduce((n, e) => n + minutosDe(e), 0));

// Agrega en orden de prioridad hasta llenar los minutos; devuelve en el orden original
function llenar(candidatos: EjercicioRutina[], prioridad: (e: EjercicioRutina) => number, minutos: number, usados = 0) {
  const orden = candidatos.map((e, i) => ({ e, i })).sort((a, b) => prioridad(a.e) - prioridad(b.e) || a.i - b.i);
  const elegidos: { e: EjercicioRutina; i: number }[] = [];
  for (const c of orden) {
    const m = minutosDe(c.e);
    if (usados + m > minutos && elegidos.length) continue;
    elegidos.push(c);
    usados += m;
  }
  return elegidos.sort((a, b) => a.i - b.i).map(c => c.e);
}

// Los compuestos del día con una serie menos y 3' de entrada en calor
export function versionCorta(rutina: EjercicioRutina[], minutos: number): EjercicioRutina[] {
  const primero = rutina.findIndex(e => !esPorTiempo(e.repeticiones));
  const calor = primero > 0 ? [{ ...rutina[0], repeticiones: '3 min', union_siguiente: null }] : [];
  const resto = rutina
    .filter(e => !esPorTiempo(e.repeticiones))
    .map(e => ({ ...e, series: Math.max(2, e.series - 1) }));
  const prioridad = (e: EjercicioRutina) => (COMPUESTOS.has(e.musculo_principal) ? 0 : 1);
  return [...calor, ...llenar(resto, prioridad, minutos, calor.length ? 3 : 0)];
}

// La zona que hace más días que no entrenás, con los ejercicios que tiene el plan para ella
export function loMasAbandonado(
  ejerciciosDelPlan: EjercicioRutina[],
  musculos: { musculo: string; dias: number }[],
  minutos: number,
): { zona: string; rutina: EjercicioRutina[] } | null {
  const dias: Record<string, number> = {};
  for (const m of musculos) {
    const zona = ZONA_DE[m.musculo];
    if (zona) dias[zona] = Math.min(dias[zona] ?? Infinity, m.dias);
  }
  const zonasDelPlan = new Set(ejerciciosDelPlan.map(e => ZONA_DE[e.musculo_principal]).filter(Boolean));
  // Una zona del plan que nunca entrenaste gana; si no, la de más días
  const zona = [...zonasDelPlan].sort((a, b) => (dias[b] ?? Infinity) - (dias[a] ?? Infinity))[0];
  if (!zona) return null;
  const vistos = new Set<number>();
  const deLaZona = ejerciciosDelPlan.filter(e => {
    if (ZONA_DE[e.musculo_principal] !== zona || vistos.has(e.ejercicio_id)) return false;
    vistos.add(e.ejercicio_id);
    return true;
  });
  const prioridad = (e: EjercicioRutina) => (COMPUESTOS.has(e.musculo_principal) ? 0 : 1);
  return { zona, rutina: llenar(deLaZona, prioridad, minutos) };
}

// Circuito de cardio: reparte los minutos entre las máquinas, de a bloques de 10'
export function aerobico(cardio: Ejercicio[], minutos: number): EjercicioRutina[] {
  if (!cardio.length) return [];
  const bloques = Math.max(1, Math.round(minutos / 10));
  const cada = Math.round(minutos / bloques);
  return Array.from({ length: bloques }, (_, i) => {
    const e = cardio[i % cardio.length];
    return {
      plan_ejercicio_id: -(i + 1), // no viene del plan
      ejercicio_id: e.id,
      nombre: e.nombre,
      musculo_principal: e.musculo_principal,
      equipo: e.equipo,
      series: 1,
      repeticiones: `${cada} min`,
      peso_sugerido: null,
      carga: null,
      descanso_seg: null,
      nota: i === 0 ? 'Arrancá suave los primeros 2 minutos' : null,
      union_siguiente: i + 1 < bloques ? 'circuito' : null,
      alternativas: [],
      cambio: null,
    };
  });
}
