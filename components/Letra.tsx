/**
 * Tamaño de letra de toda la app: Normal, Mediana o Grande.
 * `Text` de este archivo reemplaza al de react-native y multiplica fontSize y
 * lineHeight por la escala elegida. Se guarda en el teléfono (cuerpro_letra).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { Text as TextoNativo, TextProps, StyleSheet } from 'react-native';

const CLAVE = 'cuerpro_letra';
const TAMANO_BASE = 14; // el de react-native cuando no se indica

export const TAMANOS = [
  { escala: 1, nombre: 'Normal' },
  { escala: 1.2, nombre: 'Mediana' },
  { escala: 1.4, nombre: 'Grande' },
];

const LetraContext = createContext<{ escala: number; elegir: (escala: number) => void }>({
  escala: 1,
  elegir: () => {},
});
// Un Text dentro de otro hereda el tamaño ya escalado del de afuera
const AdentroDeTexto = createContext(false);

export function LetraProvider({ children }: { children: ReactNode }) {
  const [escala, setEscala] = useState(1);

  useEffect(() => {
    AsyncStorage.getItem(CLAVE).then(v => {
      const n = Number(v);
      if (TAMANOS.some(t => t.escala === n)) setEscala(n);
    }).catch(() => {});
  }, []);

  const elegir = useCallback((n: number) => {
    setEscala(n);
    AsyncStorage.setItem(CLAVE, String(n)).catch(() => {});
  }, []);

  return <LetraContext.Provider value={{ escala, elegir }}>{children}</LetraContext.Provider>;
}

export function useLetra() {
  const { escala, elegir } = useContext(LetraContext);
  const i = Math.max(0, TAMANOS.findIndex(t => t.escala === escala));
  return {
    escala,
    elegir,
    nombre: TAMANOS[i].nombre,
    siguiente: () => elegir(TAMANOS[(i + 1) % TAMANOS.length].escala),
    /** Para tamaños fuera de un Text (íconos, TextInput, pestañas) */
    tam: (n: number) => Math.round(n * escala),
  };
}

export function Text({ style, ...props }: TextProps) {
  const { escala } = useContext(LetraContext);
  const adentro = useContext(AdentroDeTexto);
  let estilo = style;
  if (escala !== 1) {
    const plano = StyleSheet.flatten(style) ?? {};
    const extra: { fontSize?: number; lineHeight?: number } = {};
    if (plano.fontSize) extra.fontSize = plano.fontSize * escala;
    else if (!adentro) extra.fontSize = TAMANO_BASE * escala;
    if (plano.lineHeight) extra.lineHeight = plano.lineHeight * escala;
    estilo = [style, extra];
  }
  const texto = <TextoNativo {...props} style={estilo} />;
  return adentro ? texto : <AdentroDeTexto.Provider value>{texto}</AdentroDeTexto.Provider>;
}
