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
export interface Usuario { id: number; nombre: string; email: string }
export interface Grupo { id: number; nombre: string; gym: string; codigo_invitacion: string; rol: 'coach' | 'miembro' }
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
  alternativas: Alternativa[];
  cambio: (Alternativa & { elegido_por: string }) | null;
}
export interface Confirmacion { usuario_id: number; nombre: string; va: number | null; asistio: number | null }
export interface Encuentro {
  id: number;
  grupo_id: number;
  fecha_hora: string;
  dia: { id: number; nombre: string } | null;
  rutina: EjercicioRutina[];
  confirmaciones: Confirmacion[];
}
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
export interface Plan { id: number; nombre: string; dias: PlanDia[] }
export interface Propuesta { id: number; texto: string; estado: 'pendiente' | 'aceptada' | 'rechazada'; created_at: string; autor: string }
