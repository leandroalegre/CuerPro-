import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { api, Recuperacion } from '../lib/api';
import { useSesion } from './useSesion';

// Recuperación de tus músculos; se recarga cada vez que la pantalla vuelve a verse
export function useRecuperacion() {
  const { token } = useSesion();
  const [lista, setLista] = useState<Recuperacion[]>([]);

  const recargar = useCallback(async () => {
    if (!token) return;
    try {
      const d = await api<{ recuperacion: Recuperacion[] }>('recuperacion', {}, token);
      setLista(d.recuperacion);
    } catch {}
  }, [token]);

  useFocusEffect(useCallback(() => { recargar(); }, [recargar]));

  const de = (musculo: string) => lista.find(r => r.musculo === musculo) ?? null;
  // Los músculos de una lista de ejercicios que todavía no se recuperaron, sin repetir
  const deEjercicios = (ejercicios: { musculo_principal: string }[]) =>
    lista.filter(r => ejercicios.some(e => e.musculo_principal === r.musculo));
  return { lista, de, deEjercicios, recargar };
}
