/**
 * Pantalla PLAN
 * - Ver el plan del grupo: días, ejercicios, series y alternativas
 * - El coach (o todos, si el grupo es abierto) lo arma y lo edita; los ejercicios
 *   son tarjetas que se arrastran para cambiar el orden
 * - Los miembros proponen cambios y el coach los acepta o rechaza
 */
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { NestableDraggableFlatList, NestableScrollContainer, RenderItemParams, ScaleDecorator } from 'react-native-draggable-flatlist';
import { EjercicioNuevo, SelectorEjercicio } from '../../components/SelectorEjercicio';
import { Boton, Campo, Card, Etiqueta, pantalla, Texto, Titulo, Vacio } from '../../components/ui';
import { Colors, Radius, Spacing, Typography } from '../../constants/theme';
import { useSesion } from '../../hooks/useSesion';
import { api, Carga, CARGAS, Ejercicio, EQUIPO, Plan, Propuesta, resumenEjercicio, textoPausa } from '../../lib/api';

interface EjEdit {
  key: string;
  ejercicio: Ejercicio;
  series: string;
  repeticiones: string;
  peso: string;
  carga: Carga | null;
  descanso: number | null;
  nota: string;
  alternativas: Ejercicio[];
}

const PAUSAS = [60, 90, 120, 180];
interface DiaEdit { key: string; nombre: string; ejercicios: EjEdit[] }

type Selector = { modo: 'ejercicio'; dia: number } | { modo: 'alternativa'; dia: number; ej: number } | null;

let contador = 0;
const nuevaKey = () => `k${++contador}`;

export default function PlanScreen() {
  const { token, grupo } = useSesion();
  const [plan, setPlan] = useState<Plan | null>(null);
  const [catalogo, setCatalogo] = useState<Ejercicio[]>([]);
  const [propuestas, setPropuestas] = useState<Propuesta[]>([]);
  const [cargando, setCargando] = useState(false);
  const [editando, setEditando] = useState(false);
  const [abierto, setAbierto] = useState<string | null>(null); // tarjeta de ejercicio abierta para editar
  const [nombrePlan, setNombrePlan] = useState('');
  const [dias, setDias] = useState<DiaEdit[]>([]);
  const [selector, setSelector] = useState<Selector>(null);
  const [guardando, setGuardando] = useState(false);
  const [textoPropuesta, setTextoPropuesta] = useState('');

  const esCoach = grupo?.rol === 'coach';

  const cargar = useCallback(async () => {
    if (!token || !grupo) return;
    setCargando(true);
    try {
      const [p, c, pr] = await Promise.all([
        api<{ plan: Plan | null }>('plan', { grupo_id: grupo.id }, token),
        api<{ ejercicios: Ejercicio[] }>('ejercicios', { grupo_id: grupo.id }, token),
        api<{ propuestas: Propuesta[] }>('propuestas', { grupo_id: grupo.id }, token),
      ]);
      setPlan(p.plan);
      setCatalogo(c.ejercicios);
      setPropuestas(pr.propuestas);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setCargando(false);
    }
  }, [token, grupo]);

  useFocusEffect(useCallback(() => { if (!editando) cargar(); }, [cargar, editando]));

  if (!grupo) {
    return (
      <ScrollView style={pantalla.scroll} contentContainerStyle={pantalla.contenido}>
        <Vacio texto="Unite a un grupo para ver su plan." />
      </ScrollView>
    );
  }

  // ── Editor ──
  const empezarEdicion = () => {
    const porId = new Map(catalogo.map(e => [e.id, e]));
    setNombrePlan(plan?.nombre ?? 'Plan');
    setDias(plan
      ? plan.dias.map(d => ({
          key: nuevaKey(),
          nombre: d.nombre,
          ejercicios: d.ejercicios
            .filter(e => porId.has(e.ejercicio_id))
            .map(e => ({
              key: nuevaKey(),
              ejercicio: porId.get(e.ejercicio_id)!,
              series: String(e.series),
              repeticiones: e.repeticiones,
              peso: e.peso_sugerido ? String(Number(e.peso_sugerido)) : '',
              carga: e.carga,
              descanso: e.descanso_seg,
              nota: e.nota ?? '',
              alternativas: e.alternativas.map(a => porId.get(a.ejercicio_id)).filter(Boolean) as Ejercicio[],
            })),
        }))
      : [{ key: nuevaKey(), nombre: 'Día 1', ejercicios: [] }]);
    setEditando(true);
  };

  const cambiarDia = (i: number, cambios: Partial<DiaEdit>) =>
    setDias(ds => ds.map((d, j) => (j === i ? { ...d, ...cambios } : d)));

  const cambiarEj = (i: number, k: number, cambios: Partial<EjEdit>) =>
    setDias(ds => ds.map((d, j) => (j === i
      ? { ...d, ejercicios: d.ejercicios.map((e, m) => (m === k ? { ...e, ...cambios } : e)) }
      : d)));

  const moverDia = (i: number, delta: number) =>
    setDias(ds => {
      const destino = i + delta;
      if (destino < 0 || destino >= ds.length) return ds;
      const lista = [...ds];
      [lista[i], lista[destino]] = [lista[destino], lista[i]];
      return lista;
    });

  // Saca el ejercicio de un día y lo pone al final de otro
  const pasarADia = (i: number, k: number, j: number) =>
    setDias(ds => {
      const ej = ds[i].ejercicios[k];
      return ds.map((d, n) => {
        if (n === i) return { ...d, ejercicios: d.ejercicios.filter((_, m) => m !== k) };
        if (n === j) return { ...d, ejercicios: [...d.ejercicios, ej] };
        return d;
      });
    });

  const quitarEj = (i: number, k: number) =>
    setDias(ds => ds.map((d, j) => (j === i ? { ...d, ejercicios: d.ejercicios.filter((_, m) => m !== k) } : d)));

  // El coach carga un ejercicio que no está en el catálogo; queda para el grupo
  const crearEjercicio = async (datos: EjercicioNuevo): Promise<Ejercicio> => {
    const { id } = await api<{ id: number }>('ejercicio_crear', { grupo_id: grupo!.id, ...datos }, token);
    const nuevo: Ejercicio = { id, grupo_id: grupo!.id, musculos_secundarios: '', movimiento: '', ...datos };
    setCatalogo(c => [...c, nuevo]);
    return nuevo;
  };

  const alElegir = (e: Ejercicio) => {
    if (!selector) return;
    if (selector.modo === 'ejercicio') {
      const dia = dias[selector.dia];
      cambiarDia(selector.dia, {
        ejercicios: [...dia.ejercicios, { key: nuevaKey(), ejercicio: e, series: '3', repeticiones: '10', peso: '', carga: null, descanso: null, nota: '', alternativas: [] }],
      });
    } else {
      const ej = dias[selector.dia].ejercicios[selector.ej];
      cambiarEj(selector.dia, selector.ej, { alternativas: [...ej.alternativas, e] });
    }
    setSelector(null);
  };

  const guardar = async () => {
    const vacio = dias.findIndex(d => !d.ejercicios.length);
    if (vacio >= 0) return Alert.alert('Falta completar', `El ${dias[vacio].nombre || `día ${vacio + 1}`} no tiene ejercicios.`);
    setGuardando(true);
    try {
      const data = await api<{ avisos: string[] }>('plan_guardar', {
        grupo_id: grupo.id,
        plan: {
          nombre: nombrePlan.trim() || 'Plan',
          dias: dias.map((d, i) => ({
            nombre: d.nombre.trim() || `Día ${i + 1}`,
            ejercicios: d.ejercicios.map(e => ({
              ejercicio_id: e.ejercicio.id,
              series: Number(e.series) || 3,
              repeticiones: e.repeticiones.trim() || '10',
              peso_sugerido: e.peso ? Number(e.peso.replace(',', '.')) : null,
              carga: e.carga,
              descanso_seg: e.descanso,
              nota: e.nota.trim(),
              alternativas: e.alternativas.map(a => a.id),
            })),
          })),
        },
      }, token);
      setEditando(false);
      await cargar();
      Alert.alert(
        'Plan guardado',
        data.avisos.length ? `Ojo con el descanso:\n${data.avisos.join('\n')}` : 'Todo el grupo ya ve el plan nuevo.',
      );
    } catch (e: any) {
      Alert.alert('No se pudo guardar', e.message);
    } finally {
      setGuardando(false);
    }
  };

  // ── Propuestas ──
  const proponer = async () => {
    try {
      await api('propuesta_crear', { grupo_id: grupo.id, texto: textoPropuesta.trim() }, token);
      setTextoPropuesta('');
      cargar();
    } catch (e: any) {
      Alert.alert('No se pudo enviar', e.message);
    }
  };

  const resolver = async (id: number, estado: 'aceptada' | 'rechazada') => {
    try {
      await api('propuesta_resolver', { propuesta_id: id, estado }, token);
      cargar();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  const selEjercicio = selector?.modo === 'alternativa' ? dias[selector.dia]?.ejercicios[selector.ej] : null;

  if (editando) {
    return (
      <NestableScrollContainer style={pantalla.scroll} contentContainerStyle={pantalla.contenido} keyboardShouldPersistTaps="handled">
        <Etiqueta>Nombre del plan</Etiqueta>
        <Campo value={nombrePlan} onChangeText={setNombrePlan} placeholder="Plan" />
        <Texto muted>Arrastrá cada ejercicio desde ≡ para cambiar el orden. Tocalo para editarlo.</Texto>

        {dias.map((d, i) => (
          <Card key={d.key}>
            <View style={styles.filaTitulo}>
              <Campo style={styles.nombreDia} value={d.nombre} onChangeText={t => cambiarDia(i, { nombre: t })} placeholder={`Día ${i + 1}`} />
              {dias.length > 1 && (
                <View style={styles.acciones}>
                  <TouchableOpacity onPress={() => moverDia(i, -1)} disabled={i === 0} accessibilityLabel="Subir día">
                    <Ionicons name="chevron-up" size={22} color={i === 0 ? Colors.border : Colors.textSecondary} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => moverDia(i, 1)} disabled={i === dias.length - 1} accessibilityLabel="Bajar día">
                    <Ionicons name="chevron-down" size={22} color={i === dias.length - 1 ? Colors.border : Colors.textSecondary} />
                  </TouchableOpacity>
                </View>
              )}
              {dias.length > 1 && (
                <TouchableOpacity onPress={() => setDias(dias.filter((_, j) => j !== i))} accessibilityLabel="Quitar día">
                  <Ionicons name="trash-outline" size={22} color={Colors.error} />
                </TouchableOpacity>
              )}
            </View>

            <NestableDraggableFlatList
              data={d.ejercicios}
              keyExtractor={e => e.key}
              onDragEnd={({ data }) => cambiarDia(i, { ejercicios: data })}
              activationDistance={8}
              renderItem={({ item: e, drag, isActive, getIndex }: RenderItemParams<EjEdit>) => {
                const k = getIndex() ?? 0;
                const abiertoEste = abierto === e.key;
                return (
                  <ScaleDecorator>
                    <View style={[styles.tarjeta, isActive && styles.tarjetaActiva]}>
                      <View style={styles.filaTitulo}>
                        <TouchableOpacity onPressIn={drag} onLongPress={drag} delayLongPress={150} style={styles.manija} accessibilityLabel="Arrastrar para mover">
                          <Ionicons name="reorder-three" size={26} color={Colors.textMuted} />
                        </TouchableOpacity>
                        <TouchableOpacity style={{ flex: 1, minWidth: 0 }} onPress={() => setAbierto(abiertoEste ? null : e.key)}>
                          <Text style={styles.ejNombre}>{e.ejercicio.nombre}</Text>
                          <Text style={styles.mini}>
                            {resumenEjercicio({
                              series: Number(e.series) || 0, repeticiones: e.repeticiones,
                              peso_sugerido: e.peso || null, carga: e.carga, descanso_seg: e.descanso,
                            })}
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => setAbierto(abiertoEste ? null : e.key)} accessibilityLabel={abiertoEste ? 'Cerrar' : 'Editar'}>
                          <Ionicons name={abiertoEste ? 'chevron-up' : 'create-outline'} size={20} color={Colors.textSecondary} />
                        </TouchableOpacity>
                      </View>

                      {abiertoEste && (
                        <View style={{ marginTop: Spacing.sm }}>
                          <View style={styles.filaCampos}>
                            <View style={styles.campoChico}>
                              <Text style={styles.mini}>Series</Text>
                              <Campo style={styles.sinMargen} value={e.series} onChangeText={t => cambiarEj(i, k, { series: t })} keyboardType="number-pad" />
                            </View>
                            <View style={styles.campoChico}>
                              <Text style={styles.mini}>Reps</Text>
                              <Campo style={styles.sinMargen} value={e.repeticiones} onChangeText={t => cambiarEj(i, k, { repeticiones: t })} placeholder="8-10" />
                            </View>
                            <View style={styles.campoChico}>
                              <Text style={styles.mini}>Kg sugerido</Text>
                              <Campo style={styles.sinMargen} value={e.peso} onChangeText={t => cambiarEj(i, k, { peso: t })} keyboardType="decimal-pad" />
                            </View>
                          </View>
                          <Text style={styles.mini}>Carga</Text>
                          <View style={styles.alternativas}>
                            {CARGAS.map(c => (
                              <Opcion key={c} texto={c} activa={e.carga === c} onPress={() => cambiarEj(i, k, { carga: e.carga === c ? null : c })} />
                            ))}
                          </View>
                          <Text style={[styles.mini, { marginTop: Spacing.sm }]}>Pausa entre series</Text>
                          <View style={styles.alternativas}>
                            {PAUSAS.map(p => (
                              <Opcion key={p} texto={textoPausa(p)} activa={e.descanso === p} onPress={() => cambiarEj(i, k, { descanso: e.descanso === p ? null : p })} />
                            ))}
                          </View>
                          <Campo
                            style={{ marginTop: Spacing.sm }}
                            value={e.nota}
                            onChangeText={t => cambiarEj(i, k, { nota: t })}
                            placeholder="Nota para el grupo (ej: isometría 1'' arriba)"
                            maxLength={200}
                          />
                          <Text style={styles.mini}>Alternativas si la máquina está ocupada</Text>
                          <View style={styles.alternativas}>
                            {e.alternativas.map((a, n) => (
                              <TouchableOpacity
                                key={a.id}
                                style={styles.alt}
                                onPress={() => cambiarEj(i, k, { alternativas: e.alternativas.filter((_, m) => m !== n) })}
                              >
                                <Text style={styles.altTexto}>{a.nombre}</Text>
                                <Ionicons name="close" size={14} color={Colors.textSecondary} />
                              </TouchableOpacity>
                            ))}
                            <TouchableOpacity style={[styles.alt, styles.altAgregar]} onPress={() => setSelector({ modo: 'alternativa', dia: i, ej: k })}>
                              <Ionicons name="add" size={14} color={Colors.accent} />
                              <Text style={[styles.altTexto, { color: Colors.accent }]}>Alternativa</Text>
                            </TouchableOpacity>
                          </View>
                          {dias.length > 1 && (
                            <>
                              <Text style={[styles.mini, { marginTop: Spacing.sm }]}>Pasar a otro día</Text>
                              <View style={styles.alternativas}>
                                {dias.map((otro, j) => j !== i && (
                                  <Opcion key={otro.key} texto={otro.nombre || `Día ${j + 1}`} activa={false} onPress={() => pasarADia(i, k, j)} />
                                ))}
                              </View>
                            </>
                          )}
                          <TouchableOpacity onPress={() => quitarEj(i, k)} style={{ marginTop: Spacing.sm, alignSelf: 'flex-start' }}>
                            <Text style={[styles.altTexto, { color: Colors.error }]}>Quitar del plan</Text>
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                  </ScaleDecorator>
                );
              }}
            />

            <Boton titulo="Agregar ejercicio" tipo="secundario" onPress={() => setSelector({ modo: 'ejercicio', dia: i })} style={{ marginTop: Spacing.sm }} />
          </Card>
        ))}

        <Boton
          titulo="Agregar día"
          tipo="secundario"
          onPress={() => setDias([...dias, { key: nuevaKey(), nombre: `Día ${dias.length + 1}`, ejercicios: [] }])}
        />
        <View style={styles.filaBotones}>
          <Boton titulo="Cancelar" tipo="secundario" onPress={() => setEditando(false)} style={{ flex: 1 }} />
          <Boton titulo="Guardar plan" onPress={guardar} cargando={guardando} style={{ flex: 1 }} />
        </View>

        <SelectorEjercicio
          visible={!!selector}
          titulo={selector?.modo === 'alternativa' ? `Alternativa para ${selEjercicio?.ejercicio.nombre ?? ''}` : 'Agregar ejercicio'}
          ejercicios={catalogo}
          excluir={selEjercicio ? [selEjercicio.ejercicio.id, ...selEjercicio.alternativas.map(a => a.id)] : []}
          sugerir={selEjercicio?.ejercicio ?? null}
          onElegir={alElegir}
          onCerrar={() => setSelector(null)}
          onCrear={crearEjercicio}
        />
      </NestableScrollContainer>
    );
  }

  // ── Vista ──
  const pendientes = propuestas.filter(p => p.estado === 'pendiente');
  const resueltas = propuestas.filter(p => p.estado !== 'pendiente').slice(0, 5);

  return (
    <ScrollView
      style={pantalla.scroll}
      contentContainerStyle={pantalla.contenido}
      refreshControl={<RefreshControl refreshing={cargando} onRefresh={cargar} tintColor={Colors.accent} />}
      keyboardShouldPersistTaps="handled"
    >
      <Etiqueta>{grupo.nombre}</Etiqueta>

      {!plan && !cargando && (
        <Vacio texto={esCoach ? 'El grupo todavía no tiene plan. Armalo acá abajo.' : 'El coach todavía no armó el plan.'} />
      )}

      {plan && (
        <>
          <Titulo>{plan.nombre}</Titulo>
          {plan.dias.map(d => (
            <Card key={d.id}>
              <Etiqueta>{`Día ${d.orden}`}</Etiqueta>
              <Text style={styles.diaNombre}>{d.nombre}</Text>
              {d.ejercicios.map(e => (
                <View key={e.plan_ejercicio_id} style={styles.ejVista}>
                  <Text style={styles.ejNombre}>{e.nombre}</Text>
                  <Text style={styles.mini}>{`${resumenEjercicio(e)} · ${EQUIPO[e.equipo] ?? e.equipo}`}</Text>
                  {!!e.nota && <Text style={styles.nota}>{e.nota}</Text>}
                  {e.alternativas.length > 0 && (
                    <Text style={styles.mini}>{`Si está ocupada: ${e.alternativas.map(a => a.nombre).join(', ')}`}</Text>
                  )}
                </View>
              ))}
            </Card>
          ))}
        </>
      )}

      {esCoach && (
        <Boton titulo={plan ? 'Editar plan' : 'Armar plan'} onPress={empezarEdicion} disabled={!catalogo.length} style={{ marginBottom: Spacing.md }} />
      )}

      {plan && (
        <Card>
          <Titulo>Propuestas</Titulo>
          {!esCoach && (
            <>
              <Texto muted>¿Se te ocurre un cambio? Proponéselo al coach.</Texto>
              <Campo
                value={textoPropuesta}
                onChangeText={setTextoPropuesta}
                placeholder="Ej: sumar sentadilla los jueves"
                multiline
                style={{ marginTop: Spacing.sm, minHeight: 60 }}
              />
              <Boton titulo="Enviar propuesta" tipo="secundario" onPress={proponer} disabled={!textoPropuesta.trim()} />
            </>
          )}
          {pendientes.length === 0 && resueltas.length === 0 && <Texto muted>No hay propuestas todavía.</Texto>}
          {pendientes.map(p => (
            <View key={p.id} style={styles.propuesta}>
              <Text style={styles.ejNombre}>{p.texto}</Text>
              <Text style={styles.mini}>{`${p.autor} · pendiente`}</Text>
              {esCoach && (
                <View style={styles.filaBotones}>
                  <Boton titulo="Rechazar" tipo="peligro" onPress={() => resolver(p.id, 'rechazada')} style={{ flex: 1 }} />
                  <Boton titulo="Aceptar" tipo="exito" onPress={() => resolver(p.id, 'aceptada')} style={{ flex: 1 }} />
                </View>
              )}
            </View>
          ))}
          {resueltas.map(p => (
            <View key={p.id} style={styles.propuesta}>
              <Text style={[styles.ejNombre, { color: Colors.textSecondary }]}>{p.texto}</Text>
              <Text style={[styles.mini, { color: p.estado === 'aceptada' ? Colors.success : Colors.error }]}>
                {`${p.autor} · ${p.estado}`}
              </Text>
            </View>
          ))}
        </Card>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  filaTitulo: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm },
  nombreDia: { flex: 1, minWidth: 0, marginBottom: 0, fontWeight: '600' },
  tarjeta: {
    backgroundColor: Colors.bgInput, borderRadius: Radius.md, padding: Spacing.sm,
    marginTop: Spacing.sm, borderWidth: 1, borderColor: Colors.border,
  },
  tarjetaActiva: { borderColor: Colors.accent, backgroundColor: Colors.bgMuted },
  manija: { paddingRight: Spacing.xs, paddingVertical: Spacing.xs },
  ejVista: { borderTopWidth: 1, borderTopColor: Colors.border, paddingVertical: Spacing.sm },
  ejNombre: { ...Typography.body, color: Colors.textPrimary, flexShrink: 1 },
  diaNombre: { ...Typography.titleMd, color: Colors.textPrimary, marginBottom: Spacing.xs },
  acciones: { flexDirection: 'row', gap: Spacing.sm },
  filaCampos: { flexDirection: 'row', gap: Spacing.sm, marginVertical: Spacing.sm },
  campoChico: { flex: 1, minWidth: 0 },
  sinMargen: { marginBottom: 0 },
  mini: { ...Typography.caption, color: Colors.textSecondary, marginBottom: 2 },
  alternativas: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs, marginTop: Spacing.xs },
  alt: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: Radius.full,
    backgroundColor: Colors.bgMuted,
  },
  altAgregar: { backgroundColor: Colors.accentGlow },
  altActiva: { backgroundColor: Colors.accent },
  nota: { ...Typography.caption, color: Colors.accent, fontStyle: 'italic' },
  altTexto: { ...Typography.caption, color: Colors.textPrimary },
  filaBotones: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.md },
  propuesta: { borderTopWidth: 1, borderTopColor: Colors.border, paddingVertical: Spacing.sm, marginTop: Spacing.sm },
});

function Opcion({ texto, activa, onPress }: { texto: string; activa: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity style={[styles.alt, activa && styles.altActiva]} onPress={onPress}>
      <Text style={[styles.altTexto, activa && { color: Colors.textInverse }]}>{texto}</Text>
    </TouchableOpacity>
  );
}
