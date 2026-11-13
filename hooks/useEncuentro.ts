import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { api, Encuentro, Objetivo, PorSuCuenta } from '../lib/api';
import { useSesion } from './useSesion';

// Próximo encuentro del grupo elegido; se recarga cada vez que la pantalla vuelve a verse
export function useEncuentro() {
  const { token, grupoId } = useSesion();
  const [encuentro, setEncuentro] = useState<Encuentro | null>(null);
  const [objetivo, setObjetivo] = useState<Objetivo | null>(null);
  const [porSuCuenta, setPorSuCuenta] = useState<PorSuCuenta[]>([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const recargar = useCallback(async () => {
    if (!token || !grupoId) {
      setEncuentro(null);
      setObjetivo(null);
      setPorSuCuenta([]);
      return;
    }
    setCargando(true);
    try {
      const data = await api<{ encuentro: Encuentro | null; objetivo: Objetivo | null; por_su_cuenta?: PorSuCuenta[] }>(
        'encuentro_proximo',
        { grupo_id: grupoId },
        token,
      );
      setEncuentro(data.encuentro);
      setObjetivo(data.objetivo);
      setPorSuCuenta(data.por_su_cuenta ?? []);
      setError(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setCargando(false);
    }
  }, [token, grupoId]);

  useFocusEffect(
    useCallback(() => {
      recargar();
    }, [recargar]),
  );

  return { encuentro, objetivo, porSuCuenta, cargando, error, recargar };
}

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

export function fechaLinda(fechaHora: string) {
  const [fecha, hora] = fechaHora.split(' ');
  const [y, m, d] = fecha.split('-').map(Number);
  const dia = new Date(y, m - 1, d);
  return `${DIAS[dia.getDay()]} ${d}/${m} a las ${hora.slice(0, 5)}`;
}
