/**
 * Primeros pasos: la bienvenida se ve una vez por usuario y después queda
 * una tarjeta en Hoy con lo que falta hacer, que se va tildando sola.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { Href, router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Colors, Spacing, Typography } from '../constants/theme';
import { useSesion } from '../hooks/useSesion';
import { api } from '../lib/api';
import { Card } from './ui';

export type Camino = 'grupo' | 'solo';
interface Inicio { visto: boolean; camino: Camino | null; cerrado: boolean }
interface Pasos { grupos: number; miembros: number; plan: boolean; horarios: boolean; confirmo: boolean; entreno: boolean }

const clave = (usuarioId: number) => `cuerpro_inicio_${usuarioId}`;

export async function leerInicio(usuarioId: number): Promise<Inicio> {
  try {
    const raw = await AsyncStorage.getItem(clave(usuarioId));
    if (raw) return { visto: false, camino: null, cerrado: false, ...JSON.parse(raw) };
  } catch {}
  return { visto: false, camino: null, cerrado: false };
}

export async function guardarInicio(usuarioId: number, cambios: Partial<Inicio>) {
  const actual = await leerInicio(usuarioId);
  await AsyncStorage.setItem(clave(usuarioId), JSON.stringify({ ...actual, ...cambios })).catch(() => {});
}

interface Paso { texto: string; detalle: string; hecho: boolean; ir?: Href }

function armarPasos(camino: Camino, p: Pasos, esCoach: boolean): Paso[] {
  if (camino === 'solo') {
    return [
      { texto: 'Creá tu espacio', detalle: 'Un grupo donde estás solo vos', hecho: p.grupos > 0, ir: '/grupos' },
      { texto: 'Armá tu plan', detalle: 'Los días y ejercicios que vas a hacer', hecho: p.plan, ir: '/plan' },
      { texto: 'Entrená', detalle: 'En Entrenar → "Por mi cuenta", anotá tu primera serie', hecho: p.entreno, ir: '/entrenar' },
    ];
  }
  const pasos: Paso[] = [
    { texto: 'Sumate a tu grupo', detalle: 'Con el código que te pasaron, o creá uno', hecho: p.grupos > 0, ir: '/grupos' },
  ];
  if (esCoach) {
    pasos.push(
      { texto: 'Invitá a tus amigos', detalle: 'Mandales el código por WhatsApp desde Grupos', hecho: p.miembros > 1, ir: '/grupos' },
      { texto: 'Armá el plan del grupo', detalle: 'Los días y ejercicios que van a hacer', hecho: p.plan, ir: '/plan' },
      { texto: 'Cargá los días y horarios', detalle: 'En Grupos, cada día con su hora', hecho: p.horarios, ir: '/grupos' },
    );
  } else {
    pasos.push({ texto: 'Mirá el plan', detalle: p.plan ? 'Ya está armado, chusmealo en Plan' : 'El coach todavía lo está armando', hecho: p.plan, ir: '/plan' });
  }
  pasos.push(
    { texto: 'Decí "Voy"', detalle: 'En Hoy, para el próximo entrenamiento', hecho: p.confirmo },
    { texto: 'Entrená y anotá tu primera serie', detalle: 'En Entrenar, con el peso y las repeticiones', hecho: p.entreno, ir: '/entrenar' },
  );
  return pasos;
}

export function PrimerosPasos() {
  const { token, usuario, grupo } = useSesion();
  const [inicio, setInicio] = useState<Inicio | null>(null);
  const [pasos, setPasos] = useState<Pasos | null>(null);

  useFocusEffect(useCallback(() => {
    if (!token || !usuario) return;
    leerInicio(usuario.id).then(i => {
      setInicio(i);
      // La primera vez, la bienvenida
      if (!i.visto) router.push('/bienvenida');
    });
    api<{ pasos: Pasos }>('primeros_pasos', grupo ? { grupo_id: grupo.id } : {}, token)
      .then(d => setPasos(d.pasos))
      .catch(() => {});
  }, [token, usuario?.id, grupo?.id]));

  if (!usuario || !inicio?.visto || inicio.cerrado || !pasos) return null;
  const camino: Camino = inicio.camino ?? (grupo && pasos.miembros <= 1 ? 'solo' : 'grupo');
  const lista = armarPasos(camino, pasos, grupo?.rol === 'coach');
  const hechos = lista.filter(p => p.hecho).length;
  if (hechos === lista.length) return null;

  const cerrar = async () => {
    await guardarInicio(usuario.id, { cerrado: true });
    setInicio({ ...inicio, cerrado: true });
  };

  return (
    <Card style={{ borderColor: Colors.accent }}>
      <View style={styles.cabecera}>
        <View style={{ flex: 1 }}>
          <Text style={styles.titulo}>Primeros pasos</Text>
          <Text style={styles.sub}>{`${hechos} de ${lista.length} · ${camino === 'solo' ? 'entrenando solo' : 'entrenando en grupo'}`}</Text>
        </View>
        <TouchableOpacity onPress={cerrar} hitSlop={10} accessibilityLabel="Ocultar primeros pasos">
          <Ionicons name="close" size={20} color={Colors.textMuted} />
        </TouchableOpacity>
      </View>
      <View style={styles.barra}>
        <View style={[styles.relleno, { width: `${(hechos / lista.length) * 100}%` }]} />
      </View>
      {lista.map((p, i) => (
        <TouchableOpacity
          key={p.texto}
          style={styles.paso}
          disabled={p.hecho || !p.ir}
          onPress={() => p.ir && router.push(p.ir)}
        >
          <Ionicons
            name={p.hecho ? 'checkmark-circle' : 'ellipse-outline'}
            size={22}
            color={p.hecho ? Colors.success : i === lista.findIndex(x => !x.hecho) ? Colors.accent : Colors.textMuted}
          />
          <View style={{ flex: 1 }}>
            <Text style={[styles.pasoTexto, p.hecho && styles.tachado]}>{p.texto}</Text>
            {!p.hecho && <Text style={styles.sub}>{p.detalle}</Text>}
          </View>
          {!p.hecho && !!p.ir && <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />}
        </TouchableOpacity>
      ))}
      <TouchableOpacity onPress={() => router.push('/bienvenida')}>
        <Text style={styles.cambiar}>{camino === 'solo' ? '¿Entrenás con amigos? Cambiá a "en grupo"' : '¿Entrenás solo? Cambiá el camino'}</Text>
      </TouchableOpacity>
    </Card>
  );
}

const styles = StyleSheet.create({
  cabecera: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
  titulo: { ...Typography.titleMd, color: Colors.textPrimary },
  sub: { ...Typography.caption, color: Colors.textSecondary, marginTop: 2 },
  barra: { height: 6, borderRadius: 3, backgroundColor: Colors.bgMuted, marginVertical: Spacing.sm, overflow: 'hidden' },
  relleno: { height: 6, backgroundColor: Colors.accent },
  paso: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: 8 },
  pasoTexto: { ...Typography.body, color: Colors.textPrimary },
  tachado: { color: Colors.textMuted, textDecorationLine: 'line-through' },
  cambiar: { ...Typography.caption, color: Colors.accent, marginTop: Spacing.sm },
});
