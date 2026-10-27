/**
 * Pantalla ADMINISTRAR (solo superadmin)
 * - Todos los usuarios, con sus grupos y la última vez que entraron
 * - Todos los grupos, con coaches, miembros y plan activo
 * - Ver el plan de cualquier grupo
 * - Blanquear la contraseña de un usuario
 */
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Boton, Campo, Card, Insignia, pantalla, Texto, Titulo } from '../components/ui';
import { Colors, Radius, Spacing, Typography } from '../constants/theme';
import { useSesion } from '../hooks/useSesion';
import { api, Plan, resumenEjercicio, textoVence } from '../lib/api';

interface UsuarioAdmin {
  id: number;
  nombre: string;
  email: string;
  superadmin: number;
  creado: string;
  ultima_entrada: string | null;
  grupos: string | null;
}
interface GrupoAdmin {
  id: number;
  nombre: string;
  gym: string;
  creado: string;
  miembros: number;
  coaches: string | null;
  plan: string | null;
  vence: string | null;
}

// "2026-10-27" → "27/10/2026"
const fecha = (f: string | null) => (f ? f.split('-').reverse().join('/') : 'nunca');

async function confirmar(titulo: string, texto: string) {
  if (Platform.OS === 'web') return window.confirm(`${titulo}\n\n${texto}`);
  return new Promise<boolean>(ok => Alert.alert(titulo, texto, [
    { text: 'Cancelar', style: 'cancel', onPress: () => ok(false) },
    { text: 'Blanquear', style: 'destructive', onPress: () => ok(true) },
  ]));
}

export default function AdminScreen() {
  const { token, usuario } = useSesion();
  const [vista, setVista] = useState<'usuarios' | 'grupos'>('usuarios');
  const [buscar, setBuscar] = useState('');
  const [usuarios, setUsuarios] = useState<UsuarioAdmin[]>([]);
  const [grupos, setGrupos] = useState<GrupoAdmin[]>([]);
  const [error, setError] = useState('');
  // Plan abierto de un grupo: undefined = cargando, null = no tiene
  const [planAbierto, setPlanAbierto] = useState<{ grupoId: number; plan?: Plan | null } | null>(null);
  // Última contraseña temporal, para que quede a la vista y se pueda pasar
  const [temporal, setTemporal] = useState<{ nombre: string; email: string; password: string } | null>(null);

  const cargar = useCallback(async () => {
    try {
      const data = await api<{ usuarios: UsuarioAdmin[]; grupos: GrupoAdmin[] }>('admin_resumen', {}, token);
      setUsuarios(data.usuarios);
      setGrupos(data.grupos);
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

  const verPlan = async (grupoId: number) => {
    if (planAbierto?.grupoId === grupoId) return setPlanAbierto(null);
    setPlanAbierto({ grupoId });
    try {
      const data = await api<{ plan: Plan | null }>('admin_plan', { grupo_id: grupoId }, token);
      setPlanAbierto({ grupoId, plan: data.plan });
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
                  <Text style={styles.detalle}>{`Grupos: ${u.grupos || 'ninguno (entrena solo)'}`}</Text>
                  <Text style={styles.detalle}>{`Alta ${fecha(u.creado)} · última entrada ${fecha(u.ultima_entrada)}`}</Text>
                  <Boton titulo="Blanquear contraseña" tipo="secundario" onPress={() => blanquear(u)} style={{ marginTop: Spacing.sm }} />
                </Card>
              ))
              : gruposVistos.map(g => (
                <Card key={g.id}>
                  <Text style={styles.nombre}>{g.nombre}</Text>
                  {!!g.gym && <Text style={styles.detalle}>{g.gym}</Text>}
                  <Text style={styles.detalle}>{`${g.miembros} ${g.miembros === 1 ? 'miembro' : 'miembros'} · coach: ${g.coaches || 'nadie'}`}</Text>
                  <Text style={styles.detalle}>
                    {g.plan ? `Plan: ${g.plan}${g.vence ? ` · ${textoVence(g.vence)}` : ''}` : 'Sin plan activo'}
                  </Text>
                  <Text style={styles.detalle}>{`Creado ${fecha(g.creado)}`}</Text>
                  {!!g.plan && (
                    <Boton
                      titulo={planAbierto?.grupoId === g.id ? 'Ocultar plan' : 'Ver plan'}
                      tipo="secundario"
                      onPress={() => verPlan(g.id)}
                      style={{ marginTop: Spacing.sm }}
                    />
                  )}
                  {planAbierto?.grupoId === g.id && (
                    planAbierto.plan === undefined ? (
                      <Text style={styles.detalle}>Cargando…</Text>
                    ) : !planAbierto.plan ? (
                      <Text style={styles.detalle}>No tiene plan activo.</Text>
                    ) : (
                      <View style={{ marginTop: Spacing.sm }}>
                        {planAbierto.plan.dias.map(d => (
                          <View key={d.id} style={styles.dia}>
                            <Text style={styles.diaNombre}>{d.nombre}</Text>
                            {d.ejercicios.map(e => (
                              <View key={e.plan_ejercicio_id} style={styles.ejercicio}>
                                <Text style={styles.ejNombre}>{e.nombre}</Text>
                                <Text style={styles.detalle}>{resumenEjercicio(e)}</Text>
                                {!!e.nota && <Text style={styles.nota}>{e.nota}</Text>}
                              </View>
                            ))}
                          </View>
                        ))}
                      </View>
                    )
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

const styles = StyleSheet.create({
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
  nombre: { ...Typography.titleMd, color: Colors.textPrimary },
  detalle: { ...Typography.caption, color: Colors.textSecondary, marginTop: 2 },
  dia: { marginTop: Spacing.sm, paddingTop: Spacing.sm, borderTopWidth: 1, borderTopColor: Colors.border },
  diaNombre: { ...Typography.titleMd, color: Colors.accent, marginBottom: 4 },
  ejercicio: { paddingVertical: 6 },
  ejNombre: { ...Typography.body, color: Colors.textPrimary },
  nota: { ...Typography.caption, color: Colors.accent, fontStyle: 'italic', marginTop: 2 },
  clave: { fontSize: 28, fontWeight: '700', letterSpacing: 3, color: Colors.accent, marginVertical: Spacing.sm, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
});
