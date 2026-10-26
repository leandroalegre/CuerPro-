/**
 * Pantalla ENTRENAR
 * - Rutina del día, ejercicio por ejercicio
 * - Anotar repeticiones y peso de cada serie
 * - "Máquina ocupada": elegir una alternativa (cambia para todo el grupo)
 * - Por mi cuenta: cualquier día del plan, fuera del encuentro; las series y
 *   los récords cuentan igual, la asistencia no
 */
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Boton, Campo, Card, Etiqueta, pantalla, Texto, Titulo, Vacio } from '../../components/ui';
import { Colors, Radius, Spacing, Typography } from '../../constants/theme';
import { useEncuentro } from '../../hooks/useEncuentro';
import { useSesion } from '../../hooks/useSesion';
import { api, EjercicioRutina, EQUIPO, Plan } from '../../lib/api';

export default function EntrenarScreen() {
  const { token, grupo } = useSesion();
  const { encuentro, cargando, recargar } = useEncuentro();
  const params = useLocalSearchParams<{ modo?: string }>();
  const [solo, setSolo] = useState(false);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [diaId, setDiaId] = useState<number | null>(null);

  // Desde Hoy, "Entrenar por mi cuenta" llega con ?modo=solo
  useFocusEffect(useCallback(() => {
    if (params.modo === 'solo') setSolo(true);
  }, [params.modo]));

  const cargarPlan = useCallback(async () => {
    if (!token || !grupo) return;
    try {
      const data = await api<{ plan: Plan | null }>('plan', { grupo_id: grupo.id }, token);
      setPlan(data.plan);
      setDiaId(d => d ?? encuentro?.dia?.id ?? data.plan?.dias[0]?.id ?? null);
    } catch {}
  }, [token, grupo, encuentro?.dia?.id]);

  useFocusEffect(useCallback(() => {
    if (solo) cargarPlan();
  }, [solo, cargarPlan]));

  const dia = plan?.dias.find(d => d.id === diaId);

  return (
    <ScrollView
      style={pantalla.scroll}
      contentContainerStyle={pantalla.contenido}
      refreshControl={<RefreshControl refreshing={cargando} onRefresh={solo ? cargarPlan : recargar} tintColor={Colors.accent} />}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.modos}>
        <Modo texto="Con el grupo" activo={!solo} onPress={() => setSolo(false)} />
        <Modo texto="Por mi cuenta" activo={solo} onPress={() => setSolo(true)} />
      </View>

      {!solo && (!encuentro?.rutina.length ? (
        <Vacio texto="No hay rutina para el próximo entrenamiento del grupo. Podés entrenar por tu cuenta." />
      ) : (
        <>
          <Etiqueta>{encuentro.dia?.nombre}</Etiqueta>
          {encuentro.rutina.map(ej => (
            <EjercicioCard key={ej.plan_ejercicio_id} ej={ej} encuentroId={encuentro.id} onCambio={recargar} />
          ))}
        </>
      ))}

      {solo && (!grupo ? (
        <Vacio texto="Para entrenar por tu cuenta necesitás un plan: creá un grupo propio en Grupos (puede ser solo vos) y armalo en Plan." />
      ) : !plan?.dias.length ? (
        <Vacio texto="Tu grupo todavía no tiene plan. Cuando el coach lo arme, vas a poder entrenar cualquier día por tu cuenta." />
      ) : (
        <>
          <Texto muted>Elegí qué día del plan hacés. Tus series y récords suman igual.</Texto>
          <View style={styles.modos}>
            {plan.dias.map(d => (
              <Modo key={d.id} texto={d.nombre} activo={d.id === diaId} onPress={() => setDiaId(d.id)} />
            ))}
          </View>
          {dia?.ejercicios.map(ej => (
            <EjercicioCard key={`${dia.id}-${ej.plan_ejercicio_id}`} ej={ej} encuentroId={null} onCambio={() => {}} />
          ))}
        </>
      ))}
    </ScrollView>
  );
}

function Modo({ texto, activo, onPress }: { texto: string; activo: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity style={[styles.modo, activo && styles.modoActivo]} onPress={onPress}>
      <Text style={[styles.modoTexto, activo && { color: Colors.textInverse }]}>{texto}</Text>
    </TouchableOpacity>
  );
}

function EjercicioCard({
  ej,
  encuentroId,
  onCambio,
}: {
  ej: EjercicioRutina;
  encuentroId: number | null; // null: por mi cuenta
  onCambio: () => void;
}) {
  const { token } = useSesion();
  const [verAlternativas, setVerAlternativas] = useState(false);
  const [reps, setReps] = useState(String(ej.repeticiones).split('-')[0]);
  const [peso, setPeso] = useState(ej.peso_sugerido ? String(Number(ej.peso_sugerido)) : '');
  const [hechas, setHechas] = useState<{ reps: number; peso: number; record: boolean }[]>([]);
  const [guardando, setGuardando] = useState(false);

  // Por mi cuenta, la alternativa es solo para vos y no se guarda
  const [cambioPropio, setCambioPropio] = useState<number | null>(null);
  const propia = ej.alternativas.find(a => a.ejercicio_id === cambioPropio);

  const actual = propia ?? ej.cambio ?? { ejercicio_id: ej.ejercicio_id, nombre: ej.nombre, equipo: ej.equipo };

  const elegir = async (ejercicioId: number) => {
    if (encuentroId === null) {
      setCambioPropio(ejercicioId === ej.ejercicio_id ? null : ejercicioId);
      setVerAlternativas(false);
      return;
    }
    try {
      await api('alternativa_elegir', { encuentro_id: encuentroId, plan_ejercicio_id: ej.plan_ejercicio_id, ejercicio_id: ejercicioId }, token);
      setVerAlternativas(false);
      onCambio();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  const guardarSerie = async () => {
    const r = Number(reps);
    const p = Number(peso.replace(',', '.') || 0);
    if (!r) {
      Alert.alert('Faltan las repeticiones');
      return;
    }
    setGuardando(true);
    try {
      const data = await api<{ record: boolean }>('serie_guardar', {
        ...(encuentroId !== null && { encuentro_id: encuentroId }),
        ejercicio_id: actual.ejercicio_id,
        numero: hechas.length + 1,
        repeticiones: r,
        peso: p,
      }, token);
      setHechas([...hechas, { reps: r, peso: p, record: data.record }]);
      if (data.record) Alert.alert('¡Récord personal!', `Sumaste 15 puntos con ${p} kg.`);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Card>
      <Titulo>{actual.nombre}</Titulo>
      {propia ? (
        <Texto muted>{`En lugar de ${ej.nombre}`}</Texto>
      ) : ej.cambio && <Texto muted>{`En lugar de ${ej.nombre} (lo cambió ${ej.cambio.elegido_por})`}</Texto>}
      <Texto muted>{`${ej.series} series de ${ej.repeticiones} · ${ej.musculo_principal}`}</Texto>

      {hechas.map((s, i) => (
        <Text key={i} style={styles.serie}>
          {`Serie ${i + 1}: ${s.reps} reps × ${s.peso} kg${s.record ? '  🏆' : ''}`}
        </Text>
      ))}

      {hechas.length < ej.series && (
        <View style={styles.fila}>
          <Campo style={styles.campo} value={reps} onChangeText={setReps} keyboardType="number-pad" placeholder="Reps" />
          <Campo style={styles.campo} value={peso} onChangeText={setPeso} keyboardType="decimal-pad" placeholder="Kg" />
          <Boton titulo={`Serie ${hechas.length + 1}`} onPress={guardarSerie} cargando={guardando} style={styles.boton} />
        </View>
      )}

      {(ej.alternativas.length > 0 || ej.cambio) && (
        <Boton
          titulo={verAlternativas ? 'Cerrar' : 'Máquina ocupada'}
          tipo="secundario"
          onPress={() => setVerAlternativas(!verAlternativas)}
          style={{ marginTop: Spacing.sm }}
        />
      )}
      {verAlternativas && (
        <View style={{ marginTop: Spacing.sm, gap: Spacing.sm }}>
          <Texto muted>{encuentroId === null ? 'El cambio es solo para vos.' : 'El cambio vale para todo el grupo.'}</Texto>
          {actual.ejercicio_id !== ej.ejercicio_id && (
            <Boton titulo={`Volver a ${ej.nombre}`} tipo="secundario" onPress={() => elegir(ej.ejercicio_id)} />
          )}
          {ej.alternativas
            .filter(a => a.ejercicio_id !== actual.ejercicio_id)
            .map(a => (
              <Boton key={a.ejercicio_id} titulo={`${a.nombre} (${EQUIPO[a.equipo] ?? a.equipo})`} tipo="secundario" onPress={() => elegir(a.ejercicio_id)} />
            ))}
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  modos: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs, marginBottom: Spacing.md },
  modo: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: Radius.full, backgroundColor: Colors.bgMuted },
  modoActivo: { backgroundColor: Colors.accent },
  modoTexto: { ...Typography.label, color: Colors.textPrimary },
  fila: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'flex-start', marginTop: Spacing.md },
  campo: { flex: 1, minWidth: 0, marginBottom: 0 },
  boton: { width: 104, paddingVertical: 12 },
  serie: { ...Typography.body, color: Colors.success, marginTop: Spacing.xs },
});
