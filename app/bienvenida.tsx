/**
 * BIENVENIDA (se ve una vez, al entrar por primera vez)
 * 1. Qué es CuerPro
 * 2. ¿Entrenás solo o en grupo?
 * 3. Los primeros pasos de ese camino y a dónde ir
 */
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Camino, guardarInicio } from '../components/PrimerosPasos';
import { Boton } from '../components/ui';
import { ESLOGAN } from '../constants/app';
import { Colors, Radius, Spacing, Typography } from '../constants/theme';
import { useSesion } from '../hooks/useSesion';

const PASOS: Record<Camino, { icono: keyof typeof Ionicons.glyphMap; texto: string }[]> = {
  grupo: [
    { icono: 'people', texto: 'Sumate con el código que te pasó el coach, o creá el grupo e invitá a tus amigos.' },
    { icono: 'list', texto: 'En Plan está la rutina del grupo: los días y los ejercicios.' },
    { icono: 'calendar', texto: 'En Hoy ves el próximo entrenamiento y decís "Voy" o "No voy".' },
    { icono: 'barbell', texto: 'En el gym, abrí Entrenar y anotá cada serie con su peso.' },
    { icono: 'trophy', texto: 'Sumás puntos por ir y por superar tus marcas, y subís de nivel cada mes.' },
  ],
  solo: [
    { icono: 'person', texto: 'Ya tenés tu espacio Individual: solo vos, con tu propio plan.' },
    { icono: 'list', texto: 'Armás tu plan en Plan: los días y los ejercicios.' },
    { icono: 'barbell', texto: 'En Entrenar elegís el día del plan y anotás cada serie, cuando quieras.' },
    { icono: 'trophy', texto: 'Ves tu progreso, tus récords y tu nivel del mes.' },
    { icono: 'people', texto: 'Si después querés entrenar con amigos, creás un grupo en Grupos. Arriba cambiás entre Individual y tus grupos.' },
  ],
};

export default function BienvenidaScreen() {
  const { usuario, grupos, elegirGrupo } = useSesion();
  const [paso, setPaso] = useState(0);
  const [camino, setCamino] = useState<Camino | null>(null);
  const individual = grupos.find(g => g.individual);
  const deVerdad = grupos.filter(g => !g.individual);

  const terminar = async (destino: '/' | '/grupos' | '/plan') => {
    if (usuario) await guardarInicio(usuario.id, { visto: true, camino, cerrado: false });
    router.replace(destino);
  };

  const empezar = async () => {
    if (camino === 'grupo') return terminar(deVerdad.length ? '/' : '/grupos');
    // Solo: al Individual (ya existe desde el registro) a armar el plan
    if (individual) await elegirGrupo(individual.id);
    terminar('/plan');
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.bg }}>
      <ScrollView contentContainerStyle={styles.contenido}>
        <View style={styles.puntos}>
          {[0, 1, 2].map(i => <View key={i} style={[styles.punto, i === paso && styles.puntoActivo]} />)}
        </View>

        {paso === 0 && (
          <>
            <Image source={require('../assets/images/logo.png')} style={styles.logo} resizeMode="contain" accessibilityLabel="CuerPro" />
            <Text style={styles.titulo}>{`¡Hola${usuario ? `, ${usuario.nombre.split(' ')[0]}` : ''}!`}</Text>
            <Text style={styles.texto}>
              CuerPro te dice qué toca entrenar hoy, quién va al gym y cuánto vas mejorando. {ESLOGAN}
            </Text>
            <Boton titulo="Empezar" onPress={() => setPaso(1)} style={{ marginTop: Spacing.lg }} />
          </>
        )}

        {paso === 1 && (
          <>
            <Text style={styles.titulo}>¿Cómo vas a entrenar?</Text>
            <Text style={styles.texto}>Podés cambiarlo cuando quieras.</Text>
            {([
              ['grupo', 'people', 'Con mi grupo', 'Entrenamos juntos en el mismo gym, con un plan y horarios.'],
              ['solo', 'person', 'Solo', 'Armo mi propio plan y entreno cuando puedo.'],
            ] as const).map(([valor, icono, titulo, detalle]) => (
              <TouchableOpacity
                key={valor}
                style={[styles.opcion, camino === valor && styles.opcionActiva]}
                onPress={() => setCamino(valor)}
              >
                <Ionicons name={icono} size={28} color={camino === valor ? Colors.accent : Colors.textSecondary} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.opcionTitulo}>{titulo}</Text>
                  <Text style={styles.opcionDetalle}>{detalle}</Text>
                </View>
              </TouchableOpacity>
            ))}
            <Boton titulo="Seguir" onPress={() => setPaso(2)} disabled={!camino} style={{ marginTop: Spacing.md }} />
          </>
        )}

        {paso === 2 && camino && (
          <>
            <Text style={styles.titulo}>{camino === 'grupo' ? 'Así se usa en grupo' : 'Así se usa solo'}</Text>
            {PASOS[camino].map((p, i) => (
              <View key={i} style={styles.fila}>
                <View style={styles.numero}><Ionicons name={p.icono} size={18} color={Colors.accent} /></View>
                <Text style={styles.filaTexto}>{p.texto}</Text>
              </View>
            ))}
            <Text style={[styles.texto, { marginTop: Spacing.md }]}>
              En Hoy te va a quedar una tarjeta de "Primeros pasos" que se tilda sola a medida que avanzás.
            </Text>
            <Boton
              titulo={camino === 'grupo' ? (deVerdad.length ? 'Ir a Hoy' : 'Sumarme o crear el grupo') : 'Armar mi plan'}
              onPress={empezar}
              style={{ marginTop: Spacing.md }}
            />
          </>
        )}

        <View style={styles.pie}>
          {paso > 0 && (
            <TouchableOpacity onPress={() => setPaso(paso - 1)}>
              <Text style={styles.link}>Atrás</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={() => terminar('/')} style={{ marginLeft: 'auto' }}>
            <Text style={styles.link}>Saltar</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  contenido: { flexGrow: 1, justifyContent: 'center', padding: Spacing.lg },
  puntos: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginBottom: Spacing.lg },
  punto: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.bgMuted },
  puntoActivo: { width: 24, backgroundColor: Colors.accent },
  logo: { width: 240, height: 86, alignSelf: 'center', marginBottom: Spacing.md },
  titulo: { ...Typography.titleLg, fontSize: 26, color: Colors.textPrimary, marginBottom: Spacing.sm },
  texto: { ...Typography.body, color: Colors.textSecondary, lineHeight: 22 },
  opcion: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.md, marginTop: Spacing.md,
    borderRadius: Radius.lg, borderWidth: 2, borderColor: Colors.border, backgroundColor: Colors.bgCard,
  },
  opcionActiva: { borderColor: Colors.accent },
  opcionTitulo: { ...Typography.titleMd, color: Colors.textPrimary },
  opcionDetalle: { ...Typography.caption, color: Colors.textSecondary, marginTop: 2 },
  fila: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, marginTop: Spacing.md },
  numero: {
    width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.bgMuted,
  },
  filaTexto: { ...Typography.body, color: Colors.textPrimary, flex: 1, lineHeight: 22 },
  pie: { flexDirection: 'row', marginTop: Spacing.xl },
  link: { ...Typography.body, color: Colors.textSecondary },
});
