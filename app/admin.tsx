/**
 * Pantalla ADMINISTRAR (solo superadmin)
 * - Todos los usuarios, con sus grupos y la última vez que entraron
 * - Todos los grupos, con coaches, miembros y plan activo
 * - Ver los planes de cualquier grupo o Individual (también los que no están activos)
 *   y los ejercicios que creó ese grupo
 * - Blanquear la contraseña de un usuario
 * - Sumar a un usuario a un grupo o sacarlo
 */
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Platform, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from '../components/Letra';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Boton, Campo, Card, Insignia, pantalla, Texto, Titulo } from '../components/ui';
import { Colors, Radius, Spacing, Typography } from '../constants/theme';
import { useSesion } from '../hooks/useSesion';
import { api, Ejercicio, Plan, PlanResumen, resumenEjercicio, textoVence } from '../lib/api';

// Lo que el admin ve de un grupo: el plan abierto, la lista de planes y sus ejercicios propios
interface PlanesAdmin { plan: Plan | null; planes: PlanResumen[]; ejercicios: Ejercicio[] }

interface UsuarioAdmin {
  id: number;
  nombre: string;
  email: string;
  superadmin: number;
  creado: string;
  ultima_entrada: string | null;
  grupos: string | null;
  individual_id: number | null;
}
interface GrupoAdmin {
  id: number;
  nombre: string;
  gym: string;
  individual: number;
  creado: string;
  miembros: number;
  coaches: string | null;
  plan: string | null;
  vence: string | null;
  planes: number;
  ejercicios: number;
}

interface Membresia { usuario_id: number; grupo_id: number; rol: 'coach' | 'miembro' }

// "2026-10-27" → "27/10/2026"
const fecha = (f: string | null) => (f ? f.split('-').reverse().join('/') : 'nunca');

async function confirmar(titulo: string, texto: string, boton = 'Blanquear') {
  if (Platform.OS === 'web') return window.confirm(`${titulo}\n\n${texto}`);
  return new Promise<boolean>(ok => Alert.alert(titulo, texto, [
    { text: 'Cancelar', style: 'cancel', onPress: () => ok(false) },
    { text: boton, style: 'destructive', onPress: () => ok(true) },
  ]));
}

function aviso(titulo: string, texto: string) {
  if (Platform.OS === 'web') window.alert(`${titulo}\n\n${texto}`);
  else Alert.alert(titulo, texto);
}

export default function AdminScreen() {
  const { token, usuario } = useSesion();
  const [vista, setVista] = useState<'usuarios' | 'grupos'>('usuarios');
  const [buscar, setBuscar] = useState('');
  const [usuarios, setUsuarios] = useState<UsuarioAdmin[]>([]);
  const [grupos, setGrupos] = useState<GrupoAdmin[]>([]);
  const [membresias, setMembresias] = useState<Membresia[]>([]);
  // Usuario al que se le está eligiendo un grupo para sumarlo
  const [sumando, setSumando] = useState<number | null>(null);
  const [error, setError] = useState('');
  // Planes abiertos de un grupo: datos undefined = cargando
  const [planAbierto, setPlanAbierto] = useState<{ grupoId: number; datos?: PlanesAdmin } | null>(null);
  // Última contraseña temporal, para que quede a la vista y se pueda pasar
  const [temporal, setTemporal] = useState<{ nombre: string; email: string; password: string } | null>(null);

  const cargar = useCallback(async () => {
    try {
      const data = await api<{ usuarios: UsuarioAdmin[]; grupos: GrupoAdmin[]; membresias: Membresia[] }>('admin_resumen', {}, token);
      setUsuarios(data.usuarios);
      setGrupos(data.grupos);
      setMembresias(data.membresias ?? []);
      setError('');
    } catch (e: any) {
      setError(e.message);
    }
  }, [token]);

  useEffect(() => { cargar(); }, [cargar]);

  const blanquear = async (u: UsuarioAdmin) => {
    const si = await confirmar('Blanquear contraseña', `${u.nombre} va a tener que entrar con una contraseña temporal. Se le cierra la sesión en todos los teléfonos.`);
    if (!si) return;
    try {
      const data = await api<{ password: string }>('admin_blanquear', { usuario_id: u.id }, token);
      setTemporal({ nombre: u.nombre, email: u.email, password: data.password });
    } catch (e: any) {
      Alert.alert('No se pudo', e.message);
    }
  };

  const sumarAGrupo = async (u: UsuarioAdmin, g: GrupoAdmin, rol: 'miembro' | 'coach') => {
    const si = await confirmar('Sumar a un grupo', `¿Sumás a ${u.nombre} a ${g.nombre} como ${rol}? Le llega un aviso.`, 'Sumar');
    if (!si) return;
    try {
      await api('admin_miembro_agregar', { usuario_id: u.id, grupo_id: g.id, rol }, token);
      setSumando(null);
      cargar();
    } catch (e: any) {
      aviso('No se pudo', e.message);
    }
  };

  const quitarDeGrupo = async (u: UsuarioAdmin, g: GrupoAdmin) => {
    const si = await confirmar('Sacar del grupo', `¿Sacás a ${u.nombre} de ${g.nombre}? Sus series y puntos quedan guardados.`, 'Sacar');
    if (!si) return;
    try {
      await api('admin_miembro_quitar', { usuario_id: u.id, grupo_id: g.id }, token);
      cargar();
    } catch (e: any) {
      aviso('No se pudo', e.message);
    }
  };

  const verPlan = async (grupoId: number, planId?: number) => {
    if (planAbierto?.grupoId === grupoId && !planId) return setPlanAbierto(null);
    if (!planId) setPlanAbierto({ grupoId });
    try {
      const data = await api<PlanesAdmin>('admin_plan', { grupo_id: grupoId, ...(planId && { plan_id: planId }) }, token);
      setPlanAbierto({ grupoId, datos: data });
    } catch (e: any) {
      setPlanAbierto(null);
      Alert.alert('No se pudo', e.message);
    }
  };

  const q = buscar.trim().toLowerCase();
  const usuariosVistos = usuarios.filter(u => !q || `${u.nombre} ${u.email} ${u.grupos ?? ''}`.toLowerCase().includes(q));
  const gruposVistos = grupos.filter(g => !q || `${g.nombre} ${g.gym} ${g.coaches ?? ''}`.toLowerCase().includes(q));

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.bg }}>
      <View style={styles.encabezado}>
        <TouchableOpacity onPress={() => (router.canGoBack() ? router.back() : router.replace('/grupos'))} hitSlop={12}>
          <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.titulo}>Administrar</Text>
      </View>

      <ScrollView style={pantalla.scroll} contentContainerStyle={pantalla.contenido} keyboardShouldPersistTaps="handled">
        {!usuario?.superadmin || error ? (
          <Card><Texto muted>{error || 'Solo el administrador puede ver esta pantalla.'}</Texto></Card>
        ) : (
          <>
            {temporal && (
              <Card style={{ borderColor: Colors.accent }}>
                <Titulo>Contraseña temporal</Titulo>
                <Texto>{`${temporal.nombre} (${temporal.email}) entra con:`}</Texto>
                <Text selectable style={styles.clave}>{temporal.password}</Text>
                <Texto muted>Pasásela y decile que la cambie en Grupos → Mi cuenta. No se vuelve a mostrar.</Texto>
                <Boton titulo="Listo" tipo="secundario" onPress={() => setTemporal(null)} style={{ marginTop: Spacing.sm }} />
              </Card>
            )}

            <View style={styles.pestanas}>
              {(['usuarios', 'grupos'] as const).map(v => (
                <TouchableOpacity key={v} style={[styles.pestana, vista === v && styles.pestanaActiva]} onPress={() => setVista(v)}>
                  <Text style={[styles.pestanaTexto, vista === v && { color: Colors.textInverse }]}>
                    {v === 'usuarios' ? `Usuarios (${usuarios.length})` : `Grupos (${grupos.length})`}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <Campo placeholder="Buscar por nombre, email o grupo" value={buscar} onChangeText={setBuscar} autoCapitalize="none" />

            {vista === 'usuarios'
              ? usuariosVistos.map(u => (
                <Card key={u.id}>
                  <View style={styles.fila}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.nombre}>{u.nombre}</Text>
                      <Text style={styles.detalle} selectable>{u.email}</Text>
                    </View>
                    {!!u.superadmin && <Insignia texto="ADMIN" />}
                  </View>
                  <Text style={styles.detalle}>{`Alta ${fecha(u.creado)} · última entrada ${fecha(u.ultima_entrada)}`}</Text>
                  <Text style={[styles.detalle, { marginTop: Spacing.sm }]}>Grupos (tocá × para sacarlo)</Text>
                  <View style={styles.chips}>
                    {membresias.filter(m => m.usuario_id === u.id).map(m => {
                      const g = grupos.find(x => x.id === m.grupo_id);
                      if (!g) return null;
                      return (
                        <TouchableOpacity key={g.id} style={styles.chip} onPress={() => quitarDeGrupo(u, g)} accessibilityLabel={`Sacar de ${g.nombre}`}>
                          <Text style={styles.chipTexto}>{`${g.nombre}${m.rol === 'coach' ? ' · coach' : ''}`}</Text>
                          <Ionicons name="close" size={14} color={Colors.textSecondary} />
                        </TouchableOpacity>
                      );
                    })}
                    <TouchableOpacity style={[styles.chip, styles.chipSumar]} onPress={() => setSumando(sumando === u.id ? null : u.id)}>
                      <Ionicons name={sumando === u.id ? 'chevron-up' : 'add'} size={14} color={Colors.accent} />
                      <Text style={[styles.chipTexto, { color: Colors.accent }]}>Sumar a un grupo</Text>
                    </TouchableOpacity>
                  </View>
                  {sumando === u.id && (
                    <View style={styles.sumar}>
                      {grupos.filter(g => !g.individual && !membresias.some(m => m.usuario_id === u.id && m.grupo_id === g.id)).map(g => (
                        <View key={g.id} style={styles.sumarFila}>
                          <Text style={[styles.chipTexto, { flex: 1 }]}>{g.nombre}</Text>
                          <TouchableOpacity style={styles.chip} onPress={() => sumarAGrupo(u, g, 'miembro')}>
                            <Text style={styles.chipTexto}>Miembro</Text>
                          </TouchableOpacity>
                          <TouchableOpacity style={styles.chip} onPress={() => sumarAGrupo(u, g, 'coach')}>
                            <Text style={styles.chipTexto}>Coach</Text>
                          </TouchableOpacity>
                        </View>
                      ))}
                      {!grupos.some(g => !g.individual && !membresias.some(m => m.usuario_id === u.id && m.grupo_id === g.id)) && (
                        <Text style={styles.detalle}>Ya está en todos los grupos.</Text>
                      )}
                    </View>
                  )}
                  {!!u.individual_id && (
                    <Boton
                      titulo={planAbierto?.grupoId === u.individual_id ? 'Ocultar su plan personal' : 'Ver su plan personal y ejercicios'}
                      tipo="secundario"
                      onPress={() => verPlan(u.individual_id!)}
                      style={{ marginTop: Spacing.sm }}
                    />
                  )}
                  {planAbierto && planAbierto.grupoId === u.individual_id && (
                    <VistaPlanes datos={planAbierto.datos} onElegir={id => verPlan(u.individual_id!, id)} />
                  )}
                  <Boton titulo="Blanquear contraseña" tipo="secundario" onPress={() => blanquear(u)} style={{ marginTop: Spacing.sm }} />
                </Card>
              ))
              : gruposVistos.map(g => (
                <Card key={g.id}>
                  <View style={styles.fila}>
                    <Text style={[styles.nombre, { flex: 1 }]}>{g.individual ? `Individual de ${g.coaches ?? 'alguien'}` : g.nombre}</Text>
                    {!!g.individual && <Insignia texto="Solo" />}
                  </View>
                  {!!g.gym && <Text style={styles.detalle}>{g.gym}</Text>}
                  <Text style={styles.detalle}>{`${g.miembros} ${g.miembros === 1 ? 'miembro' : 'miembros'} · coach: ${g.coaches || 'nadie'}`}</Text>
                  <Text style={styles.detalle}>
                    {g.plan ? `Plan: ${g.plan}${g.vence ? ` · ${textoVence(g.vence)}` : ''}` : 'Sin plan activo'}
                  </Text>
                  <Text style={styles.detalle}>
                    {`${g.planes} ${g.planes === 1 ? 'plan armado' : 'planes armados'} · ${g.ejercicios} ${g.ejercicios === 1 ? 'ejercicio propio' : 'ejercicios propios'}`}
                  </Text>
                  <Text style={styles.detalle}>{`Creado ${fecha(g.creado)}`}</Text>
                  {(g.planes > 0 || g.ejercicios > 0) && (
                    <Boton
                      titulo={planAbierto?.grupoId === g.id ? 'Ocultar' : 'Ver planes y ejercicios'}
                      tipo="secundario"
                      onPress={() => verPlan(g.id)}
                      style={{ marginTop: Spacing.sm }}
                    />
                  )}
                  {planAbierto?.grupoId === g.id && (
                    <VistaPlanes datos={planAbierto.datos} onElegir={id => verPlan(g.id, id)} />
                  )}
                </Card>
              ))}
            {(vista === 'usuarios' ? usuariosVistos : gruposVistos).length === 0 && <Texto muted>No hay resultados.</Texto>}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// Los planes de un grupo (solo lectura): se elige cuál ver, y abajo los ejercicios que creó
function VistaPlanes({ datos, onElegir }: { datos?: PlanesAdmin; onElegir: (planId: number) => void }) {
  if (!datos) return <Text style={styles.detalle}>Cargando…</Text>;
  return (
    <View style={{ marginTop: Spacing.sm }}>
      {datos.planes.length === 0 ? (
        <Text style={styles.detalle}>Todavía no armó ningún plan.</Text>
      ) : (
        <View style={styles.chips}>
          {datos.planes.map(p => {
            const abierto = datos.plan?.id === p.id;
            return (
              <TouchableOpacity key={p.id} style={[styles.chip, abierto && styles.chipActivo]} onPress={() => onElegir(p.id)}>
                <Text style={[styles.chipTexto, abierto && { color: Colors.textInverse }]}>{`${p.nombre}${p.activo ? ' · en uso' : ''}`}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}
      {datos.plan?.dias.map(d => (
        <View key={d.id} style={styles.dia}>
          <Text style={styles.diaNombre}>{d.nombre}</Text>
          {d.ejercicios.map(e => (
            <View key={e.plan_ejercicio_id} style={styles.ejercicio}>
              <Text style={styles.ejNombre}>{e.nombre}</Text>
              <Text style={styles.detalle}>{`${resumenEjercicio(e)} · ${e.musculo_principal}`}</Text>
              {!!e.nota && <Text style={styles.nota}>{e.nota}</Text>}
            </View>
          ))}
        </View>
      ))}
      <View style={styles.dia}>
        <Text style={styles.diaNombre}>{`Ejercicios que creó (${datos.ejercicios.length})`}</Text>
        {datos.ejercicios.length === 0 ? (
          <Text style={styles.detalle}>Usa solo los del catálogo de CuerPro.</Text>
        ) : datos.ejercicios.map(e => (
          <Text key={e.id} style={styles.detalle}>{`${e.nombre} · ${e.musculo_principal}`}</Text>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  chipActivo: { backgroundColor: Colors.accent },
  encabezado: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.md,
    backgroundColor: Colors.bgCard, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  titulo: { ...Typography.titleLg, color: Colors.textPrimary },
  pestanas: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.sm },
  pestana: { flex: 1, paddingVertical: 10, borderRadius: Radius.full, backgroundColor: Colors.bgMuted, alignItems: 'center' },
  pestanaActiva: { backgroundColor: Colors.accent },
  pestanaTexto: { ...Typography.label, color: Colors.textPrimary },
  fila: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs, marginTop: Spacing.xs },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 6, paddingHorizontal: 10,
    borderRadius: Radius.full, backgroundColor: Colors.bgMuted,
  },
  chipSumar: { borderWidth: 1, borderColor: Colors.accent, backgroundColor: 'transparent' },
  chipTexto: { ...Typography.label, color: Colors.textPrimary },
  sumar: { marginTop: Spacing.sm, gap: Spacing.xs },
  sumarFila: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  nombre: { ...Typography.titleMd, color: Colors.textPrimary },
  detalle: { ...Typography.caption, color: Colors.textSecondary, marginTop: 2 },
  dia: { marginTop: Spacing.sm, paddingTop: Spacing.sm, borderTopWidth: 1, borderTopColor: Colors.border },
  diaNombre: { ...Typography.titleMd, color: Colors.accent, marginBottom: 4 },
  ejercicio: { paddingVertical: 6 },
  ejNombre: { ...Typography.body, color: Colors.textPrimary },
  nota: { ...Typography.caption, color: Colors.accent, fontStyle: 'italic', marginTop: 2 },
  clave: { fontSize: 28, fontWeight: '700', letterSpacing: 3, color: Colors.accent, marginVertical: Spacing.sm, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
});
