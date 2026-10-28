import { DEFAULT_API_URL } from '../constants/api';

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

// Todas las llamadas van a un único endpoint con `action`, igual que TimbreWeb
export async function api<T = any>(
  action: string,
  params: Record<string, unknown> = {},
  token?: string | null,
): Promise<T> {
  const res = await fetch(DEFAULT_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ action, ...params }),
  });
  let data: any;
  try {
    data = await res.json();
  } catch {
    throw new ApiError('El servidor no respondió bien', res.status);
  }
  if (!data.ok) throw new ApiError(data.error || 'Error desconocido', res.status);
  return data as T;
}

// ─── Tipos que devuelve la API ───────────────────────────────────────────────
export interface Usuario { id: number; nombre: string; email: string; superadmin?: boolean }
// individual: el espacio de cada uno para entrenar solo (sin código, horarios ni asistencia)
export interface Grupo { id: number; nombre: string; gym: string; codigo_invitacion: string; rol: 'coach' | 'miembro'; individual?: boolean }
export interface Nivel {
  temporada: string;
  puntos: number;
  nivel: string;
  siguiente: { nombre: string; faltan: number } | null;
  por_grupo: { grupo_id: number; puntos: number }[];
}
export interface Alternativa { plan_ejercicio_id: number; ejercicio_id: number; nombre: string; equipo: string }
export interface EjercicioRutina {
  plan_ejercicio_id: number;
  ejercicio_id: number;
  nombre: string;
  musculo_principal: string;
  equipo: string;
  series: number;
  repeticiones: string;
  peso_sugerido: string | null;
  carga: Carga | null;
  descanso_seg: number | null;
  nota: string | null;
  union_siguiente: Union | null; // superserie o circuito con el ejercicio que sigue
  alternativas: Alternativa[];
  cambio: (Alternativa & { elegido_por: string }) | null;
}
export interface Confirmacion { usuario_id: number; nombre: string; va: number | null; asistio: number | null; nota: string | null }
export interface Encuentro {
  id: number;
  grupo_id: number;
  fecha_hora: string;
  fecha_original: string | null; // si el coach lo movió
  dia: { id: number; nombre: string } | null;
  rutina: EjercicioRutina[];
  confirmaciones: Confirmacion[];
}
// Quién del grupo entrenó por su cuenta en la última semana
export interface PorSuCuenta { usuario_id: number; nombre: string; fecha: string; dia: string | null }
export interface Objetivo {
  nivel: string;
  objetivo: string | null;
  necesitas: number;
  quedan: number;
  llegas?: boolean;
  texto: string;
}

export const EQUIPO: Record<string, string> = {
  maquina: 'máquina',
  mancuerna: 'mancuernas',
  barra: 'barra',
  polea: 'polea',
  peso_corporal: 'peso corporal',
  otro: 'otro',
};

export type Carga = 'liviano' | 'moderado' | 'pesado';
export const CARGAS: Carga[] = ['liviano', 'moderado', 'pesado'];
export type Union = 'superserie' | 'circuito';
export const UNIONES: Union[] = ['superserie', 'circuito'];

// 90 → "1'30''"
export function textoPausa(seg: number) {
  const m = Math.floor(seg / 60);
  const s = seg % 60;
  return m ? `${m}'${s ? `${String(s).padStart(2, '0')}''` : ''}` : `${s}''`;
}

// Un ejercicio "por tiempo" (entrada en calor de 6 min) no lleva series de repeticiones
export const esPorTiempo = (repeticiones: string) => /min|'/i.test(repeticiones);

// "4 × 10 · pesado · pausa 2'" para mostrar debajo del nombre
export function resumenEjercicio(e: Pick<EjercicioRutina, 'series' | 'repeticiones' | 'peso_sugerido' | 'carga' | 'descanso_seg'>) {
  const partes = [esPorTiempo(e.repeticiones) ? e.repeticiones : `${e.series} × ${e.repeticiones}`];
  if (e.peso_sugerido) partes.push(`${Number(e.peso_sugerido)} kg`);
  if (e.carga) partes.push(e.carga);
  if (e.descanso_seg) partes.push(`pausa ${textoPausa(e.descanso_seg)}`);
  return partes.join(' · ');
}

export interface Ejercicio {
  id: number;
  grupo_id: number | null;
  nombre: string;
  musculo_principal: string;
  musculos_secundarios: string;
  equipo: string;
  movimiento: string;
}

export interface PlanDia { id: number; orden: number; nombre: string; ejercicios: EjercicioRutina[] }
export interface Plan { id: number; nombre: string; activo: number; vence: string | null; dias: PlanDia[] }
export interface PlanResumen { id: number; nombre: string; activo: number; vence: string | null }

// Días hasta que vence el plan ("2026-11-30"); negativo si ya venció
export function diasParaVencer(vence: string) {
  const [a, m, d] = vence.split('-').map(Number);
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  return Math.round((new Date(a, m - 1, d).getTime() - hoy.getTime()) / 86400000);
}

export function textoVence(vence: string) {
  const dias = diasParaVencer(vence);
  const [, m, d] = vence.split('-');
  if (dias < 0) return `Venció el ${Number(d)}/${Number(m)}`;
  if (dias === 0) return 'Vence hoy';
  return `Vence el ${Number(d)}/${Number(m)} (${dias === 1 ? 'falta 1 día' : `faltan ${dias} días`})`;
}
export interface Propuesta { id: number; texto: string; estado: 'pendiente' | 'aceptada' | 'rechazada'; created_at: string; autor: string }
