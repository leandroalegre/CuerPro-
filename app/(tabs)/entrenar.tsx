/**
 * Pantalla ENTRENAR
 * - Rutina del día, ejercicio por ejercicio
 * - Anotar repeticiones y peso de cada serie
 * - "Máquina ocupada": elegir una alternativa (cambia para todo el grupo)
 * - Al anotar una serie arranca el descanso que puso el coach
 * - Cada uno puede arrastrar las tarjetas para hacer los ejercicios en otro orden
 * - Por mi cuenta: cualquier día del plan, fuera del encuentro; las series y
 *   los récords cuentan igual, la asistencia no
 */
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Alert, Platform, RefreshControl, StyleSheet, Text, TouchableOpacity, Vibration, View } from 'react-native';
import { NestableDraggableFlatList, NestableScrollContainer, ScaleDecorator } from 'react-native-draggable-flatlist';
import { Boton, Campo, Card, CardDestacada, Etiqueta, Insignia, pantalla, Texto, Titulo, Vacio } from '../../components/ui';
import { Colors, Radius, Spacing, Typography } from '../../constants/theme';
import { useEncuentro } from '../../hooks/useEncuentro';
import { useSesion } from '../../hooks/useSesion';
import { api, EjercicioRutina, EQUIPO, esPorTiempo, Plan, resumenEjercicio } from '../../lib/api';

export default function EntrenarScreen() {
  const { token, grupo } = useSesion();
  const { encuentro, cargando, recargar } = useEncuentro();
  const params = useLocalSearchParams<{ modo?: string }>();
  const [solo, setSolo] = useState(false);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [diaId, setDiaId] = useState<number | null>(null);
  const [historial, setHistorial] = useState<Historial | null>(null);

  // Desde Hoy, "Entrenar por mi cuenta" llega con ?modo=solo
  useFocusEffect(useCallback(() => {
    if (params.modo === 'solo') setSolo(true);
  }, [params.modo]));

  const cargarPlan = useCallback(async () => {
    if (!token || !grupo) return;
    try {
      const [data, hist] = await Promise.all([
        api<{ plan: Plan | null }>('plan', { grupo_id: grupo.id }, token),
        api<Historial>('mis_entrenamientos', { grupo_id: grupo.id }, token),
      ]);
      setPlan(data.plan);
      setHistorial(hist);
      setDiaId(d => d ?? hist.recomendado?.dia_id ?? data.plan?.dias[0]?.id ?? null);
    } catch {}
  }, [token, grupo, encuentro?.dia?.id]);

  useFocusEffect(useCallback(() => {
    if (solo) cargarPlan();
  }, [solo, cargarPlan]));

  const dia = plan?.dias.find(d => d.id === diaId);

  return (
    <NestableScrollContainer
      style={pantalla.scroll}
      contentContainerStyle={pantalla.contenido}
      refreshControl={<RefreshControl refreshing={cargando} onRefresh={solo ? cargarPlan : recargar} tintColor={Colors.accent} />}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.modos}>
        <Modo texto="Con el grupo" activo={!solo} onPress={() => setSolo(false)} />
        <Modo texto="Por mi cuenta" activo={solo} onPress={() => setSolo(true)} />
      </View>

      {!solo && (!encuentro ? (
        <Vacio texto="El grupo todavía no tiene días y horarios. El coach los carga en Grupos. Mientras, podés entrenar por tu cuenta." />
      ) : !encuentro.rutina.length ? (
        <Vacio texto="No hay rutina para el próximo entrenamiento del grupo. Podés entrenar por tu cuenta." />
      ) : (
        <>
          <CardDestacada>
            <Insignia texto="Toca hoy" />
            <Text style={styles.diaTitulo}>{encuentro.dia?.nombre}</Text>
            <Text style={styles.diaMeta}>{`${encuentro.rutina.length} ejercicios · arrastrá ≡ para cambiar el orden`}</Text>
          </CardDestacada>
          <ListaRutina rutina={encuentro.rutina} encuentroId={encuentro.id} onCambio={recargar} />
        </>
      ))}

      {solo && (!grupo ? (
        <Vacio texto="Para entrenar por tu cuenta necesitás un plan: creá un grupo propio en Grupos (puede ser solo vos) y armalo en Plan." />
      ) : !plan?.dias.length ? (
        <Vacio texto="Tu grupo todavía no tiene plan. Cuando el coach lo arme, vas a poder entrenar cualquier día por tu cuenta." />
      ) : (
        <>
          {!!historial?.entrenamientos.length && (
            <Card>
              <Etiqueta>Tus últimos entrenamientos</Etiqueta>
              {historial.entrenamientos.map(e => (
                <View key={e.fecha} style={styles.filaHistorial}>
                  <Text style={styles.fechaHistorial}>{fechaCorta(e.fecha)}</Text>
                  <Text style={styles.textoHistorial} numberOfLines={1}>{e.dia_nombre ?? e.musculos.join(', ')}</Text>
                </View>
              ))}
            </Card>
          )}
          {historial?.recomendado && (
            <CardDestacada>
              <Insignia texto="Te recomendamos" />
              <Text style={styles.diaTitulo}>{historial.recomendado.nombre}</Text>
              <Text style={styles.diaMeta}>{historial.recomendado.texto}</Text>
            </CardDestacada>
          )}
          <Texto muted>Elegí qué día del plan hacés. Tus series y récords suman igual.</Texto>
          <View style={styles.modos}>
            {plan.dias.map(d => (
              <Modo
                key={d.id}
                texto={d.id === historial?.recomendado?.dia_id ? `★ ${d.nombre}` : d.nombre}
                activo={d.id === diaId}
                onPress={() => setDiaId(d.id)}
              />
            ))}
          </View>
          {dia && <ListaRutina key={dia.id} rutina={dia.ejercicios} encuentroId={null} onCambio={() => {}} />}
        </>
      ))}
    </NestableScrollContainer>
  );
}

interface Historial {
  entrenamientos: { fecha: string; dia_id: number | null; dia_nombre: string | null; musculos: string[] }[];
  recomendado: { dia_id: number; nombre: string; texto: string } | null;
}

const DIAS_CORTOS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
// "2026-10-26" → "lun 26/10"
function fechaCorta(fecha: string) {
  const [a, m, d] = fecha.split('-').map(Number);
  return `${DIAS_CORTOS[new Date(a, m - 1, d).getDay()]} ${d}/${m}`;
}

function Modo({ texto, activo, onPress }: { texto: string; activo: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity style={[styles.modo, activo && styles.modoActivo]} onPress={onPress}>
      <Text style={[styles.modoTexto, activo && { color: Colors.textInverse }]}>{texto}</Text>
    </TouchableOpacity>
  );
}

// La rutina como tarjetas que se arrastran desde ≡; el orden es solo para vos
function ListaRutina({
  rutina,
  encuentroId,
  onCambio,
}: {
  rutina: EjercicioRutina[];
  encuentroId: number | null;
  onCambio: () => void;
}) {
  const [orden, setOrden] = useState<number[]>([]);
  const porId = new Map(rutina.map(e => [e.plan_ejercicio_id, e]));
  // Respeta el orden que armaste; lo que no estaba (o si cambió el plan) va al final, en el orden del plan
  const datos = [
    ...orden.map(id => porId.get(id)).filter((e): e is EjercicioRutina => !!e),
    ...rutina.filter(e => !orden.includes(e.plan_ejercicio_id)),
  ];

  return (
    <NestableDraggableFlatList
      data={datos}
      keyExtractor={e => String(e.plan_ejercicio_id)}
      onDragEnd={({ data }) => setOrden(data.map(e => e.plan_ejercicio_id))}
      activationDistance={8}
      renderItem={({ item, drag, isActive, getIndex }) => (
        <ScaleDecorator>
          <EjercicioCard
            ej={item}
            encuentroId={encuentroId}
            onCambio={onCambio}
            drag={drag}
            activo={isActive}
            siguiente={item.union_siguiente ? datos[(getIndex() ?? 0) + 1]?.nombre : undefined}
          />
        </ScaleDecorator>
      )}
    />
  );
}

function EjercicioCard({
  ej,
  encuentroId,
  onCambio,
  drag,
  activo,
  siguiente,
}: {
  ej: EjercicioRutina;
  encuentroId: number | null; // null: por mi cuenta
  onCambio: () => void;
  drag: () => void;
  activo: boolean;
  siguiente?: string; // si va en superserie o circuito con el que sigue
}) {
  const { token } = useSesion();
  const [verAlternativas, setVerAlternativas] = useState(false);
  const [reps, setReps] = useState(String(ej.repeticiones).split('-')[0]);
  const [peso, setPeso] = useState(ej.peso_sugerido ? String(Number(ej.peso_sugerido)) : '');
  const [hechas, setHechas] = useState<{ reps: number; peso: number; record: boolean }[]>([]);
  const [guardando, setGuardando] = useState(false);
  const [finDescanso, setFinDescanso] = useState<number | null>(null);
  const porTiempo = esPorTiempo(ej.repeticiones);

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
      // En superserie o circuito se pasa directo al siguiente; el descanso va al final de la vuelta
      if (ej.descanso_seg && !ej.union_siguiente && hechas.length + 1 < ej.series) setFinDescanso(Date.now() + ej.descanso_seg * 1000);
      if (data.record) Alert.alert('¡Récord personal!', `Sumaste 15 puntos con ${p} kg.`);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Card style={activo ? { borderColor: Colors.accent } : undefined}>
      <View style={styles.cabecera}>
        <TouchableOpacity onPressIn={drag} onLongPress={drag} delayLongPress={150} accessibilityLabel="Arrastrar para mover">
          <Ionicons name="reorder-three" size={26} color={Colors.textMuted} />
        </TouchableOpacity>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Titulo>{actual.nombre}</Titulo>
        </View>
      </View>
      {propia ? (
        <Texto muted>{`En lugar de ${ej.nombre}`}</Texto>
      ) : ej.cambio && <Texto muted>{`En lugar de ${ej.nombre} (lo cambió ${ej.cambio.elegido_por})`}</Texto>}
      <Texto muted>{`${resumenEjercicio(ej)} · ${ej.musculo_principal}`}</Texto>
      {!!siguiente && (
        <Text style={styles.union}>
          {`${ej.union_siguiente === 'superserie' ? '↕ Superserie' : '↻ Circuito'} con ${siguiente}: pasá directo, sin descanso`}
        </Text>
      )}
      {!!ej.nota && <Text style={styles.nota}>{ej.nota}</Text>}

      {!porTiempo && hechas.map((s, i) => (
        <Text key={i} style={styles.serie}>
          {`Serie ${i + 1}: ${s.reps} reps × ${s.peso} kg${s.record ? '  🏆' : ''}`}
        </Text>
      ))}

      {finDescanso && <Descanso fin={finDescanso} onTerminar={() => setFinDescanso(null)} />}

      {porTiempo && (
        hechas.length ? (
          <Text style={styles.serie}>Hecho ✓</Text>
        ) : (
          <Boton titulo="Listo" tipo="secundario" onPress={() => setHechas([{ reps: 0, peso: 0, record: false }])} style={{ marginTop: Spacing.md }} />
        )
      )}

      {!porTiempo && hechas.length < ej.series && (
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

// Cuenta regresiva del descanso entre series; vibra al terminar
function Descanso({ fin, onTerminar }: { fin: number; onTerminar: () => void }) {
  const [ahora, setAhora] = useState(Date.now());
  const quedan = Math.max(0, Math.ceil((fin - ahora) / 1000));

  useEffect(() => {
    const t = setInterval(() => setAhora(Date.now()), 250);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (quedan > 0) return;
    if (Platform.OS !== 'web') Vibration.vibrate([0, 400, 200, 400]);
    onTerminar();
  }, [quedan, onTerminar]);

  return (
    <View style={styles.descanso}>
      <Text style={styles.descansoTexto}>{`Descanso ${Math.floor(quedan / 60)}:${String(quedan % 60).padStart(2, '0')}`}</Text>
      <TouchableOpacity onPress={onTerminar}>
        <Text style={styles.saltar}>Saltar</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  diaTitulo: { ...Typography.titleLg, color: Colors.textPrimary, marginTop: Spacing.sm },
  diaMeta: { ...Typography.caption, color: Colors.textSecondary, marginTop: 2 },
  filaHistorial: { flexDirection: 'row', gap: Spacing.sm, paddingVertical: 4 },
  fechaHistorial: { ...Typography.caption, color: Colors.textSecondary, width: 72 },
  textoHistorial: { ...Typography.body, color: Colors.textPrimary, flex: 1, minWidth: 0 },
  union: { ...Typography.caption, color: Colors.accent, fontWeight: '600', marginBottom: Spacing.xs },
  cabecera: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  descanso: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: Spacing.md,
    padding: Spacing.sm, borderRadius: Radius.md, backgroundColor: Colors.accentGlow,
  },
  descansoTexto: { ...Typography.titleMd, color: Colors.accent },
  saltar: { ...Typography.label, color: Colors.textSecondary },
  nota: { ...Typography.caption, color: Colors.accent, fontStyle: 'italic', marginTop: Spacing.xs },
  modos: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs, marginBottom: Spacing.md },
  modo: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: Radius.full, backgroundColor: Colors.bgMuted },
  modoActivo: { backgroundColor: Colors.accent },
  modoTexto: { ...Typography.label, color: Colors.textPrimary },
  fila: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'flex-start', marginTop: Spacing.md },
  campo: { flex: 1, minWidth: 0, marginBottom: 0 },
  boton: { width: 104, paddingVertical: 12 },
  serie: { ...Typography.body, color: Colors.success, marginTop: Spacing.xs },
});
