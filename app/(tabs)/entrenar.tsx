/**
 * Pantalla ENTRENAR
 * - Rutina del día, ejercicio por ejercicio
 * - Anotar repeticiones y peso de cada serie
 * - "Máquina ocupada": elegir una alternativa (cambia para todo el grupo)
 */
import { useState } from 'react';
import { Alert, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Boton, Campo, Card, Etiqueta, pantalla, Texto, Titulo, Vacio } from '../../components/ui';
import { Colors, Spacing, Typography } from '../../constants/theme';
import { useEncuentro } from '../../hooks/useEncuentro';
import { useSesion } from '../../hooks/useSesion';
import { api, EjercicioRutina, EQUIPO } from '../../lib/api';

export default function EntrenarScreen() {
  const { encuentro, cargando, recargar } = useEncuentro();

  return (
    <ScrollView
      style={pantalla.scroll}
      contentContainerStyle={pantalla.contenido}
      refreshControl={<RefreshControl refreshing={cargando} onRefresh={recargar} tintColor={Colors.accent} />}
      keyboardShouldPersistTaps="handled"
    >
      {!encuentro?.rutina.length ? (
        <Vacio texto="No hay rutina para el próximo entrenamiento." />
      ) : (
        <>
          <Etiqueta>{encuentro.dia?.nombre}</Etiqueta>
          {encuentro.rutina.map(ej => (
            <EjercicioCard key={ej.plan_ejercicio_id} ej={ej} encuentroId={encuentro.id} onCambio={recargar} />
          ))}
        </>
      )}
    </ScrollView>
  );
}

function EjercicioCard({
  ej,
  encuentroId,
  onCambio,
}: {
  ej: EjercicioRutina;
  encuentroId: number;
  onCambio: () => void;
}) {
  const { token } = useSesion();
  const [verAlternativas, setVerAlternativas] = useState(false);
  const [reps, setReps] = useState(String(ej.repeticiones).split('-')[0]);
  const [peso, setPeso] = useState(ej.peso_sugerido ? String(Number(ej.peso_sugerido)) : '');
  const [hechas, setHechas] = useState<{ reps: number; peso: number; record: boolean }[]>([]);
  const [guardando, setGuardando] = useState(false);

  const actual = ej.cambio ?? { ejercicio_id: ej.ejercicio_id, nombre: ej.nombre, equipo: ej.equipo };

  const elegir = async (ejercicioId: number) => {
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
        encuentro_id: encuentroId,
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
      {ej.cambio && <Texto muted>{`En lugar de ${ej.nombre} (lo cambió ${ej.cambio.elegido_por})`}</Texto>}
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
          <Texto muted>El cambio vale para todo el grupo.</Texto>
          {ej.cambio && <Boton titulo={`Volver a ${ej.nombre}`} tipo="secundario" onPress={() => elegir(ej.ejercicio_id)} />}
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
  fila: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'flex-start', marginTop: Spacing.md },
  campo: { flex: 1, minWidth: 0, marginBottom: 0 },
  boton: { width: 104, paddingVertical: 12 },
  serie: { ...Typography.body, color: Colors.success, marginTop: Spacing.xs },
});
