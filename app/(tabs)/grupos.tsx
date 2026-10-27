/**
 * Pantalla GRUPOS
 * - Mis grupos y cuál está elegido
 * - Crear grupo o unirse con código de invitación
 * - El coach carga los horarios fijos del grupo
 * - Mi cuenta: cambiar la contraseña y, si sos superadmin, administrar
 */
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Linking, Platform, ScrollView, Share, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { Boton, Campo, Card, Etiqueta, pantalla, Texto, Titulo } from '../../components/ui';
import { APP_VERSION, DESARROLLADOR, URL_DESCARGA } from '../../constants/app';
import { Colors, Radius, Spacing, Typography } from '../../constants/theme';
import { useSesion } from '../../hooks/useSesion';
import { api } from '../../lib/api';

const ZONAS: Record<string, string> = {
  piernas: 'Piernas', espalda: 'Espalda', pecho: 'Pecho', hombros: 'Hombros', brazos: 'Brazos', abdominales: 'Abdominales',
};
const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

interface Detalle {
  grupo: { quien_edita: 'todos' | 'algunos'; dias_por_zona: Record<string, number> };
  miembros: { id: number; nombre: string; rol: string }[];
  horarios: { id: number; dia_semana: number; hora: string }[];
}

export default function GruposScreen() {
  const { token, usuario, grupos, grupo, elegirGrupo, recargar, salir } = useSesion();
  const [codigo, setCodigo] = useState('');
  const [nombreNuevo, setNombreNuevo] = useState('');
  const [detalle, setDetalle] = useState<Detalle | null>(null);
  // Día de la semana → hora de ese día (cada día puede tener la suya)
  const [horas, setHoras] = useState<Record<number, string>>({});
  const [editandoNombre, setEditandoNombre] = useState(false);
  const [nombreGrupo, setNombreGrupo] = useState('');
  const [gymGrupo, setGymGrupo] = useState('');
  const [cambiandoClave, setCambiandoClave] = useState(false);
  const [claveActual, setClaveActual] = useState('');
  const [claveNueva, setClaveNueva] = useState('');

  const cargarDetalle = useCallback(async () => {
    if (!token || !grupo) return setDetalle(null);
    try {
      const data = await api<Detalle>('grupo_detalle', { grupo_id: grupo.id }, token);
      setDetalle(data);
      setHoras(Object.fromEntries(data.horarios.map(h => [h.dia_semana, String(h.hora).slice(0, 5)])));
    } catch {}
  }, [token, grupo]);

  useFocusEffect(useCallback(() => { cargarDetalle(); }, [cargarDetalle]));

  const cambiarClave = async () => {
    try {
      await api('cambiar_password', { actual: claveActual, nueva: claveNueva }, token);
      setCambiandoClave(false);
      setClaveActual('');
      setClaveNueva('');
      Alert.alert('Listo', 'Tu contraseña cambió.');
    } catch (e: any) {
      Alert.alert('No se pudo', e.message);
    }
  };

  const unirse = async () => {
    try {
      const data = await api<{ grupo: { id: number; nombre: string } }>('grupo_unirse', { codigo }, token);
      setCodigo('');
      await recargar();
      await elegirGrupo(data.grupo.id);
      Alert.alert('Listo', `Ya sos parte de ${data.grupo.nombre}.`);
    } catch (e: any) {
      Alert.alert('No se pudo', e.message);
    }
  };

  const crear = async () => {
    if (!nombreNuevo.trim()) return;
    try {
      const data = await api<{ grupo: { id: number; codigo_invitacion: string } }>(
        'grupo_crear',
        { nombre: nombreNuevo.trim() },
        token,
      );
      setNombreNuevo('');
      await recargar();
      await elegirGrupo(data.grupo.id);
      Alert.alert('Grupo creado', `Pasales este código a tus amigos: ${data.grupo.codigo_invitacion}`);
    } catch (e: any) {
      Alert.alert('No se pudo', e.message);
    }
  };

  const textoInvitacion = () =>
    `¡Sumate a mi grupo "${grupo?.nombre}" en CuerPro! 💪\n\n` +
    `1. Bajá la app: ${URL_DESCARGA}\n` +
    `2. Creá tu cuenta.\n` +
    `3. En Grupos, poné el código: *${grupo?.codigo_invitacion}*`;

  const invitarPorWhatsApp = () =>
    Linking.openURL(`https://wa.me/?text=${encodeURIComponent(textoInvitacion())}`).catch(() =>
      Alert.alert('No se pudo abrir WhatsApp', textoInvitacion()),
    );

  // Ajustes del grupo que cambia el coach: quién es coach y el aviso de músculos
  const todosCoach = detalle?.grupo.quien_edita === 'todos';
  const cambiarGrupo = async (accion: string, datos: object) => {
    if (!grupo) return;
    try {
      await api(accion, { grupo_id: grupo.id, ...datos }, token);
      await Promise.all([cargarDetalle(), recargar()]);
    } catch (e: any) {
      Alert.alert('No se pudo', e.message);
    }
  };

  const guardarHorarios = async () => {
    if (!grupo) return;
    const lista = Object.entries(horas).map(([d, hora]) => ({ dia_semana: Number(d), hora: hora.trim() }));
    const mala = lista.find(h => !/^\d{1,2}:\d{2}$/.test(h.hora));
    if (mala) return Alert.alert('Hora inválida', `Revisá la hora del ${DIAS[mala.dia_semana]}. Usá el formato 19:00`);
    try {
      await api('horarios_guardar', {
        grupo_id: grupo.id,
        horarios: lista.sort((a, b) => a.dia_semana - b.dia_semana),
      }, token);
      Alert.alert('Horarios guardados');
      cargarDetalle();
    } catch (e: any) {
      Alert.alert('No se pudo', e.message);
    }
  };

  return (
    <ScrollView style={pantalla.scroll} contentContainerStyle={pantalla.contenido} keyboardShouldPersistTaps="handled">
      <Etiqueta>{`Hola, ${usuario?.nombre ?? ''}`}</Etiqueta>

      {grupos.length > 0 && (
        <Card>
          <Titulo>Mis grupos</Titulo>
          {grupos.map(g => (
            <TouchableOpacity key={g.id} style={styles.fila} onPress={() => elegirGrupo(g.id)}>
              <Text style={[styles.textoFila, g.id === grupo?.id && { color: Colors.accent }]}>{g.nombre}</Text>
              <Text style={styles.rol}>{g.rol}</Text>
            </TouchableOpacity>
          ))}
        </Card>
      )}

      {grupo && detalle && (
        <Card>
          {editandoNombre ? (
            <>
              <Campo placeholder="Nombre del grupo" value={nombreGrupo} onChangeText={setNombreGrupo} />
              <Campo placeholder="Gimnasio (opcional)" value={gymGrupo} onChangeText={setGymGrupo} />
              <View style={styles.compartir}>
                <Boton titulo="Cancelar" tipo="secundario" onPress={() => setEditandoNombre(false)} style={{ flex: 1 }} />
                <Boton
                  titulo="Guardar"
                  disabled={!nombreGrupo.trim()}
                  onPress={async () => {
                    await cambiarGrupo('grupo_config', { nombre: nombreGrupo, gym: gymGrupo });
                    setEditandoNombre(false);
                  }}
                  style={{ flex: 1 }}
                />
              </View>
            </>
          ) : (
            <View style={styles.contador}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Titulo>{grupo.nombre}</Titulo>
                {!!grupo.gym && <Texto muted>{grupo.gym}</Texto>}
              </View>
              {grupo.rol === 'coach' && (
                <TouchableOpacity
                  onPress={() => { setNombreGrupo(grupo.nombre); setGymGrupo(grupo.gym ?? ''); setEditandoNombre(true); }}
                  hitSlop={10}
                  accessibilityLabel="Cambiar el nombre del grupo"
                >
                  <Ionicons name="create-outline" size={22} color={Colors.accent} />
                </TouchableOpacity>
              )}
            </View>
          )}
          <Texto muted>{`Código de invitación: ${grupo.codigo_invitacion}`}</Texto>
          <View style={styles.compartir}>
            <Boton titulo="Invitar por WhatsApp" onPress={invitarPorWhatsApp} style={{ flex: 1 }} />
            {Platform.OS !== 'web' && (
              <Boton titulo="Compartir" tipo="secundario" onPress={() => Share.share({ message: textoInvitacion() })} style={{ flex: 1 }} />
            )}
          </View>
          <Etiqueta>{`Miembros (${detalle.miembros.length})`}</Etiqueta>
          {grupo.rol === 'coach' && (
            <View style={styles.fila}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.textoFila}>Todos son coach</Text>
                <Text style={styles.rol}>Todos pueden editar el plan, los horarios y marcar asistencia</Text>
              </View>
              <Switch
                value={todosCoach}
                onValueChange={v => cambiarGrupo('grupo_config', { quien_edita: v ? 'todos' : 'algunos' })}
                trackColor={{ true: Colors.accent, false: Colors.border }}
                thumbColor="#fff"
              />
            </View>
          )}
          {detalle.miembros.map(m => {
            const esCoach = todosCoach || m.rol === 'coach';
            const puedeCambiar = grupo.rol === 'coach' && !todosCoach && m.id !== usuario?.id;
            return (
              <View key={m.id} style={styles.fila}>
                <Text style={styles.textoFila}>{m.nombre}</Text>
                {puedeCambiar ? (
                  <TouchableOpacity onPress={() => cambiarGrupo('miembro_rol', { usuario_id: m.id, rol: esCoach ? 'miembro' : 'coach' })}>
                    <Text style={[styles.rol, { color: Colors.accent }]}>{esCoach ? 'coach · quitar' : 'hacer coach'}</Text>
                  </TouchableOpacity>
                ) : (
                  <Text style={styles.rol}>{esCoach ? 'coach' : 'miembro'}</Text>
                )}
              </View>
            );
          })}

          <View style={{ marginTop: Spacing.md }}>
            <Etiqueta>Aviso de músculo sin entrenar</Etiqueta>
            <Texto muted>
              {grupo.rol === 'coach'
                ? 'Cuántos días sin trabajar cada zona antes de avisar:'
                : 'Te avisa cuando llevás estos días sin trabajar una zona:'}
            </Texto>
            {Object.entries(ZONAS).map(([zona, nombre]) => {
              const dias = detalle.grupo.dias_por_zona[zona];
              const cambiar = (delta: number) =>
                cambiarGrupo('grupo_config', { dias_por_zona: { ...detalle.grupo.dias_por_zona, [zona]: dias + delta } });
              return (
                <View key={zona} style={styles.fila}>
                  <Text style={styles.textoFila}>{nombre}</Text>
                  {grupo.rol === 'coach' ? (
                    <View style={styles.contador}>
                      <TouchableOpacity onPress={() => cambiar(-1)} disabled={dias <= 2} accessibilityLabel={`Menos días para ${nombre}`}>
                        <Ionicons name="remove-circle-outline" size={26} color={dias <= 2 ? Colors.border : Colors.accent} />
                      </TouchableOpacity>
                      <Text style={styles.contadorTexto}>{`${dias} días`}</Text>
                      <TouchableOpacity onPress={() => cambiar(1)} disabled={dias >= 30} accessibilityLabel={`Más días para ${nombre}`}>
                        <Ionicons name="add-circle-outline" size={26} color={dias >= 30 ? Colors.border : Colors.accent} />
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <Text style={styles.rol}>{`${dias} días`}</Text>
                  )}
                </View>
              );
            })}
          </View>

          <View style={{ marginTop: Spacing.md }}>
            <Etiqueta>Horarios</Etiqueta>
            {grupo.rol === 'coach' ? (
              <>
                <View style={styles.dias}>
                  {DIAS.map((d, i) => {
                    const activo = i in horas;
                    const alternar = () => {
                      const { [i]: _, ...resto } = horas;
                      // Un día nuevo arranca con la hora del último día cargado
                      setHoras(activo ? resto : { ...horas, [i]: Object.values(horas).pop() ?? '19:00' });
                    };
                    return (
                      <TouchableOpacity key={d} style={[styles.dia, activo && styles.diaActivo]} onPress={alternar}>
                        <Text style={[styles.diaTexto, activo && { color: Colors.textInverse }]}>{d}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                {Object.keys(horas).map(Number).sort((a, b) => a - b).map(d => (
                  <View key={d} style={styles.horaDia}>
                    <Text style={[styles.textoFila, { width: 48 }]}>{DIAS[d]}</Text>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Campo
                        value={horas[d]}
                        onChangeText={hora => setHoras({ ...horas, [d]: hora })}
                        placeholder="19:00"
                        keyboardType="numbers-and-punctuation"
                      />
                    </View>
                  </View>
                ))}
                <Boton titulo="Guardar horarios" tipo="secundario" onPress={guardarHorarios} />
              </>
            ) : (
              <Texto>
                {detalle.horarios.length
                  ? detalle.horarios.map(h => `${DIAS[h.dia_semana]} ${String(h.hora).slice(0, 5)}`).join(' · ')
                  : 'Sin horarios todavía'}
              </Texto>
            )}
          </View>
        </Card>
      )}

      <Card>
        <Titulo>Unirme a un grupo</Titulo>
        <Campo placeholder="Código de invitación" value={codigo} onChangeText={setCodigo} autoCapitalize="characters" />
        <Boton titulo="Unirme" onPress={unirse} disabled={!codigo.trim()} />
      </Card>

      <Card>
        <Titulo>Crear un grupo</Titulo>
        <Campo placeholder="Nombre del grupo" value={nombreNuevo} onChangeText={setNombreNuevo} />
        <Boton titulo="Crear" tipo="secundario" onPress={crear} disabled={!nombreNuevo.trim()} />
      </Card>

      <Card>
        <Titulo>Mi cuenta</Titulo>
        <Texto muted>{`${usuario?.nombre ?? ''} · ${usuario?.email ?? ''}`}</Texto>
        {cambiandoClave ? (
          <View style={{ marginTop: Spacing.sm }}>
            <Campo placeholder="Contraseña actual" value={claveActual} onChangeText={setClaveActual} secureTextEntry />
            <Campo placeholder="Contraseña nueva (mínimo 6)" value={claveNueva} onChangeText={setClaveNueva} secureTextEntry />
            <View style={styles.compartir}>
              <Boton titulo="Cancelar" tipo="secundario" onPress={() => setCambiandoClave(false)} style={{ flex: 1 }} />
              <Boton titulo="Guardar" onPress={cambiarClave} disabled={!claveActual || claveNueva.length < 6} style={{ flex: 1 }} />
            </View>
          </View>
        ) : (
          <Boton titulo="Cambiar contraseña" tipo="secundario" onPress={() => setCambiandoClave(true)} style={{ marginTop: Spacing.sm }} />
        )}
        {usuario?.superadmin && (
          <Boton titulo="Administrar usuarios y grupos" onPress={() => router.push('/admin')} style={{ marginTop: Spacing.sm }} />
        )}
      </Card>

      <Boton titulo="Cerrar sesión" tipo="peligro" onPress={salir} />

      <TouchableOpacity onPress={() => router.push('/acerca')} hitSlop={8}>
        <Text style={styles.creditos}>{`CuerPro v${APP_VERSION}\nDesarrollado por ${DESARROLLADOR}`}</Text>
        <Text style={styles.acerca}>Sobre CuerPro</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  contador: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  contadorTexto: { ...Typography.body, color: Colors.textPrimary, fontWeight: '600', minWidth: 64, textAlign: 'center' },
  fila: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  textoFila: { ...Typography.body, color: Colors.textPrimary },
  rol: { ...Typography.caption, color: Colors.textSecondary },
  dias: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs, marginBottom: Spacing.sm },
  dia: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: Radius.full,
    backgroundColor: Colors.bgMuted,
  },
  diaActivo: { backgroundColor: Colors.accent },
  compartir: { flexDirection: 'row', gap: Spacing.sm, marginVertical: Spacing.sm },
  horaDia: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  diaTexto: { ...Typography.label, color: Colors.textPrimary },
  creditos: { ...Typography.caption, color: Colors.textMuted, textAlign: 'center', marginTop: Spacing.lg, lineHeight: 18 },
  acerca: { ...Typography.caption, color: Colors.accent, textAlign: 'center', marginTop: 4 },
});
