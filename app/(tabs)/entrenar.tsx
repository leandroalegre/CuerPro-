/**
 * Pantalla ENTRENAR
 * - Rutina del día, ejercicio por ejercicio
 * - Anotar repeticiones y peso de cada serie
 * - "Máquina ocupada": elegir una alternativa (cambia para todo el grupo)
 * - Al anotar una serie arranca el descanso que puso el coach
 * - Cada uno puede arrastrar las tarjetas para hacer los ejercicios en otro orden
 * - Por mi cuenta: cualquier día del plan, fuera del encuentro; las series y
 *   los récords cuentan igual, la asistencia no
 * - En el Individual siempre es "por mi cuenta", con tu plan o con el de uno de tus grupos
 * - Por tu cuenta con el plan de un grupo, desde 3 series suma como ir (el grupo lo ve en Hoy)
 * - Por tu cuenta se elige qué día del plan y cuándo lo hiciste: hoy o un día anterior que te
 *   olvidaste de anotar (con series, o "Ya lo hice" sin series), así lo que te toca avanza
 * - Al lado de cada músculo, cuánto se recuperó desde la última vez
 * - Con el grupo, el coach puede cambiar qué día del plan se hace en el encuentro
 * - Cada serie se guarda al tocar "Guardar serie"; si salís y volvés, las anotadas siguen ahí
 * - Tocando una serie anotada se corrige (peso y repeticiones) o se borra
 * - En cada ejercicio, lo que hiciste las últimas veces
 * - Después de cada serie arranca el descanso (el del plan o 1'30''), con −15/+15 y "Descanso" a mano;
 *   los ejercicios por tiempo tienen su cuenta regresiva
 * - Se puede saltar una serie o el ejercicio entero
 * - "Máquina ocupada" deja elegir cualquier ejercicio del catálogo (solo para vos) y
 *   "Agregar ejercicio" suma uno que no estaba en el plan
 */
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Alert, Platform, StyleSheet, TouchableOpacity, Vibration, View } from 'react-native';
import { Text } from '../../components/Letra';
import { NestableDraggableFlatList, NestableScrollContainer, ScaleDecorator } from 'react-native-draggable-flatlist';
import { CambiarDiaEncuentro } from '../../components/CambiarDiaEncuentro';
import { SelectorEjercicio } from '../../components/SelectorEjercicio';
import { AvisoRecuperacion, colorRecuperacion } from '../../components/Recuperacion';
import { Boton, Campo, Card, CardDestacada, Etiqueta, Insignia, pantalla, Texto, Titulo, Vacio } from '../../components/ui';
import { Colors, Radius, Spacing, Typography } from '../../constants/theme';
import { useEncuentro } from '../../hooks/useEncuentro';
import { useRecuperacion } from '../../hooks/useRecuperacion';
import { useSesion } from '../../hooks/useSesion';
import { aerobico, loMasAbandonado, MINUTOS, minutosTotal, ModoCorto, MODOS_CORTOS, versionCorta } from '../../lib/pocoTiempo';
import { api, Ejercicio, EjercicioRutina, EQUIPO, esPorTiempo, fechaHaceDias, Plan, Recuperacion, resumenEjercicio } from '../../lib/api';

export default function EntrenarScreen() {
  const { token, grupo, grupos } = useSesion();
  const { encuentro, recargar } = useEncuentro();
  const params = useLocalSearchParams<{ modo?: string; fecha?: string }>();
  const recuperacion = useRecuperacion();
  // Cuándo lo hiciste: 0 hoy, 1 ayer… (para anotar un día que te olvidaste)
  const [haceDias, setHaceDias] = useState(0);
  const fecha = haceDias ? fechaHaceDias(haceDias) : null;
  const [marcando, setMarcando] = useState(false);
  const [soloElegido, setSolo] = useState(false);
  const solo = soloElegido || !!grupo?.individual;
  // Desde el Individual se puede hacer el plan de un grupo: cuenta para ese grupo
  const [planDe, setPlanDe] = useState<number | null>(null);
  const grupoPlan = (grupo?.individual && grupos.find(g => g.id === planDe)) || grupo;
  const deVerdad = grupos.filter(g => !g.individual);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [diaId, setDiaId] = useState<number | null>(null);
  const [historial, setHistorial] = useState<Historial | null>(null);
  // Al cambiar de grupo (o al Individual) el día elegido era de otro plan
  useEffect(() => { setDiaId(null); setPlan(null); setHistorial(null); setDatosCorto(null); }, [grupoPlan?.id]);
  useEffect(() => setPlanDe(null), [grupo?.id]);
  // "Tengo poco tiempo"
  const [corto, setCorto] = useState<{ modo: ModoCorto; minutos: number } | null>(null);
  const [panelCorto, setPanelCorto] = useState(false);
  const [datosCorto, setDatosCorto] = useState<{ plan: Plan | null; musculos: { musculo: string; dias: number }[]; cardio: Ejercicio[] } | null>(null);

  const abrirPocoTiempo = async () => {
    setPanelCorto(!panelCorto);
    if (datosCorto || !token || !grupoPlan) return;
    try {
      const [p, pr, c] = await Promise.all([
        api<{ plan: Plan | null }>('plan', { grupo_id: grupoPlan.id }, token),
        api<{ musculos: { musculo: string; dias: number }[] }>('progreso', {}, token),
        api<{ ejercicios: Ejercicio[] }>('ejercicios', { grupo_id: grupoPlan.id }, token),
      ]);
      setDatosCorto({ plan: p.plan, musculos: pr.musculos, cardio: c.ejercicios.filter(e => e.musculo_principal === 'cardio') });
    } catch {}
  };

  // La rutina que se muestra: la del día o la versión para poco tiempo
  // nombre: qué se entrena si no es el día del plan
  const armar = (base: EjercicioRutina[]): { rutina: EjercicioRutina[]; titulo: string | null; nombre?: string } => {
    if (!corto) return { rutina: base, titulo: null };
    if (corto.modo === 'corta') return { rutina: versionCorta(base, corto.minutos), titulo: 'Versión corta' };
    if (!datosCorto) return { rutina: [], titulo: null };
    if (corto.modo === 'aerobico') return { rutina: aerobico(datosCorto.cardio, corto.minutos), titulo: 'Aeróbico', nombre: 'Circuito de cardio' };
    const todos = datosCorto.plan?.dias.flatMap(d => d.ejercicios) ?? [];
    const r = loMasAbandonado(todos, datosCorto.musculos, corto.minutos);
    return r
      ? { rutina: r.rutina, titulo: 'Lo más abandonado', nombre: r.zona.charAt(0).toUpperCase() + r.zona.slice(1) }
      : { rutina: [], titulo: null };
  };

  const pocoTiempo = (
    <>
      <TouchableOpacity style={[styles.pocoTiempo, corto && styles.pocoTiempoActivo]} onPress={abrirPocoTiempo}>
        <Ionicons name="timer-outline" size={18} color={corto ? Colors.textInverse : Colors.accent} />
        <Text style={[styles.pocoTiempoTexto, corto && { color: Colors.textInverse }]}>
          {corto ? `Poco tiempo: ${corto.minutos} min` : 'Tengo poco tiempo'}
        </Text>
      </TouchableOpacity>
      {panelCorto && (
        <Card>
          <Etiqueta>¿Qué hacés?</Etiqueta>
          {MODOS_CORTOS.map(m => {
            const elegido = (corto?.modo ?? null) === m.modo;
            return (
              <TouchableOpacity
                key={m.modo}
                style={[styles.opcionCorta, elegido && styles.opcionCortaActiva]}
                onPress={() => setCorto({ modo: m.modo, minutos: corto?.minutos ?? 45 })}
              >
                <Ionicons name={elegido ? 'radio-button-on' : 'radio-button-off'} size={20} color={elegido ? Colors.accent : Colors.textMuted} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.opcionCortaTitulo}>{m.modo === 'corta' ? `${m.texto} (recomendada)` : m.texto}</Text>
                  <Text style={styles.opcionCortaTexto}>{m.explicacion}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
          <Etiqueta>Minutos</Etiqueta>
          <View style={styles.modos}>
            {MINUTOS.map(n => (
              <Modo key={n} texto={`${n} min`} activo={corto?.minutos === n} onPress={() => setCorto({ modo: corto?.modo ?? 'corta', minutos: n })} />
            ))}
          </View>
          <Texto muted>Lo que hagas suma igual a tu progreso, aunque no completes el plan.</Texto>
          {corto && <Boton titulo="Volver al plan completo" tipo="secundario" onPress={() => { setCorto(null); setPanelCorto(false); }} style={{ marginTop: Spacing.sm }} />}
        </Card>
      )}
    </>
  );

  // Desde Hoy, "Entrenar por mi cuenta" llega con ?modo=solo
  useFocusEffect(useCallback(() => {
    if (params.modo === 'solo') setSolo(true);
    // Una sola vez: si no, cada vez que volvés a la pestaña vuelve a "Ayer"
    if (params.fecha === 'ayer') { setHaceDias(1); router.setParams({ fecha: undefined }); }
  }, [params.modo, params.fecha]));

  const cargarPlan = useCallback(async () => {
    if (!token || !grupoPlan) return;
    try {
      const [data, hist] = await Promise.all([
        api<{ plan: Plan | null }>('plan', { grupo_id: grupoPlan.id }, token),
        api<Historial>('mis_entrenamientos', { grupo_id: grupoPlan.id }, token),
      ]);
      setPlan(data.plan);
      setHistorial(hist);
      setDiaId(d => d ?? hist.recomendado?.dia_id ?? data.plan?.dias[0]?.id ?? null);
    } catch {}
  }, [token, grupoPlan?.id, encuentro?.dia?.id]);

  useFocusEffect(useCallback(() => {
    if (solo) cargarPlan();
  }, [solo, cargarPlan]));

  const dia = plan?.dias.find(d => d.id === diaId);

  // "Ya lo hice": marca el día del plan como hecho en esa fecha, sin series (no suma puntos)
  const marcarHecho = async () => {
    if (!dia || !grupoPlan) return;
    setMarcando(true);
    try {
      await api('dia_hecho', { grupo_id: grupoPlan.id, dia_id: dia.id, ...(fecha && { fecha }) }, token);
      const hist = await api<Historial>('mis_entrenamientos', { grupo_id: grupoPlan.id }, token);
      setHistorial(hist);
      setDiaId(hist.recomendado?.dia_id ?? dia.id);
      setHaceDias(0);
      recuperacion.recargar();
      avisar('Listo', `Anotamos ${dia.nombre} ${fecha ? `el ${fechaCorta(fecha)}` : 'hoy'}.${hist.recomendado ? ` Ahora te toca ${hist.recomendado.nombre}.` : ''}`);
    } catch (e: any) {
      avisar('No se pudo', e.message);
    } finally {
      setMarcando(false);
    }
  };

  const desmarcar = async (f: string) => {
    if (!grupoPlan) return;
    try {
      await api('dia_hecho', { grupo_id: grupoPlan.id, fecha: f, borrar: 1 }, token);
      setHistorial(await api<Historial>('mis_entrenamientos', { grupo_id: grupoPlan.id }, token));
      recuperacion.recargar();
    } catch (e: any) {
      avisar('No se pudo', e.message);
    }
  };

  return (
    <NestableScrollContainer
      style={pantalla.scroll}
      contentContainerStyle={pantalla.contenido}
      // Sin "tirar para actualizar": en Android, dentro del ScrollView de gesture-handler, trababa el scroll.
      // Los datos se recargan solos cada vez que entrás a la pestaña.
      keyboardShouldPersistTaps="handled"
    >
      {!grupo?.individual && (
        <View style={styles.modos}>
          <Modo texto="Con el grupo" activo={!solo} onPress={() => setSolo(false)} />
          <Modo texto="Por mi cuenta" activo={solo} onPress={() => setSolo(true)} />
        </View>
      )}

      {!solo && (!encuentro ? (
        <Vacio texto="El grupo todavía no tiene días y horarios. El coach los carga en Grupos. Mientras, podés entrenar por tu cuenta." />
      ) : !encuentro.rutina.length ? (
        <Vacio texto="No hay rutina para el próximo entrenamiento del grupo. Podés entrenar por tu cuenta." />
      ) : (
        <>
          <CardDestacada>
            <Insignia texto={armar(encuentro.rutina).titulo ?? 'Toca hoy'} />
            <Text style={styles.diaTitulo}>{armar(encuentro.rutina).nombre ?? encuentro.dia?.nombre}</Text>
            <Text style={styles.diaMeta}>
              {`${armar(encuentro.rutina).rutina.length} ejercicios · ~${minutosTotal(armar(encuentro.rutina).rutina)} min · arrastrá ≡ para cambiar el orden`}
            </Text>
            <AvisoRecuperacion lista={recuperacion.deEjercicios(armar(encuentro.rutina).rutina)} />
            {grupo?.rol === 'coach' && encuentro.dia && !corto && (
              <CambiarDiaEncuentro encuentroId={encuentro.id} diaId={encuentro.dia.id} onCambio={recargar} />
            )}
          </CardDestacada>
          {pocoTiempo}
          <ListaRutina
            key={corto ? `${corto.modo}-${corto.minutos}` : 'plan'}
            rutina={armar(encuentro.rutina).rutina}
            encuentroId={encuentro.id}
            grupoId={encuentro.grupo_id}
            recuperacion={recuperacion.lista}
            onCambio={recargar}
          />
        </>
      ))}

      {!!grupo?.individual && deVerdad.length > 0 && (
        <>
          <Etiqueta>¿Qué plan hacés?</Etiqueta>
          <View style={styles.modos}>
            <Modo texto="Mi plan" activo={grupoPlan?.id === grupo.id} onPress={() => setPlanDe(null)} />
            {deVerdad.map(g => (
              <Modo key={g.id} texto={`Plan de ${g.nombre}`} activo={grupoPlan?.id === g.id} onPress={() => setPlanDe(g.id)} />
            ))}
          </View>
        </>
      )}

      {solo && (!grupo || !grupoPlan ? (
        <Vacio texto="Para entrenar por tu cuenta necesitás un plan: creá un grupo propio en Grupos (puede ser solo vos) y armalo en Plan." />
      ) : !plan?.dias.length ? (
        <Vacio texto={grupoPlan.id !== grupo.id
          ? `${grupoPlan.nombre} todavía no tiene plan.`
          : grupo.individual
          ? 'Todavía no armaste tu plan. Armalo en la pestaña Plan y después entrenás cuando quieras.'
          : 'Tu grupo todavía no tiene plan. Cuando el coach lo arme, vas a poder entrenar cualquier día por tu cuenta.'} />
      ) : (
        <>
          {!!historial?.entrenamientos.length && (
            <Card>
              <Etiqueta>Tus últimos entrenamientos</Etiqueta>
              {historial.entrenamientos.map(e => (
                <View key={e.fecha} style={styles.filaHistorial}>
                  <Text style={styles.fechaHistorial}>{fechaCorta(e.fecha)}</Text>
                  <Text style={styles.textoHistorial} numberOfLines={1}>{`${e.dia_nombre ?? e.musculos.join(', ')}${e.marcado ? ' (sin series)' : ''}`}</Text>
                  {e.marcado && (
                    <TouchableOpacity onPress={() => desmarcar(e.fecha)} hitSlop={10} accessibilityLabel="Desmarcar">
                      <Ionicons name="close-circle-outline" size={18} color={Colors.textMuted} />
                    </TouchableOpacity>
                  )}
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
          <Texto muted>
            {grupoPlan.individual
              ? 'Elegí qué día del plan hacés. Con 3 series anotadas sumás 10 puntos.'
              : `Elegí qué día del plan hacés. Con 3 series anotadas sumás 10 puntos en ${grupoPlan.nombre}, igual que ir, y el grupo lo ve.`}
          </Texto>
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
          <Etiqueta>¿Qué día lo anotás?</Etiqueta>
          <View style={styles.modos}>
            {[0, 1, 2, 3, 4, 5, 6].map(n => (
              <Modo key={n} texto={n === 0 ? 'Hoy' : n === 1 ? 'Ayer' : fechaCorta(fechaHaceDias(n))} activo={haceDias === n} onPress={() => setHaceDias(n)} />
            ))}
          </View>
          {!!fecha && (
            <Texto muted>{`Lo anotás el ${fechaCorta(fecha)}. Anotá las series que te acuerdes (con 3 suma los puntos de ese día) o tocá "Ya lo hice" si no te acordás los pesos.`}</Texto>
          )}
          {dia && <AvisoRecuperacion lista={haceDias ? [] : recuperacion.deEjercicios(dia.ejercicios)} />}
          {dia && (fecha ? (
            <Boton
              titulo={`Ya lo hice el ${fechaCorta(fecha)} (sin anotar series)`}
              tipo="secundario"
              onPress={marcarHecho}
              cargando={marcando}
              style={{ marginVertical: Spacing.sm }}
            />
          ) : (
            <TouchableOpacity onPress={marcarHecho} disabled={marcando} style={{ marginBottom: Spacing.md }}>
              <Text style={[styles.modoTexto, { color: Colors.accent }]}>Ya lo hice hoy, marcarlo sin anotar series</Text>
            </TouchableOpacity>
          ))}
          {pocoTiempo}
          {dia && corto && (
            <Texto muted>{`${armar(dia.ejercicios).titulo}${armar(dia.ejercicios).nombre ? `: ${armar(dia.ejercicios).nombre}` : ''} · ${armar(dia.ejercicios).rutina.length} ejercicios · ~${minutosTotal(armar(dia.ejercicios).rutina)} min`}</Texto>
          )}
          {dia && (
            <ListaRutina
              key={`${dia.id}-${fecha ?? 'hoy'}-${corto ? `${corto.modo}-${corto.minutos}` : 'plan'}`}
              rutina={armar(dia.ejercicios).rutina}
              encuentroId={null}
              grupoId={grupoPlan.id}
              recuperacion={haceDias ? [] : recuperacion.lista}
              cuenta={{ grupoId: grupoPlan.id, diaId: dia.id, nombre: grupoPlan.individual ? null : grupoPlan.nombre, fecha }}
              onCambio={() => {}}
            />
          )}
        </>
      ))}
    </NestableScrollContainer>
  );
}

interface Historial {
  entrenamientos: { fecha: string; dia_id: number | null; dia_nombre: string | null; musculos: string[]; marcado?: boolean }[];
  recomendado: { dia_id: number; nombre: string; texto: string } | null;
}

// En la web Alert.alert no muestra nada
function avisar(titulo: string, texto: string) {
  if (Platform.OS === 'web') window.alert(`${titulo}\n\n${texto}`);
  else Alert.alert(titulo, texto);
}

// Franja izquierda de cada tarjeta, donde está la manija ≡
const MANIJA = { left: 0, width: 64 };

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
// Por tu cuenta: con qué grupo y qué día del plan (nombre null en el Individual)
// fecha: un día anterior que se anota tarde ("2026-11-02"); null es hoy
interface Cuenta { grupoId: number; diaId: number; nombre: string | null; fecha?: string | null }

function ListaRutina({
  rutina: rutinaPlan,
  encuentroId,
  grupoId,
  cuenta,
  recuperacion,
  onCambio,
}: {
  rutina: EjercicioRutina[];
  encuentroId: number | null;
  grupoId: number;
  cuenta?: Cuenta;
  recuperacion: Recuperacion[];
  onCambio: () => void;
}) {
  const { token } = useSesion();
  const [orden, setOrden] = useState<number[]>([]);

  // Ejercicios que agregaste hoy (no estaban en el plan) y los que cambiaste por otro del
  // catálogo porque la máquina no se desocupaba. Son solo para vos y para este entrenamiento.
  const [extras, setExtras] = useState<EjercicioRutina[]>([]);
  const [otros, setOtros] = useState<Record<number, Ejercicio>>({});
  const rutina = [...rutinaPlan, ...extras];
  const porId = new Map(rutina.map(e => [e.plan_ejercicio_id, e]));
  // El selector abierto: para cambiar un ejercicio (su plan_ejercicio_id) o para agregar uno
  const [eligiendo, setEligiendo] = useState<{ para: number | 'nuevo'; sugerir?: Ejercicio } | null>(null);
  const [catalogo, setCatalogo] = useState<Ejercicio[]>([]);
  const abrirSelector = async (para: number | 'nuevo') => {
    const base = para === 'nuevo' ? undefined : porId.get(para);
    setEligiendo({ para, sugerir: base && { id: base.ejercicio_id, grupo_id: null, nombre: base.nombre, musculo_principal: base.musculo_principal, musculos_secundarios: '', equipo: base.equipo, movimiento: '' } });
    if (catalogo.length || !token) return;
    try {
      setCatalogo((await api<{ ejercicios: Ejercicio[] }>('ejercicios', { grupo_id: grupoId }, token)).ejercicios);
    } catch {}
  };
  const elegido = (e: Ejercicio) => {
    if (!eligiendo) return;
    if (eligiendo.para === 'nuevo') {
      setExtras([...extras, {
        plan_ejercicio_id: -Date.now(), ejercicio_id: e.id, nombre: e.nombre, musculo_principal: e.musculo_principal,
        equipo: e.equipo, series: 3, repeticiones: '10', peso_sugerido: null, carga: null,
        descanso_seg: null, nota: null, union_siguiente: null, alternativas: [], cambio: null,
      }]);
    } else {
      setOtros({ ...otros, [eligiendo.para]: e });
    }
    setEligiendo(null);
  };

  // Las series ya anotadas en este entrenamiento y las de las últimas veces
  const [series, setSeries] = useState<SeriesEjercicios | null>(null);
  const ids = [...new Set([
    ...rutina.flatMap(e => [e.ejercicio_id, ...(e.cambio ? [e.cambio.ejercicio_id] : []), ...e.alternativas.map(a => a.ejercicio_id)]),
    ...Object.values(otros).map(e => e.id),
  ])];
  const claveIds = ids.join(',');
  useEffect(() => {
    if (!token || !ids.length) return;
    let vivo = true;
    const contexto = encuentroId !== null
      ? { encuentro_id: encuentroId }
      : cuenta ? { grupo_id: cuenta.grupoId, ...(cuenta.fecha && { fecha: cuenta.fecha }) } : {};
    api<SeriesEjercicios>('series_ejercicios', { ejercicio_ids: ids, ...contexto }, token)
      .then(d => vivo && setSeries(d))
      .catch(() => vivo && setSeries({ actuales: {}, anteriores: {} }));
    return () => { vivo = false; };
  }, [token, claveIds, encuentroId, cuenta?.grupoId, cuenta?.fecha]);
  // Respeta el orden que armaste; lo que no estaba (o si cambió el plan) va al final, en el orden del plan
  const datos = [
    ...orden.map(id => porId.get(id)).filter((e): e is EjercicioRutina => !!e),
    ...rutina.filter(e => !orden.includes(e.plan_ejercicio_id)),
  ];

  return (
    <>
    <NestableDraggableFlatList
      data={datos}
      keyExtractor={e => String(e.plan_ejercicio_id)}
      onDragEnd={({ data }) => setOrden(data.map(e => e.plan_ejercicio_id))}
      activationDistance={8}
      // El arrastre solo empieza en la franja de la manija ≡; el resto de la tarjeta deja scrollear la pantalla (en Android si no, el gesto se come el scroll)
      dragHitSlop={MANIJA}
      renderItem={({ item, drag, isActive, getIndex }) => (
        <ScaleDecorator>
          <EjercicioCard
            ej={item}
            encuentroId={encuentroId}
            cuenta={cuenta}
            series={series}
            otro={otros[item.plan_ejercicio_id] ?? null}
            onElegirOtro={() => abrirSelector(item.plan_ejercicio_id)}
            onVolverAlPlan={() => { const { [item.plan_ejercicio_id]: _, ...resto } = otros; setOtros(resto); }}
            onQuitar={item.plan_ejercicio_id < 0 ? () => setExtras(extras.filter(x => x.plan_ejercicio_id !== item.plan_ejercicio_id)) : undefined}
            recuperacion={recuperacion.find(r => r.musculo === item.musculo_principal) ?? null}
            onCambio={onCambio}
            drag={drag}
            activo={isActive}
            siguiente={item.union_siguiente ? datos[(getIndex() ?? 0) + 1]?.nombre : undefined}
          />
        </ScaleDecorator>
      )}
    />
    <TouchableOpacity style={styles.agregar} onPress={() => abrirSelector('nuevo')}>
      <Ionicons name="add-circle-outline" size={20} color={Colors.accent} />
      <Text style={styles.agregarTexto}>Agregar un ejercicio</Text>
    </TouchableOpacity>
    <SelectorEjercicio
      visible={!!eligiendo}
      titulo={eligiendo?.para === 'nuevo' ? 'Agregar un ejercicio' : 'Cambiar por otro ejercicio'}
      ejercicios={catalogo}
      sugerir={eligiendo?.sugerir ?? null}
      onElegir={elegido}
      onCerrar={() => setEligiendo(null)}
    />
    </>
  );
}

function EjercicioCard({
  ej,
  encuentroId,
  cuenta,
  series,
  otro,
  onElegirOtro,
  onVolverAlPlan,
  onQuitar,
  recuperacion,
  onCambio,
  drag,
  activo,
  siguiente,
}: {
  ej: EjercicioRutina;
  encuentroId: number | null; // null: por mi cuenta
  cuenta?: Cuenta;
  series: SeriesEjercicios | null; // null: cargando
  otro: Ejercicio | null; // lo cambiaste por otro del catálogo (solo para vos)
  onElegirOtro: () => void;
  onVolverAlPlan: () => void;
  onQuitar?: () => void; // los que agregaste hoy se pueden sacar
  recuperacion: Recuperacion | null; // null: el músculo está al 100%
  onCambio: () => void;
  drag: () => void;
  activo: boolean;
  siguiente?: string; // si va en superserie o circuito con el que sigue
}) {
  const { token } = useSesion();
  const [verAlternativas, setVerAlternativas] = useState(false);
  const [reps, setReps] = useState(String(ej.repeticiones).split('-')[0]);
  const [peso, setPeso] = useState(ej.peso_sugerido ? String(Number(ej.peso_sugerido)) : '');
  const [hechas, setHechas] = useState<Hecha[]>([]);
  // La serie anotada que se está corrigiendo (índice en hechas)
  const [editando, setEditando] = useState<number | null>(null);
  const [verMasHistorial, setVerMasHistorial] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [finDescanso, setFinDescanso] = useState<number | null>(null);
  const [saltado, setSaltado] = useState(false); // no se hace hoy: queda chiquito, se puede deshacer
  const porTiempo = esPorTiempo(ej.repeticiones);
  const descanso = ej.descanso_seg || DESCANSO_POR_DEFECTO;

  // Por mi cuenta, la alternativa es solo para vos y no se guarda
  const [cambioPropio, setCambioPropio] = useState<number | null>(null);
  const propia = ej.alternativas.find(a => a.ejercicio_id === cambioPropio);

  const actual = otro
    ? { ejercicio_id: otro.id, nombre: otro.nombre, equipo: otro.equipo }
    : propia ?? ej.cambio ?? { ejercicio_id: ej.ejercicio_id, nombre: ej.nombre, equipo: ej.equipo };
  const extra = ej.plan_ejercicio_id < 0;
  const anotadas = hechas.filter(h => !h.saltada).length;
  const anteriores = series?.anteriores[actual.ejercicio_id] ?? [];

  // Cuando llegan del servidor: las series que ya anotaste hoy (si saliste y volviste)
  // y, si el plan no dice peso, el de la última vez
  const [restaurado, setRestaurado] = useState(false);
  useEffect(() => {
    if (!series || restaurado) return;
    setRestaurado(true);
    const ya = series.actuales[actual.ejercicio_id] ?? [];
    if (ya.length && !hechas.length) {
      setHechas(ya.map(s => ({ id: s.id, reps: s.repeticiones, peso: s.peso, record: false })));
      setPeso(String(ya[ya.length - 1].peso));
    } else if (!ej.peso_sugerido && !peso) {
      const ultima = anteriores[0]?.series;
      if (ultima?.length) setPeso(String(ultima[ultima.length - 1].peso));
    }
  }, [series]);

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
      avisar('Faltan las repeticiones', 'Poné cuántas repeticiones hiciste.');
      return;
    }
    if (!(await pareceBien(r, p))) return;
    setGuardando(true);
    try {
      const data = await api<{ id: number; record: boolean; sumo: boolean }>('serie_guardar', {
        ...(encuentroId !== null && { encuentro_id: encuentroId }),
        ...(encuentroId === null && cuenta && { grupo_id: cuenta.grupoId, dia_id: cuenta.diaId, ...(cuenta.fecha && { fecha: cuenta.fecha }) }),
        ejercicio_id: actual.ejercicio_id,
        numero: hechas.length + 1,
        repeticiones: r,
        peso: p,
      }, token);
      setHechas([...hechas, { id: data.id, reps: r, peso: p, record: data.record }]);
      // En superserie o circuito se pasa directo al siguiente; el descanso va al final de la vuelta
      // Descanso después de cada serie (el del plan o 1'30''), salvo en superserie o circuito
      if (!ej.union_siguiente) setFinDescanso(Date.now() + descanso * 1000);
      if (data.record) avisar('¡Récord personal!', `Sumaste 15 puntos con ${p} kg.`);
      else if (data.sumo) avisar('¡Entrenamiento sumado!', cuenta?.nombre ? `Sumaste 10 puntos en ${cuenta.nombre}, como si hubieras ido.` : 'Sumaste 10 puntos.');
    } catch (e: any) {
      avisar('No se guardó la serie', `${e.message}. Probá de nuevo.`);
    } finally {
      setGuardando(false);
    }
  };

  // Corregir o borrar una serie ya anotada
  const corregir = async (i: number, r: number, p: number) => {
    const s = hechas[i];
    if (!s?.id) return;
    if (!(await pareceBien(r, p))) return;
    try {
      const data = await api<{ record: boolean }>('serie_editar', { serie_id: s.id, repeticiones: r, peso: p }, token);
      setHechas(hechas.map((h, j) => (j === i ? { ...h, reps: r, peso: p, record: data.record } : h)));
      setEditando(null);
    } catch (e: any) {
      avisar('No se pudo corregir', e.message);
    }
  };
  const borrar = async (i: number) => {
    const s = hechas[i];
    if (!s?.id) return;
    if (!(await confirmar('Borrar serie', `¿Borrás la serie ${i + 1} (${s.peso} kg × ${s.reps})?`))) return;
    try {
      await api('serie_borrar', { serie_id: s.id }, token);
      setHechas(hechas.filter((_, j) => j !== i));
      setEditando(null);
    } catch (e: any) {
      avisar('No se pudo borrar', e.message);
    }
  };

  const terminado = porTiempo ? hechas.length > 0 : hechas.length >= ej.series;

  if (saltado) {
    return (
      <Card style={activo ? { ...styles.saltado, borderColor: Colors.accent } : styles.saltado}>
        <View style={styles.cabecera}>
          <TouchableOpacity onPressIn={drag} disabled={activo} hitSlop={12} style={styles.manija} accessibilityLabel="Arrastrar para mover">
            <Ionicons name="reorder-three" size={26} color={Colors.textMuted} />
          </TouchableOpacity>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.saltadoNombre}>{actual.nombre}</Text>
            <Text style={styles.saltadoTexto}>{anotadas ? `Saltado después de ${anotadas} ${anotadas === 1 ? 'serie' : 'series'}` : 'Saltado hoy'}</Text>
          </View>
          <TouchableOpacity onPress={() => setSaltado(false)} hitSlop={8} style={styles.botonChico}>
            <Text style={styles.botonChicoTexto}>Deshacer</Text>
          </TouchableOpacity>
        </View>
      </Card>
    );
  }

  return (
    <Card style={activo ? { borderColor: Colors.accent } : undefined}>
      <View style={styles.cabecera}>
        <TouchableOpacity onPressIn={drag} disabled={activo} hitSlop={12} style={styles.manija} accessibilityLabel="Arrastrar para mover">
          <Ionicons name="reorder-three" size={26} color={Colors.textMuted} />
        </TouchableOpacity>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Titulo>{actual.nombre}</Titulo>
        </View>
        {!terminado && (
          <TouchableOpacity
            onPress={() => { setSaltado(true); setFinDescanso(null); setVerAlternativas(false); }}
            hitSlop={8}
            style={[styles.botonChico, { marginBottom: Spacing.sm }]}
            accessibilityLabel={`Saltar ${actual.nombre}`}
          >
            <Text style={styles.botonChicoTexto}>Saltar</Text>
          </TouchableOpacity>
        )}
      </View>
      {extra ? (
        <Texto muted>Agregado hoy, no está en el plan</Texto>
      ) : otro ? (
        <Texto muted>{`En lugar de ${ej.nombre} (solo para vos)`}</Texto>
      ) : propia ? (
        <Texto muted>{`En lugar de ${ej.nombre}`}</Texto>
      ) : ej.cambio && <Texto muted>{`En lugar de ${ej.nombre} (lo cambió ${ej.cambio.elegido_por})`}</Texto>}
      <Texto muted>{`${resumenEjercicio(ej)} · ${ej.musculo_principal}`}</Texto>
      {recuperacion && (
        <Text style={[styles.recuperacion, { color: colorRecuperacion(recuperacion.porcentaje) }]}>
          {`${ej.musculo_principal} al ${recuperacion.porcentaje}% de recuperación`}
        </Text>
      )}
      {!!siguiente && (
        <Text style={styles.union}>
          {`${ej.union_siguiente === 'superserie' ? '↕ Superserie' : '↻ Circuito'} con ${siguiente}: pasá directo, sin descanso`}
        </Text>
      )}
      {!!ej.nota && <Text style={styles.nota}>{ej.nota}</Text>}

      {!porTiempo && anteriores.length > 0 && (
        <View style={styles.historial}>
          {(verMasHistorial ? anteriores : anteriores.slice(0, 1)).map((v, i) => (
            <Text key={v.fecha} style={styles.historialTexto}>
              <Text style={styles.historialFecha}>{`${i === 0 ? 'Última vez' : 'Antes'} (${fechaCorta(v.fecha)}): `}</Text>
              {v.series.map(x => `${x.peso}×${x.repeticiones}`).join('  ')}
            </Text>
          ))}
          <Text style={styles.historialFecha}>kg × repeticiones</Text>
          {anteriores.length > 1 && (
            <TouchableOpacity onPress={() => setVerMasHistorial(!verMasHistorial)} hitSlop={8}>
              <Text style={styles.historialMas}>{verMasHistorial ? 'Ver menos' : `Ver las ${anteriores.length} últimas veces`}</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {!porTiempo && hechas.map((s, i) => (
        s.saltada ? (
          <TouchableOpacity key={`saltada-${i}`} onPress={() => setHechas(hechas.filter((_, j) => j !== i))} style={styles.filaSerie} accessibilityLabel={`Deshacer saltar serie ${i + 1}`}>
            <Ionicons name="play-skip-forward" size={16} color={Colors.textMuted} />
            <Text style={styles.serieSaltada}>{`Serie ${i + 1}: saltada`}</Text>
            <Text style={[styles.ayuda, { marginLeft: 'auto', marginTop: 0 }]}>Deshacer</Text>
          </TouchableOpacity>
        ) : editando === i ? (
          <EditarSerie key={s.id ?? i} numero={i + 1} serie={s} onGuardar={(r, p) => corregir(i, r, p)} onBorrar={() => borrar(i)} onCancelar={() => setEditando(null)} />
        ) : (
          <TouchableOpacity key={s.id ?? i} onPress={() => s.id && setEditando(i)} style={styles.filaSerie} accessibilityLabel={`Corregir serie ${i + 1}`}>
            <Ionicons name="checkmark-circle" size={18} color={Colors.success} />
            <Text style={styles.serie}>{`Serie ${i + 1}: ${s.peso} kg × ${s.reps} reps${s.record ? '  🏆' : ''}`}</Text>
            {!!s.id && <Ionicons name="pencil" size={14} color={Colors.textMuted} style={{ marginLeft: 'auto' }} />}
          </TouchableOpacity>
        )
      ))}
      {!porTiempo && hechas.some(h => h.id) && editando === null && (
        <Text style={styles.ayuda}>Guardadas. Tocá una serie para corregirla.</Text>
      )}

      {finDescanso && (
        <Descanso
          fin={finDescanso}
          onTerminar={() => setFinDescanso(null)}
          onAjustar={seg => setFinDescanso(f => (f ? Math.max(Date.now() + 1000, f + seg * 1000) : f))}
        />
      )}

      {porTiempo && (
        hechas.length ? (
          <Text style={styles.serie}>Hecho ✓</Text>
        ) : (
          <CuentaRegresiva
            segundos={segundosDe(ej.repeticiones)}
            onListo={() => setHechas([{ reps: 0, peso: 0, record: false }])}
          />
        )
      )}

      {!porTiempo && hechas.length < ej.series && (
        <>
          <View style={styles.fila}>
            <View style={styles.columna}>
              <Text style={styles.rotulo}>Peso (kg)</Text>
              <Campo style={styles.campo} value={peso} onChangeText={setPeso} keyboardType="decimal-pad" placeholder="0" selectTextOnFocus accessibilityLabel="Peso en kilos" />
            </View>
            <Text style={styles.por}>×</Text>
            <View style={styles.columna}>
              <Text style={styles.rotulo}>Repeticiones</Text>
              <Campo style={styles.campo} value={reps} onChangeText={setReps} keyboardType="number-pad" placeholder="0" selectTextOnFocus accessibilityLabel="Repeticiones" />
            </View>
          </View>
          <Boton titulo={`Guardar serie ${hechas.length + 1} de ${ej.series}`} onPress={guardarSerie} cargando={guardando} style={{ marginTop: Spacing.sm }} />
          <View style={styles.acciones}>
            <TouchableOpacity onPress={() => setHechas([...hechas, { reps: 0, peso: 0, record: false, saltada: true }])} hitSlop={8} style={styles.botonChico}>
              <Text style={styles.botonChicoTexto}>{`Saltar serie ${hechas.length + 1}`}</Text>
            </TouchableOpacity>
            {!finDescanso && (
              <TouchableOpacity onPress={() => setFinDescanso(Date.now() + descanso * 1000)} hitSlop={8} style={styles.botonChico}>
                <Text style={styles.botonChicoTexto}>{`⏱ Descanso ${textoTiempo(descanso)}`}</Text>
              </TouchableOpacity>
            )}
          </View>
        </>
      )}

      {extra ? (
        <Boton titulo="Quitar este ejercicio" tipo="secundario" onPress={onQuitar ?? (() => {})} style={{ marginTop: Spacing.sm }} />
      ) : (
        <Boton
          titulo={verAlternativas ? 'Cerrar' : 'Máquina ocupada'}
          tipo="secundario"
          onPress={() => setVerAlternativas(!verAlternativas)}
          style={{ marginTop: Spacing.sm }}
        />
      )}
      {verAlternativas && (
        <View style={{ marginTop: Spacing.sm, gap: Spacing.sm }}>
          {otro ? (
            <Boton titulo={`Volver a ${propia?.nombre ?? ej.cambio?.nombre ?? ej.nombre}`} tipo="secundario" onPress={() => { onVolverAlPlan(); setVerAlternativas(false); }} />
          ) : (
            <>
              {(ej.alternativas.length > 0 || !!ej.cambio) && (
                <Texto muted>{encuentroId === null ? 'Alternativas del plan (el cambio es solo para vos):' : 'Alternativas del plan (el cambio vale para todo el grupo):'}</Texto>
              )}
              {actual.ejercicio_id !== ej.ejercicio_id && (
                <Boton titulo={`Volver a ${ej.nombre}`} tipo="secundario" onPress={() => elegir(ej.ejercicio_id)} />
              )}
              {ej.alternativas
                .filter(a => a.ejercicio_id !== actual.ejercicio_id)
                .map(a => (
                  <Boton key={a.ejercicio_id} titulo={`${a.nombre} (${EQUIPO[a.equipo] ?? a.equipo})`} tipo="secundario" onPress={() => elegir(a.ejercicio_id)} />
                ))}
            </>
          )}
          <Boton titulo="Elegir otro ejercicio…" tipo="secundario" onPress={() => { onElegirOtro(); setVerAlternativas(false); }} />
          <Texto muted>Si elegís otro, el cambio es solo para vos y para hoy.</Texto>
        </View>
      )}
    </Card>
  );
}

interface Hecha { id?: number; reps: number; peso: number; record: boolean; saltada?: boolean }

const DESCANSO_POR_DEFECTO = 90; // segundos, si el plan no dice

// 90 → "1:30"
function textoTiempo(seg: number) {
  return `${Math.floor(seg / 60)}:${String(seg % 60).padStart(2, '0')}`;
}

// "6 min" → 360, "45''" o "45 seg" → 45, "1'30''" → 90
function segundosDe(repeticiones: string) {
  const t = repeticiones.toLowerCase();
  const m = t.match(/(\d+(?:[.,]\d+)?)\s*(?:min|')(?!')/);
  const sg = t.match(/(\d+)\s*(?:seg|s\b|'')/);
  const total = (m ? Number(m[1].replace(',', '.')) * 60 : 0) + (sg ? Number(sg[1]) : 0);
  return Math.round(total) || 60;
}

// Cuenta regresiva de un ejercicio por tiempo: Empezar, Pausa, y al terminar vibra y queda hecho
function CuentaRegresiva({ segundos, onListo }: { segundos: number; onListo: () => void }) {
  const [quedan, setQuedan] = useState(segundos);
  const [corriendo, setCorriendo] = useState(false);
  useEffect(() => {
    if (!corriendo) return;
    const t = setInterval(() => setQuedan(q => Math.max(0, q - 1)), 1000);
    return () => clearInterval(t);
  }, [corriendo]);
  useEffect(() => {
    if (quedan > 0 || !corriendo) return;
    if (Platform.OS !== 'web') Vibration.vibrate([0, 400, 200, 400]);
    onListo();
  }, [quedan, corriendo]);
  return (
    <View style={styles.descanso}>
      <Text style={styles.descansoTexto}>{textoTiempo(quedan)}</Text>
      <View style={styles.acciones}>
        <TouchableOpacity onPress={() => setCorriendo(!corriendo)} style={styles.botonChico}>
          <Text style={styles.botonChicoTexto}>{corriendo ? 'Pausa' : quedan < segundos ? 'Seguir' : '▶ Empezar'}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onListo} style={styles.botonChico}>
          <Text style={styles.botonChicoTexto}>Listo</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
interface SeriesEjercicios {
  // Por ejercicio: lo anotado en este entrenamiento
  actuales: Record<number, { id: number; numero: number; repeticiones: number; peso: number }[]>;
  // Por ejercicio: las últimas 3 veces, de la más nueva a la más vieja
  anteriores: Record<number, { fecha: string; series: { repeticiones: number; peso: number }[] }[]>;
}

async function confirmar(titulo: string, texto: string, boton = 'Borrar') {
  if (Platform.OS === 'web') return window.confirm(`${titulo}\n\n${texto}`);
  return new Promise<boolean>(ok => Alert.alert(titulo, texto, [
    { text: 'Cancelar', style: 'cancel', onPress: () => ok(false) },
    { text: boton, onPress: () => ok(true) },
  ]));
}

// Si parece que se invirtieron peso y repeticiones, pregunta antes de guardar
async function pareceBien(reps: number, peso: number) {
  if (reps <= 30) return true;
  return confirmar('¿Está bien?', `Pusiste ${reps} repeticiones con ${peso} kg. ¿No será al revés?`, 'Sí, está bien');
}

// Corregir una serie ya anotada
function EditarSerie({ numero, serie, onGuardar, onBorrar, onCancelar }: {
  numero: number;
  serie: Hecha;
  onGuardar: (reps: number, peso: number) => Promise<void>;
  onBorrar: () => void;
  onCancelar: () => void;
}) {
  const [peso, setPeso] = useState(String(serie.peso));
  const [reps, setReps] = useState(String(serie.reps));
  const [guardando, setGuardando] = useState(false);
  const guardar = async () => {
    const r = Number(reps);
    if (!r) return avisar('Faltan las repeticiones', 'Poné cuántas repeticiones hiciste.');
    setGuardando(true);
    await onGuardar(r, Number(peso.replace(',', '.') || 0));
    setGuardando(false);
  };
  return (
    <View style={styles.editar}>
      <Text style={styles.rotulo}>{`Corregir serie ${numero}`}</Text>
      <View style={styles.fila}>
        <View style={styles.columna}>
          <Text style={styles.rotulo}>Peso (kg)</Text>
          <Campo style={styles.campo} value={peso} onChangeText={setPeso} keyboardType="decimal-pad" selectTextOnFocus />
        </View>
        <Text style={styles.por}>×</Text>
        <View style={styles.columna}>
          <Text style={styles.rotulo}>Repeticiones</Text>
          <Campo style={styles.campo} value={reps} onChangeText={setReps} keyboardType="number-pad" selectTextOnFocus />
        </View>
      </View>
      <TouchableOpacity onPress={() => { setPeso(reps); setReps(peso); }} style={{ marginTop: Spacing.sm }}>
        <Text style={styles.historialMas}>⇄ Invertir peso y repeticiones</Text>
      </TouchableOpacity>
      <View style={[styles.fila, { marginTop: Spacing.sm }]}>
        <Boton titulo="Guardar" onPress={guardar} cargando={guardando} style={{ flex: 1 }} />
        <Boton titulo="Cancelar" tipo="secundario" onPress={onCancelar} style={{ flex: 1 }} />
      </View>
      <TouchableOpacity onPress={onBorrar} style={{ marginTop: Spacing.sm, alignSelf: 'center' }}>
        <Text style={[styles.historialMas, { color: '#ef4444' }]}>Borrar esta serie</Text>
      </TouchableOpacity>
    </View>
  );
}

// Cuenta regresiva del descanso entre series; vibra al terminar
function Descanso({ fin, onTerminar, onAjustar }: { fin: number; onTerminar: () => void; onAjustar: (seg: number) => void }) {
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
      <Text style={styles.descansoTexto}>{`Descanso ${textoTiempo(quedan)}`}</Text>
      <View style={styles.acciones}>
        <TouchableOpacity onPress={() => onAjustar(-15)} hitSlop={6} style={styles.botonChico} accessibilityLabel="15 segundos menos">
          <Text style={styles.botonChicoTexto}>−15</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => onAjustar(15)} hitSlop={6} style={styles.botonChico} accessibilityLabel="15 segundos más">
          <Text style={styles.botonChicoTexto}>+15</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onTerminar} hitSlop={6}>
          <Text style={styles.saltar}>Saltar</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  manija: { paddingRight: Spacing.xs, paddingVertical: Spacing.xs },
  opcionCorta: {
    flexDirection: 'row', gap: Spacing.sm, padding: Spacing.sm, marginBottom: Spacing.sm,
    borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border,
  },
  opcionCortaActiva: { borderColor: Colors.accent, backgroundColor: Colors.accentGlow },
  opcionCortaTitulo: { ...Typography.body, color: Colors.textPrimary, fontWeight: '600' },
  opcionCortaTexto: { ...Typography.caption, color: Colors.textSecondary, marginTop: 2 },
  pocoTiempo: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: Spacing.md,
    paddingVertical: 10, borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.accent,
  },
  pocoTiempoActivo: { backgroundColor: Colors.accent },
  pocoTiempoTexto: { ...Typography.body, color: Colors.accent, fontWeight: '600' },
  diaTitulo: { ...Typography.titleLg, color: Colors.textPrimary, marginTop: Spacing.sm },
  diaMeta: { ...Typography.caption, color: Colors.textSecondary, marginTop: 2 },
  filaHistorial: { flexDirection: 'row', gap: Spacing.sm, paddingVertical: 4 },
  fechaHistorial: { ...Typography.caption, color: Colors.textSecondary, width: 72 },
  textoHistorial: { ...Typography.body, color: Colors.textPrimary, flex: 1, minWidth: 0 },
  union: { ...Typography.caption, color: Colors.accent, fontWeight: '600', marginBottom: Spacing.xs },
  recuperacion: { ...Typography.caption, fontWeight: '600', marginBottom: Spacing.xs },
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
  fila: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'flex-end', marginTop: Spacing.md },
  columna: { flex: 1, minWidth: 0 },
  rotulo: { ...Typography.label, color: Colors.textSecondary, marginBottom: 4 },
  campo: { marginBottom: 0, textAlign: 'center', fontWeight: '700' },
  por: { ...Typography.titleMd, color: Colors.textMuted, paddingBottom: 12 },
  serie: { ...Typography.body, color: Colors.success },
  serieSaltada: { ...Typography.body, color: Colors.textMuted, textDecorationLine: 'line-through' },
  acciones: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: Spacing.sm, marginTop: Spacing.sm },
  agregar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: Spacing.md,
    paddingVertical: 12, borderRadius: Radius.lg, borderWidth: 1, borderStyle: 'dashed', borderColor: Colors.accent,
  },
  agregarTexto: { ...Typography.body, color: Colors.accent, fontWeight: '600' },
  filaSerie: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6 },
  ayuda: { ...Typography.caption, color: Colors.textMuted, marginTop: 2 },
  editar: { marginTop: Spacing.xs, padding: Spacing.sm, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.accent },
  historial: { marginTop: Spacing.sm, padding: Spacing.sm, borderRadius: Radius.md, backgroundColor: Colors.bgMuted, gap: 2 },
  historialTexto: { ...Typography.caption, color: Colors.textPrimary },
  historialFecha: { ...Typography.caption, color: Colors.textSecondary, fontWeight: '600' },
  historialMas: { ...Typography.caption, color: Colors.accent, fontWeight: '600' },
  botonChico: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: Radius.full, backgroundColor: Colors.bgMuted },
  botonChicoTexto: { ...Typography.label, color: Colors.textSecondary, fontWeight: '600' },
  saltado: { opacity: 0.6, paddingVertical: Spacing.sm },
  saltadoNombre: { ...Typography.body, color: Colors.textSecondary, textDecorationLine: 'line-through' },
  saltadoTexto: { ...Typography.caption, color: Colors.textMuted },
});
