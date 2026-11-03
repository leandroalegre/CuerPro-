/**
 * Primeros pasos: la bienvenida se ve una vez por cuenta y después queda
 * una tarjeta en Hoy con lo que falta hacer, que se va tildando sola.
 * Se guarda en el servidor (inicio_guardar), así no vuelve a salir en otro
 * teléfono ni al reinstalar. La tarjeta se va al cerrarla o a la semana.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { Href, router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from './Letra';
import { Colors, Spacing, Typography } from '../constants/theme';
import { useSesion } from '../hooks/useSesion';
import { api } from '../lib/api';
import { Card } from './ui';

export type Camino = 'grupo' | 'solo';
interface Inicio { visto: boolean; camino: Camino | null; cerrado: boolean; desde?: string }
const DIAS_TARJETA = 7;
interface Pasos { grupos: number; miembros: number; plan: boolean; horarios: boolean; confirmo: boolean; entreno: boolean }

const clave = (usuarioId: number) => `cuerpro_inicio_${usuarioId}`;

export async function leerInicio(usuarioId: number): Promise<Inicio> {
  try {
    const raw = await AsyncStorage.getItem(clave(usuarioId));
    if (raw) return { visto: false, camino: null, cerrado: false, ...JSON.parse(raw) };
  } catch {}
  return { visto: false, camino: null, cerrado: false };
}

export async function guardarInicio(usuarioId: number, cambios: Partial<Inicio>, token: string | null) {
  const actual = await leerInicio(usuarioId);
  await AsyncStorage.setItem(clave(usuarioId), JSON.stringify({ ...actual, ...cambios })).catch(() => {});
  if (token) await api('inicio_guardar', { inicio: cambios }, token).catch(() => {});
}

function pasoLaSemana(desde?: string) {
  if (!desde) return false;
  return Date.now() - new Date(`${desde}T00:00:00`).getTime() > DIAS_TARJETA * 86400000;
}

interface Paso { texto: string; detalle: string; hecho: boolean; ir?: Href }

function armarPasos(camino: Camino, p: Pasos, esCoach: boolean, enIndividual: boolean): Paso[] {
  if (camino === 'solo') {
    return [
      { texto: 'Tu espacio Individual', detalle: 'Ya lo tenés: solo vos, con tu propio plan', hecho: true },
      { texto: 'Armá tu plan', detalle: 'Los días y ejercicios que vas a hacer', hecho: p.plan, ir: '/plan' },
      { texto: 'Entrená', detalle: 'En Entrenar elegí el día y anotá tu primera serie', hecho: p.entreno, ir: '/entrenar' },
    ];
  }
  const pasos: Paso[] = [
    { texto: 'Sumate a tu grupo', detalle: 'Con el código que te pasaron, o creá uno', hecho: p.grupos > 0, ir: '/grupos' },
  ];
  // Lo que sigue es del grupo: desde el Individual todavía no aplica
  if (enIndividual) return pasos;
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
  const { token, usuario, grupo, grupos, elegirGrupo } = useSesion();
  const [inicio, setInicio] = useState<Inicio | null>(null);
  const [pasos, setPasos] = useState<Pasos | null>(null);

  useFocusEffect(useCallback(() => {
    if (!token || !usuario) return;
    let vigente = true;
    (async () => {
      const local = await leerInicio(usuario.id);
      let delServidor: Partial<Inicio> | null = null;
      try {
        const d = await api<{ pasos: Pasos; inicio: Partial<Inicio> | null }>('primeros_pasos', grupo ? { grupo_id: grupo.id } : {}, token);
        if (!vigente) return;
        setPasos(d.pasos);
        delServidor = d.inicio;
      } catch {}
      if (!vigente) return;
      const i: Inicio = { ...local, ...(delServidor ?? {}) };
      // Lo que se vio en este teléfono antes de guardarse en el servidor también cuenta
      if (local.visto && !delServidor?.visto) {
        i.visto = true;
        guardarInicio(usuario.id, { visto: true, camino: local.camino, cerrado: local.cerrado }, token);
      }
      setInicio(i);
      // La primera vez, la bienvenida
      if (!i.visto) router.push('/bienvenida');
    })();
    return () => { vigente = false; };
  }, [token, usuario?.id, grupo?.id]));

  if (!usuario || !inicio?.visto || inicio.cerrado || pasoLaSemana(inicio.desde) || !pasos) return null;
  // Mirando un grupo de verdad, los pasos son los del grupo aunque haya elegido entrenar solo
  const enIndividual = !!grupo?.individual;
  const camino: Camino = !enIndividual ? 'grupo' : inicio.camino ?? (pasos.grupos ? 'grupo' : 'solo');
  if (enIndividual && camino === 'grupo' && pasos.grupos > 0) return null;
  const lista = armarPasos(camino, pasos, grupo?.rol === 'coach', enIndividual);
  const hechos = lista.filter(p => p.hecho).length;
  if (hechos === lista.length) return null;

  const cerrar = async () => {
    await guardarInicio(usuario.id, { cerrado: true }, token);
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
      {enIndividual ? (
        <TouchableOpacity onPress={() => router.push('/bienvenida')}>
          <Text style={styles.cambiar}>{camino === 'solo' ? '¿Entrenás con amigos? Cambiá a "en grupo"' : '¿Entrenás solo? Cambiá el camino'}</Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity onPress={() => { const ind = grupos.find(g => g.individual); if (ind) elegirGrupo(ind.id); }}>
          <Text style={styles.cambiar}>¿También entrenás solo? Pasá a tu Individual</Text>
        </TouchableOpacity>
      )}
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
