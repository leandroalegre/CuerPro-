/**
 * Pantalla HOY
 * - Próximo encuentro del grupo y qué rutina toca
 * - Voy / no voy
 * - Quién confirmó; el coach marca quién vino
 * - Si no vas: cuántas veces más tenés que ir para llegar a tu objetivo del mes
 * - Una nota al confirmar ("llego 15 tarde")
 * - El coach mueve o cancela este entrenamiento, o agrega uno extra
 * - En el Individual no hay encuentros: muestra qué día del plan te toca
 */
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Boton, Campo, Card, CardDestacada, Etiqueta, Insignia, pantalla, Texto, Titulo, Vacio } from '../../components/ui';
import { Colors, Radius, Spacing, Typography } from '../../constants/theme';
import { InstalarApp } from '../../components/InstalarApp';
import { PrimerosPasos } from '../../components/PrimerosPasos';
import { fraseDelDia } from '../../constants/frases';
import { fechaLinda, useEncuentro } from '../../hooks/useEncuentro';
import { useSesion } from '../../hooks/useSesion';
import { api, Confirmacion, diasParaVencer, PlanResumen, textoVence } from '../../lib/api';

export default function HoyScreen() {
  const { token, usuario, grupo } = useSesion();
  const { encuentro, objetivo, cargando, error, recargar } = useEncuentro();
  const [enviando, setEnviando] = useState(false);
  const [nota, setNota] = useState('');
  const [agenda, setAgenda] = useState<'mover' | 'agregar' | null>(null);
  const notaGuardada = encuentro?.confirmaciones.find(c => c.usuario_id === usuario?.id)?.nota ?? '';
  useEffect(() => setNota(notaGuardada), [encuentro?.id, notaGuardada]);
  // Músculos que hace rato no entrenás (los días los elige el coach en Grupos)
  const [avisos, setAvisos] = useState<{ musculo: string; texto: string }[]>([]);
  useEffect(() => {
    if (!token) return;
    api<{ avisos: { musculo: string; texto: string }[] }>('progreso', {}, token)
      .then(d => setAvisos(d.avisos))
      .catch(() => {});
  }, [token, encuentro?.id]);
  // Al coach le avisa cuando el plan activo está por vencer
  const [planActivo, setPlanActivo] = useState<PlanResumen | null>(null);
  useEffect(() => {
    if (!token || !grupo || grupo.rol !== 'coach') return setPlanActivo(null);
    api<{ planes: PlanResumen[] }>('plan', { grupo_id: grupo.id }, token)
      .then(d => setPlanActivo(d.planes.find(p => p.activo) ?? null))
      .catch(() => {});
  }, [token, grupo?.id, grupo?.rol]);

  if (!grupo) {
    return (
      <ScrollView style={pantalla.scroll} contentContainerStyle={pantalla.contenido}>
        <PrimerosPasos />
        <Vacio texto="Todavía no estás en ningún grupo. Creá uno o unite con un código." />
        <Boton titulo="Ir a Grupos" onPress={() => router.push('/grupos')} />
      </ScrollView>
    );
  }

  // Plan por vencer y músculos para retomar: van arriba en grupo y en Individual
  const avisosArriba = (
    <>
      {!!planActivo?.vence && diasParaVencer(planActivo.vence) <= 7 && (
        <CardDestacada color={Colors.warning}>
          <Insignia texto="Plan por vencer" tipo="aviso" />
          <Text style={styles.avisoTexto}>{`${planActivo.nombre}: ${textoVence(planActivo.vence)}.`}</Text>
          <TouchableOpacity onPress={() => router.push('/plan')}>
            <Text style={[styles.avisoTexto, { color: Colors.accent, marginTop: Spacing.xs }]}>Armar el próximo plan →</Text>
          </TouchableOpacity>
        </CardDestacada>
      )}

      {avisos.length > 0 && (
        <CardDestacada color={Colors.warning}>
          <Insignia texto="Músculos para retomar" tipo="aviso" />
          {avisos.map(a => (
            <View key={a.musculo} style={styles.aviso}>
              <Ionicons name="time-outline" size={16} color={Colors.warning} />
              <Text style={styles.avisoTexto}>{a.texto}</Text>
            </View>
          ))}
        </CardDestacada>
      )}
    </>
  );

  if (grupo.individual) {
    return (
      <ScrollView style={pantalla.scroll} contentContainerStyle={pantalla.contenido}>
        <Etiqueta>Individual</Etiqueta>
        <Text style={styles.frase}>{`“${fraseDelDia()}”`}</Text>
        <InstalarApp />
        <PrimerosPasos />
        {avisosArriba}
        <TeToca grupoId={grupo.id} />
      </ScrollView>
    );
  }

  const esCoach = grupo.rol === 'coach';
  const mia = encuentro?.confirmaciones.find(c => c.usuario_id === usuario?.id);
  const van = encuentro?.confirmaciones.filter(c => c.va === 1) ?? [];
  const noVan = encuentro?.confirmaciones.filter(c => c.va === 0) ?? [];
  const sinResponder = encuentro?.confirmaciones.filter(c => c.va === null) ?? [];

  // Si cambiás de voy a no voy (o al revés) la nota anterior ya no aplica y se borra
  const confirmar = async (va: boolean, conNota?: string) => {
    if (!encuentro) return;
    setEnviando(true);
    try {
      await api('confirmar', { encuentro_id: encuentro.id, va: va ? 1 : 0, ...(conNota !== undefined && { nota: conNota }) }, token);
      await recargar();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setEnviando(false);
    }
  };

  const marcarAsistencia = async (c: Confirmacion) => {
    if (!encuentro) return;
    try {
      await api('asistencia', { encuentro_id: encuentro.id, usuario_id: c.usuario_id, asistio: c.asistio ? 0 : 1 }, token);
      await recargar();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  const cancelarEncuentro = () => {
    if (!encuentro) return;
    const hacer = async () => {
      try {
        await api('encuentro_cancelar', { encuentro_id: encuentro.id }, token);
        await recargar();
      } catch (e: any) {
        Alert.alert('No se pudo', e.message);
      }
    };
    // Alert con botones no existe en la web
    if (typeof window !== 'undefined' && typeof window.confirm === 'function') {
      if (window.confirm(`¿Cancelar el entrenamiento del ${fechaLinda(encuentro.fecha_hora)}? Se le avisa al grupo.`)) hacer();
      return;
    }
    Alert.alert('Cancelar entrenamiento', `¿Cancelar el del ${fechaLinda(encuentro.fecha_hora)}? Se le avisa al grupo.`, [
      { text: 'No' },
      { text: 'Sí, cancelar', style: 'destructive', onPress: hacer },
    ]);
  };

  const guardarAgenda = async (fechaHora: string) => {
    try {
      if (agenda === 'mover' && encuentro) {
        await api('encuentro_mover', { encuentro_id: encuentro.id, fecha_hora: fechaHora }, token);
      } else {
        await api('encuentro_agregar', { grupo_id: grupo.id, fecha_hora: fechaHora }, token);
      }
      setAgenda(null);
      await recargar();
    } catch (e: any) {
      Alert.alert('No se pudo', e.message);
    }
  };

  return (
    <ScrollView
      style={pantalla.scroll}
      contentContainerStyle={pantalla.contenido}
      refreshControl={<RefreshControl refreshing={cargando} onRefresh={recargar} tintColor={Colors.accent} />}
    >
      <Etiqueta>{grupo.nombre}</Etiqueta>
      <Text style={styles.frase}>{`“${fraseDelDia()}”`}</Text>
      <InstalarApp />
      <PrimerosPasos />
      {avisosArriba}

      {error && <Vacio texto={error} />}

      {!encuentro && !cargando && !error && (
        <Vacio
          texto={esCoach
            ? 'El grupo todavía no tiene horarios. Cargalos desde Grupos.'
            : 'El grupo todavía no tiene horarios cargados.'}
        />
      )}

      {esCoach && !encuentro && !cargando && !error && (agenda ? (
        <ElegirFecha titulo="Nuevo entrenamiento" horaInicial="19:00" onGuardar={guardarAgenda} onCerrar={() => setAgenda(null)} />
      ) : (
        <Boton titulo="Agregar un entrenamiento" tipo="secundario" onPress={() => setAgenda('agregar')} />
      ))}

      {encuentro && (
        <>
          <CardDestacada>
            <View style={styles.filaInsignias}>
              <Etiqueta>Próximo entrenamiento</Etiqueta>
              {mia?.va === 1 && <Insignia texto="Vas" tipo="exito" />}
              {mia?.va === 0 && <Insignia texto="No vas" tipo="peligro" />}
            </View>
            <Text style={styles.fecha}>{fechaLinda(encuentro.fecha_hora).split(' a las ')[0]}</Text>
            <Text style={styles.hora}>{`${fechaLinda(encuentro.fecha_hora).split(' a las ')[1] ?? ''} hs`}</Text>
            {encuentro.fecha_original && (
              <Texto muted>{`Cambiado: era el ${fechaLinda(encuentro.fecha_original)}`}</Texto>
            )}
            <View style={styles.toca}>
              <Ionicons name="barbell-outline" size={16} color={Colors.accent} />
              <Text style={styles.tocaTexto}>{encuentro.dia ? encuentro.dia.nombre : 'Todavía no hay plan cargado'}</Text>
            </View>

            <View style={styles.fila}>
              <Boton
                titulo="Voy"
                tipo={mia?.va === 1 ? 'exito' : 'secundario'}
                onPress={() => confirmar(true, mia?.va === 0 ? '' : undefined)}
                cargando={enviando}
                style={styles.mitad}
              />
              <Boton
                titulo="No voy"
                tipo={mia?.va === 0 ? 'peligro' : 'secundario'}
                onPress={() => confirmar(false, mia?.va === 1 ? '' : undefined)}
                cargando={enviando}
                style={styles.mitad}
              />
            </View>

            {mia?.va != null && (
              <View style={{ marginTop: Spacing.md }}>
                <Etiqueta>Nota para el grupo</Etiqueta>
                <View style={styles.chips}>
                  {(mia.va ? ['Llego 15 min tarde', 'Llego 30 min tarde', 'Me voy antes'] : ['Estoy enfermo', 'Viaje', 'Trabajo']).map(t => (
                    <TouchableOpacity key={t} style={styles.chip} onPress={() => setNota(t)}>
                      <Text style={styles.chipTexto}>{t}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <Campo placeholder="Ej: llego 15 tarde" value={nota} onChangeText={setNota} maxLength={140} />
                {nota.trim() !== (mia.nota ?? '') && (
                  <Boton titulo="Guardar nota" tipo="secundario" onPress={() => confirmar(mia.va === 1, nota.trim())} cargando={enviando} />
                )}
              </View>
            )}

            {esCoach && (
              <View style={[styles.fila, { flexWrap: 'wrap' }]}>
                <Boton titulo="Cambiar día u hora" tipo="secundario" onPress={() => setAgenda(agenda === 'mover' ? null : 'mover')} style={styles.mitad} />
                <Boton titulo="Cancelar" tipo="secundario" onPress={cancelarEncuentro} style={styles.mitad} />
              </View>
            )}
            {esCoach && (
              <TouchableOpacity onPress={() => setAgenda(agenda === 'agregar' ? null : 'agregar')} style={{ marginTop: Spacing.sm }}>
                <Text style={[styles.chipTexto, { color: Colors.accent }]}>+ Agregar un entrenamiento extra</Text>
              </TouchableOpacity>
            )}
          </CardDestacada>

          {agenda && (
            <ElegirFecha
              titulo={agenda === 'mover' ? 'Mover este entrenamiento' : 'Entrenamiento extra'}
              horaInicial={encuentro.fecha_hora.slice(11, 16)}
              onGuardar={guardarAgenda}
              onCerrar={() => setAgenda(null)}
            />
          )}

          {objetivo && (
            <Card style={{ borderColor: Colors.warning, backgroundColor: Colors.warningBg }}>
              <Titulo>{objetivo.objetivo ? `Tu objetivo: ${objetivo.objetivo}` : 'Seguí sumando'}</Titulo>
              <Texto>{objetivo.texto}</Texto>
            </Card>
          )}

          {mia?.va === 0 && (
            <Boton titulo="Entrenar por mi cuenta" tipo="secundario" onPress={() => router.push('/entrenar?modo=solo')} />
          )}

          <Card>
            <Titulo>Quién va</Titulo>
            {esCoach && <Texto muted>Tocá a cada uno cuando llegue para marcar la asistencia.</Texto>}
            <Lista titulo={`Van (${van.length})`} gente={van} esCoach={esCoach} onTocar={marcarAsistencia} />
            <Lista titulo={`No van (${noVan.length})`} gente={noVan} esCoach={esCoach} onTocar={marcarAsistencia} />
            <Lista titulo={`Sin responder (${sinResponder.length})`} gente={sinResponder} esCoach={esCoach} onTocar={marcarAsistencia} />
          </Card>

          {encuentro.rutina.length > 0 && (
            <Boton titulo="Empezar a entrenar" onPress={() => router.push('/entrenar')} />
          )}
        </>
      )}
    </ScrollView>
  );
}

// Individual: el día del plan que te recomendamos según lo último que entrenaste
function TeToca({ grupoId }: { grupoId: number }) {
  const { token } = useSesion();
  const [datos, setDatos] = useState<{ hayPlan: boolean; recomendado: { nombre: string; texto: string } | null; ultimo: string | null } | null>(null);
  useFocusEffect(useCallback(() => {
    if (!token) return;
    Promise.all([
      api<{ plan: { dias: unknown[] } | null }>('plan', { grupo_id: grupoId }, token),
      api<{ entrenamientos: { fecha: string; dia_nombre: string | null }[]; recomendado: { nombre: string; texto: string } | null }>(
        'mis_entrenamientos', { grupo_id: grupoId }, token),
    ])
      .then(([p, h]) => setDatos({
        hayPlan: !!p.plan?.dias.length,
        recomendado: h.recomendado,
        ultimo: h.entrenamientos[0] ? `${h.entrenamientos[0].fecha.split('-').reverse().slice(0, 2).join('/')}${h.entrenamientos[0].dia_nombre ? ` · ${h.entrenamientos[0].dia_nombre}` : ''}` : null,
      }))
      .catch(() => {});
  }, [token, grupoId]));

  if (!datos) return null;
  if (!datos.hayPlan) {
    return (
      <CardDestacada>
        <Etiqueta>Tu plan</Etiqueta>
        <Text style={styles.titulo}>Armá tu plan</Text>
        <Texto muted>Elegí los días y los ejercicios que vas a hacer. Después entrenás cuando quieras.</Texto>
        <Boton titulo="Armar mi plan" onPress={() => router.push('/plan')} style={{ marginTop: Spacing.md }} />
      </CardDestacada>
    );
  }
  return (
    <CardDestacada>
      <Etiqueta>Hoy te toca</Etiqueta>
      <Text style={styles.fecha}>{datos.recomendado?.nombre ?? 'El día que quieras'}</Text>
      {!!datos.recomendado && <Texto muted>{datos.recomendado.texto}</Texto>}
      {!!datos.ultimo && <Texto muted>{`Último entrenamiento: ${datos.ultimo}`}</Texto>}
      <Boton titulo="Empezar a entrenar" onPress={() => router.push('/entrenar')} style={{ marginTop: Spacing.md }} />
    </CardDestacada>
  );
}

const DIAS_CORTOS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const pad = (n: number) => String(n).padStart(2, '0');

// Día (próximas dos semanas) + hora → "AAAA-MM-DD HH:MM"
function ElegirFecha({
  titulo,
  horaInicial,
  onGuardar,
  onCerrar,
}: {
  titulo: string;
  horaInicial: string;
  onGuardar: (fechaHora: string) => Promise<void>;
  onCerrar: () => void;
}) {
  const dias = Array.from({ length: 14 }, (_, i) => {
    const f = new Date();
    f.setDate(f.getDate() + i);
    return f;
  });
  const [dia, setDia] = useState(0);
  const [hora, setHora] = useState(horaInicial);
  const [guardando, setGuardando] = useState(false);

  const guardar = async () => {
    if (!/^\d{1,2}:\d{2}$/.test(hora.trim())) return Alert.alert('Hora inválida', 'Usá el formato 19:00');
    const f = dias[dia];
    setGuardando(true);
    await onGuardar(`${f.getFullYear()}-${pad(f.getMonth() + 1)}-${pad(f.getDate())} ${hora.trim()}`);
    setGuardando(false);
  };

  return (
    <Card>
      <Titulo>{titulo}</Titulo>
      <View style={styles.chips}>
        {dias.map((f, i) => (
          <TouchableOpacity key={i} style={[styles.chip, dia === i && styles.chipActivo]} onPress={() => setDia(i)}>
            <Text style={[styles.chipTexto, dia === i && { color: Colors.textInverse }]}>
              {i === 0 ? 'Hoy' : i === 1 ? 'Mañana' : `${DIAS_CORTOS[f.getDay()]} ${f.getDate()}`}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      <Campo value={hora} onChangeText={setHora} placeholder="19:00" keyboardType="numbers-and-punctuation" />
      <Texto muted>Se le avisa a todo el grupo.</Texto>
      <View style={styles.fila}>
        <Boton titulo="Cerrar" tipo="secundario" onPress={onCerrar} style={styles.mitad} />
        <Boton titulo="Guardar" onPress={guardar} cargando={guardando} style={styles.mitad} />
      </View>
    </Card>
  );
}

function Lista({
  titulo,
  gente,
  esCoach,
  onTocar,
}: {
  titulo: string;
  gente: Confirmacion[];
  esCoach: boolean;
  onTocar: (c: Confirmacion) => void;
}) {
  if (!gente.length) return null;
  return (
    <View style={{ marginTop: Spacing.md }}>
      <Etiqueta>{titulo}</Etiqueta>
      {gente.map(c => (
        <TouchableOpacity key={c.usuario_id} style={styles.persona} disabled={!esCoach} onPress={() => onTocar(c)}>
          <View style={{ flex: 1 }}>
            <Text style={styles.nombre}>{c.nombre}</Text>
            {!!c.nota && <Text style={styles.nota}>{c.nota}</Text>}
          </View>
          {c.asistio === 1 && <Ionicons name="checkmark-circle" size={22} color={Colors.success} />}
          {esCoach && c.asistio !== 1 && <Ionicons name="ellipse-outline" size={22} color={Colors.textMuted} />}
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  fila: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.md },
  mitad: { flex: 1, minWidth: 140 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs, marginVertical: Spacing.sm },
  chip: { paddingVertical: 6, paddingHorizontal: 10, borderRadius: Radius.full, backgroundColor: Colors.bgMuted },
  chipActivo: { backgroundColor: Colors.accent },
  chipTexto: { ...Typography.label, color: Colors.textPrimary },
  nota: { ...Typography.caption, color: Colors.textSecondary },
  persona: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  nombre: { ...Typography.body, color: Colors.textPrimary },
  filaInsignias: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm },
  fecha: { ...Typography.titleLg, color: Colors.textPrimary, textTransform: 'capitalize' },
  hora: { fontSize: 34, fontWeight: '800', color: Colors.accent, marginBottom: Spacing.xs },
  toca: {
    flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', marginTop: Spacing.xs,
    paddingVertical: 6, paddingHorizontal: 12, borderRadius: Radius.full, backgroundColor: Colors.accentGlow,
  },
  tocaTexto: { ...Typography.body, color: Colors.textPrimary, fontWeight: '600' },
  aviso: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginTop: Spacing.sm },
  avisoTexto: { ...Typography.body, color: Colors.textPrimary, flex: 1, minWidth: 0 },
  titulo: { ...Typography.titleLg, color: Colors.textPrimary },
  frase: { ...Typography.body, color: Colors.textSecondary, fontStyle: 'italic', marginBottom: Spacing.md },
});
