import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { api, Grupo, Nivel, Usuario } from '../lib/api';

interface Sesion {
  loaded: boolean;
  token: string | null;
  usuario: Usuario | null;
  grupos: Grupo[];
  nivel: Nivel | null;
  grupoId: number | null;
  grupo: Grupo | null;
  entrar: (token: string) => Promise<void>;
  salir: () => Promise<void>;
  elegirGrupo: (id: number) => Promise<void>;
  recargar: () => Promise<void>;
}

const STORAGE_KEY = 'cuerpro_sesion';
const SesionContext = createContext<Sesion | null>(null);

export function SesionProvider({ children }: { children: ReactNode }) {
  const [loaded, setLoaded] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [grupoId, setGrupoId] = useState<number | null>(null);
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [nivel, setNivel] = useState<Nivel | null>(null);

  const guardar = (next: { token: string | null; grupoId: number | null }) =>
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));

  const cargarDatos = useCallback(async (t: string, preferido: number | null) => {
    try {
      const data = await api<{ usuario: Usuario; grupos: Grupo[]; nivel: Nivel }>('yo', {}, t);
      setUsuario(data.usuario);
      setGrupos(data.grupos);
      setNivel(data.nivel);
      // Si no eligió nada, arranca en su primer grupo de verdad; si no tiene, en su Individual
      const elegido = data.grupos.find(g => g.id === preferido) ?? data.grupos.find(g => !g.individual) ?? data.grupos[0] ?? null;
      setGrupoId(elegido?.id ?? null);
    } catch (e: any) {
      // Sesión vencida: volver a la pantalla de entrada
      if (e.status === 401) {
        setToken(null);
        await guardar({ token: null, grupoId: null });
      }
    }
  }, []);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then(async raw => {
      if (raw) {
        try {
          const saved = JSON.parse(raw);
          if (saved.token) {
            setToken(saved.token);
            await cargarDatos(saved.token, saved.grupoId ?? null);
          }
        } catch {}
      }
      setLoaded(true);
    });
  }, [cargarDatos]);

  const entrar = async (t: string) => {
    setToken(t);
    await guardar({ token: t, grupoId: null });
    await cargarDatos(t, null);
  };

  const salir = async () => {
    if (token) api('logout', {}, token).catch(() => {});
    setToken(null);
    setUsuario(null);
    setGrupos([]);
    setNivel(null);
    setGrupoId(null);
    await guardar({ token: null, grupoId: null });
  };

  const elegirGrupo = async (id: number) => {
    setGrupoId(id);
    await guardar({ token, grupoId: id });
  };

  const recargar = async () => {
    if (token) await cargarDatos(token, grupoId);
  };

  const grupo = grupos.find(g => g.id === grupoId) ?? null;

  return (
    <SesionContext.Provider
      value={{ loaded, token, usuario, grupos, nivel, grupoId, grupo, entrar, salir, elegirGrupo, recargar }}
    >
      {children}
    </SesionContext.Provider>
  );
}

export function useSesion() {
  const ctx = useContext(SesionContext);
  if (!ctx) throw new Error('useSesion tiene que usarse dentro de SesionProvider');
  return ctx;
}
