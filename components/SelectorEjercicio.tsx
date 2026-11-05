import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import { FlatList, Modal, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from './Letra';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Radius, Spacing, Typography } from '../constants/theme';
import { Ejercicio, EQUIPO, ZONAS_MUSCULO, zonaDe } from '../lib/api';
import { Boton, Campo } from './ui';

export interface EjercicioNuevo { nombre: string; musculo_principal: string; equipo: string }

// Lista del catálogo con búsqueda y filtro por músculo.
// `sugerir`: si viene, primero muestra los del mismo músculo y movimiento (para elegir alternativas).
// `onCrear`: si viene, permite cargar un ejercicio que no está en el catálogo.
// `onEditar` + `puedeEditar`: el lápiz de cada ejercicio para cambiarle el nombre, el músculo o el equipo.
export function SelectorEjercicio({
  visible,
  titulo,
  ejercicios,
  excluir = [],
  sugerir,
  onElegir,
  onCerrar,
  onCrear,
  onEditar,
  puedeEditar,
}: {
  visible: boolean;
  titulo: string;
  ejercicios: Ejercicio[];
  excluir?: number[];
  sugerir?: Ejercicio | null;
  onElegir: (e: Ejercicio) => void;
  onCerrar: () => void;
  onCrear?: (datos: EjercicioNuevo) => Promise<Ejercicio>;
  onEditar?: (e: Ejercicio, datos: EjercicioNuevo) => Promise<Ejercicio>;
  puedeEditar?: (e: Ejercicio) => boolean;
}) {
  const [busqueda, setBusqueda] = useState('');
  const [zona, setZona] = useState<string | null>(null); // filtro: piernas, brazos… u 'otros'
  const [nuevo, setNuevo] = useState<EjercicioNuevo | null>(null);
  const [editando, setEditando] = useState<Ejercicio | null>(null);

  // Cada vez que se abre arranca limpio; para una alternativa, filtrado por el mismo músculo
  useEffect(() => {
    if (!visible) return;
    setBusqueda('');
    setZona(sugerir ? zonaDe(sugerir.musculo_principal)?.zona ?? 'otros' : null);
    setNuevo(null);
    setEditando(null);
  }, [visible, sugerir]);

  const musculos = useMemo(
    () => Array.from(new Set(ejercicios.map(e => e.musculo_principal))).sort(),
    [ejercicios],
  );

  const hayOtros = musculos.some(m => !zonaDe(m));

  const lista = useMemo(() => {
    const texto = busqueda.trim().toLowerCase();
    const filtrados = ejercicios.filter(e =>
      !excluir.includes(e.id) &&
      (!zona || (zonaDe(e.musculo_principal)?.zona ?? 'otros') === zona) &&
      (!texto || e.nombre.toLowerCase().includes(texto)),
    );
    if (!sugerir) return filtrados;
    const puntaje = (e: Ejercicio) =>
      (e.musculo_principal === sugerir.musculo_principal ? 2 : 0) + (e.movimiento && e.movimiento === sugerir.movimiento ? 1 : 0);
    return [...filtrados].sort((a, b) => puntaje(b) - puntaje(a));
  }, [ejercicios, excluir, zona, busqueda, sugerir]);

  const abrirNuevo = () =>
    setNuevo({ nombre: busqueda.trim(), musculo_principal: zona && zona !== 'otros' ? zona : '', equipo: 'maquina' });

  const crear = async (datos: EjercicioNuevo) => {
    if (!onCrear) return;
    onElegir(await onCrear(datos));
  };

  const guardarEdicion = async (datos: EjercicioNuevo) => {
    if (!onEditar || !editando) return;
    await onEditar(editando, datos);
    setEditando(null);
  };

  const formulario = nuevo && (
    <FormEjercicio titulo="Ejercicio nuevo" inicial={nuevo} musculos={musculos} boton="Crear y agregar" onGuardar={crear} onCancelar={() => setNuevo(null)} />
  );

  const pie = onCrear && (formulario || (
    <TouchableOpacity style={styles.crear} onPress={abrirNuevo}>
      <Ionicons name="add-circle-outline" size={20} color={Colors.accent} />
      <Text style={[styles.nombre, { color: Colors.accent }]}>
        {busqueda.trim() ? `Crear "${busqueda.trim()}"` : 'Crear un ejercicio nuevo'}
      </Text>
    </TouchableOpacity>
  ));

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onCerrar}>
      <SafeAreaView style={styles.fondo}>
        <View style={styles.cabecera}>
          <Text style={styles.titulo}>{titulo}</Text>
          <TouchableOpacity onPress={onCerrar} accessibilityLabel="Cerrar">
            <Ionicons name="close" size={28} color={Colors.textPrimary} />
          </TouchableOpacity>
        </View>
        {!editando && !formulario && (
        <View style={{ paddingHorizontal: Spacing.md }}>
          <Campo placeholder="Buscar ejercicio" value={busqueda} onChangeText={setBusqueda} />
          <View style={styles.chips}>
            <Chip texto="Todos" activo={!zona} onPress={() => setZona(null)} />
            {ZONAS_MUSCULO.map(z => (
              <Chip key={z.zona} texto={z.nombre} activo={zona === z.zona} onPress={() => setZona(z.zona)} />
            ))}
            {hayOtros && <Chip texto="Otros" activo={zona === 'otros'} onPress={() => setZona('otros')} />}
          </View>
        </View>
        )}
        {formulario && !editando ? (
          <ScrollView contentContainerStyle={{ padding: Spacing.md }} keyboardShouldPersistTaps="handled">
            {formulario}
          </ScrollView>
        ) : editando ? (
          <ScrollView contentContainerStyle={{ padding: Spacing.md }} keyboardShouldPersistTaps="handled">
            <FormEjercicio
              titulo="Editar ejercicio"
              inicial={{ nombre: editando.nombre, musculo_principal: editando.musculo_principal, equipo: editando.equipo }}
              musculos={musculos}
              boton="Guardar cambios"
              nota={editando.grupo_id ? 'El cambio vale en todos los planes del grupo.' : 'Es del catálogo de CuerPro: el cambio vale para todos los grupos.'}
              onGuardar={guardarEdicion}
              onCancelar={() => setEditando(null)}
            />
          </ScrollView>
        ) : (
        <FlatList
          data={lista}
          keyExtractor={e => String(e.id)}
          contentContainerStyle={{ padding: Spacing.md }}
          renderItem={({ item }) => (
            <View style={styles.item}>
              <TouchableOpacity style={{ flex: 1, minWidth: 0 }} onPress={() => onElegir(item)}>
                <Text style={styles.nombre}>{item.nombre}</Text>
                <Text style={styles.detalle}>{`${item.musculo_principal} · ${EQUIPO[item.equipo] ?? item.equipo}`}</Text>
              </TouchableOpacity>
              {!!onEditar && puedeEditar?.(item) && (
                <TouchableOpacity onPress={() => setEditando(item)} hitSlop={10} accessibilityLabel={`Editar ${item.nombre}`}>
                  <Ionicons name="create-outline" size={20} color={Colors.textSecondary} />
                </TouchableOpacity>
              )}
            </View>
          )}
          ListEmptyComponent={<Text style={styles.detalle}>No hay ejercicios con ese filtro.</Text>}
          ListHeaderComponent={pie || null}
          keyboardShouldPersistTaps="handled"
        />
        )}
      </SafeAreaView>
    </Modal>
  );
}

// Nombre, músculo y equipo: para crear un ejercicio o corregir uno (ej: lo cargaste en hombros y es de pecho)
export function FormEjercicio({
  titulo,
  inicial,
  musculos,
  boton,
  nota,
  onGuardar,
  onCancelar,
}: {
  titulo: string;
  inicial: EjercicioNuevo;
  musculos: string[];
  boton: string;
  nota?: string;
  onGuardar: (datos: EjercicioNuevo) => Promise<void>;
  onCancelar: () => void;
}) {
  const [datos, setDatos] = useState(inicial);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  // Primero la zona (Piernas, Brazos…) y después, si tiene varios, cuál músculo.
  // "Otro" deja escribir uno propio (ej: lumbares, cuello).
  const zonaInicial = inicial.musculo_principal ? zonaDe(inicial.musculo_principal)?.zona ?? 'otro' : null;
  const [zona, setZona] = useState<string | null>(zonaInicial);
  const zonaElegida = ZONAS_MUSCULO.find(z => z.zona === zona);
  // Músculos propios del grupo que no están en ninguna zona, para elegirlos rápido en "Otro"
  const propios = musculos.filter(m => !zonaDe(m));
  const setMusculo = (m: string) => setDatos({ ...datos, musculo_principal: m });

  const elegirZona = (z: string) => {
    setZona(z);
    const encontrada = ZONAS_MUSCULO.find(x => x.zona === z);
    // Zona de un solo músculo (pecho, hombros…): queda elegido; con varios, arranca en "en general"
    if (encontrada) setMusculo(encontrada.musculos.length === 1 ? encontrada.musculos[0] : encontrada.zona);
    else setMusculo(zonaDe(datos.musculo_principal) ? '' : datos.musculo_principal);
  };

  const guardar = async () => {
    if (!datos.nombre.trim() || !datos.musculo_principal.trim()) {
      setError('Poné el nombre y el músculo.');
      return;
    }
    setGuardando(true);
    setError('');
    try {
      await onGuardar({ ...datos, nombre: datos.nombre.trim(), musculo_principal: datos.musculo_principal.trim().toLowerCase() });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <View style={styles.nuevo}>
      <Text style={styles.nombre}>{titulo}</Text>
      <Campo placeholder="Nombre" value={datos.nombre} onChangeText={nombre => setDatos({ ...datos, nombre })} />
      <Text style={styles.detalle}>Músculo principal</Text>
      <View style={styles.chips}>
        {ZONAS_MUSCULO.map(z => (
          <Chip key={z.zona} texto={z.nombre} activo={zona === z.zona} onPress={() => elegirZona(z.zona)} />
        ))}
        <Chip texto="Otro" activo={zona === 'otro'} onPress={() => elegirZona('otro')} />
      </View>
      {zonaElegida && zonaElegida.musculos.length > 1 && (
        <>
          <Text style={styles.detalle}>¿Cuál?</Text>
          <View style={styles.chips}>
            <Chip texto={`${zonaElegida.nombre} en general`} activo={datos.musculo_principal === zonaElegida.zona} onPress={() => setMusculo(zonaElegida.zona)} />
            {zonaElegida.musculos.map(m => (
              <Chip key={m} texto={m} activo={datos.musculo_principal === m} onPress={() => setMusculo(m)} />
            ))}
          </View>
        </>
      )}
      {zona === 'otro' && (
        <>
          {propios.length > 0 && (
            <View style={styles.chips}>
              {propios.map(m => (
                <Chip key={m} texto={m} activo={datos.musculo_principal === m} onPress={() => setMusculo(m)} />
              ))}
            </View>
          )}
          <Campo placeholder="¿Qué músculo? (ej: cuello)" value={datos.musculo_principal} onChangeText={setMusculo} maxLength={40} autoCapitalize="none" />
        </>
      )}
      <Text style={styles.detalle}>Equipo</Text>
      <View style={styles.chips}>
        {Object.entries(EQUIPO).map(([valor, texto]) => (
          <Chip key={valor} texto={texto} activo={datos.equipo === valor} onPress={() => setDatos({ ...datos, equipo: valor })} />
        ))}
      </View>
      {!!nota && <Text style={styles.detalle}>{nota}</Text>}
      {!!error && <Text style={[styles.detalle, { color: Colors.error }]}>{error}</Text>}
      <Boton titulo={boton} onPress={guardar} cargando={guardando} />
      <TouchableOpacity onPress={onCancelar} style={{ padding: Spacing.sm, alignSelf: 'center' }}>
        <Text style={styles.detalle}>Cancelar</Text>
      </TouchableOpacity>
    </View>
  );
}

function Chip({ texto, activo, onPress }: { texto: string; activo: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity style={[styles.chip, activo && styles.chipActivo]} onPress={onPress}>
      <Text style={[styles.chipTexto, activo && { color: Colors.textInverse }]}>{texto}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  fondo: { flex: 1, backgroundColor: Colors.bg },
  cabecera: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: Spacing.md },
  titulo: { ...Typography.titleLg, color: Colors.textPrimary },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs, marginBottom: Spacing.sm },
  chip: { paddingVertical: 6, paddingHorizontal: 10, borderRadius: Radius.full, backgroundColor: Colors.bgMuted },
  chipActivo: { backgroundColor: Colors.accent },
  chipTexto: { ...Typography.label, color: Colors.textPrimary },
  item: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    paddingVertical: Spacing.sm, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  nombre: { ...Typography.body, color: Colors.textPrimary },
  detalle: { ...Typography.caption, color: Colors.textSecondary },
  crear: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, paddingVertical: Spacing.md },
  nuevo: { marginTop: Spacing.md, gap: Spacing.sm },
});
