import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import { FlatList, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Radius, Spacing, Typography } from '../constants/theme';
import { Ejercicio, EQUIPO } from '../lib/api';
import { Boton, Campo } from './ui';

export interface EjercicioNuevo { nombre: string; musculo_principal: string; equipo: string }

// Lista del catálogo con búsqueda y filtro por músculo.
// `sugerir`: si viene, primero muestra los del mismo músculo y movimiento (para elegir alternativas).
// `onCrear`: si viene, permite cargar un ejercicio que no está en el catálogo.
export function SelectorEjercicio({
  visible,
  titulo,
  ejercicios,
  excluir = [],
  sugerir,
  onElegir,
  onCerrar,
  onCrear,
}: {
  visible: boolean;
  titulo: string;
  ejercicios: Ejercicio[];
  excluir?: number[];
  sugerir?: Ejercicio | null;
  onElegir: (e: Ejercicio) => void;
  onCerrar: () => void;
  onCrear?: (datos: EjercicioNuevo) => Promise<Ejercicio>;
}) {
  const [busqueda, setBusqueda] = useState('');
  const [musculo, setMusculo] = useState<string | null>(null);
  const [nuevo, setNuevo] = useState<EjercicioNuevo | null>(null);
  const [creando, setCreando] = useState(false);
  const [error, setError] = useState('');

  // Cada vez que se abre arranca limpio; para una alternativa, filtrado por el mismo músculo
  useEffect(() => {
    if (!visible) return;
    setBusqueda('');
    setMusculo(sugerir?.musculo_principal ?? null);
    setNuevo(null);
    setError('');
  }, [visible, sugerir]);

  const musculos = useMemo(
    () => Array.from(new Set(ejercicios.map(e => e.musculo_principal))).sort(),
    [ejercicios],
  );

  const lista = useMemo(() => {
    const texto = busqueda.trim().toLowerCase();
    const filtrados = ejercicios.filter(e =>
      !excluir.includes(e.id) &&
      (!musculo || e.musculo_principal === musculo) &&
      (!texto || e.nombre.toLowerCase().includes(texto)),
    );
    if (!sugerir) return filtrados;
    const puntaje = (e: Ejercicio) =>
      (e.musculo_principal === sugerir.musculo_principal ? 2 : 0) + (e.movimiento && e.movimiento === sugerir.movimiento ? 1 : 0);
    return [...filtrados].sort((a, b) => puntaje(b) - puntaje(a));
  }, [ejercicios, excluir, musculo, busqueda, sugerir]);

  const abrirNuevo = () =>
    setNuevo({ nombre: busqueda.trim(), musculo_principal: musculo ?? '', equipo: 'maquina' });

  const crear = async () => {
    if (!onCrear || !nuevo) return;
    if (!nuevo.nombre.trim() || !nuevo.musculo_principal.trim()) {
      setError('Poné el nombre y el músculo.');
      return;
    }
    setCreando(true);
    setError('');
    try {
      const creado = await onCrear({ ...nuevo, nombre: nuevo.nombre.trim(), musculo_principal: nuevo.musculo_principal.trim() });
      onElegir(creado);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setCreando(false);
    }
  };

  const formulario = nuevo && (
    <View style={styles.nuevo}>
      <Text style={styles.nombre}>Ejercicio nuevo</Text>
      <Campo placeholder="Nombre" value={nuevo.nombre} onChangeText={nombre => setNuevo({ ...nuevo, nombre })} />
      <Text style={styles.detalle}>Músculo principal</Text>
      <View style={styles.chips}>
        {musculos.map(m => (
          <Chip key={m} texto={m} activo={nuevo.musculo_principal === m} onPress={() => setNuevo({ ...nuevo, musculo_principal: m })} />
        ))}
      </View>
      <Text style={styles.detalle}>Equipo</Text>
      <View style={styles.chips}>
        {Object.entries(EQUIPO).map(([valor, texto]) => (
          <Chip key={valor} texto={texto} activo={nuevo.equipo === valor} onPress={() => setNuevo({ ...nuevo, equipo: valor })} />
        ))}
      </View>
      {!!error && <Text style={[styles.detalle, { color: Colors.error }]}>{error}</Text>}
      <Boton titulo="Crear y agregar" onPress={crear} cargando={creando} />
      <TouchableOpacity onPress={() => setNuevo(null)} style={{ padding: Spacing.sm, alignSelf: 'center' }}>
        <Text style={styles.detalle}>Cancelar</Text>
      </TouchableOpacity>
    </View>
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
        <View style={{ paddingHorizontal: Spacing.md }}>
          <Campo placeholder="Buscar ejercicio" value={busqueda} onChangeText={setBusqueda} />
          <View style={styles.chips}>
            <Chip texto="Todos" activo={!musculo} onPress={() => setMusculo(null)} />
            {musculos.map(m => (
              <Chip key={m} texto={m} activo={musculo === m} onPress={() => setMusculo(m)} />
            ))}
          </View>
        </View>
        <FlatList
          data={lista}
          keyExtractor={e => String(e.id)}
          contentContainerStyle={{ padding: Spacing.md }}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.item} onPress={() => onElegir(item)}>
              <Text style={styles.nombre}>{item.nombre}</Text>
              <Text style={styles.detalle}>{`${item.musculo_principal} · ${EQUIPO[item.equipo] ?? item.equipo}`}</Text>
            </TouchableOpacity>
          )}
          ListEmptyComponent={<Text style={styles.detalle}>No hay ejercicios con ese filtro.</Text>}
          ListFooterComponent={pie || null}
          keyboardShouldPersistTaps="handled"
        />
      </SafeAreaView>
    </Modal>
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
  item: { paddingVertical: Spacing.sm, borderBottomWidth: 1, borderBottomColor: Colors.border },
  nombre: { ...Typography.body, color: Colors.textPrimary },
  detalle: { ...Typography.caption, color: Colors.textSecondary },
  crear: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, paddingVertical: Spacing.md },
  nuevo: { marginTop: Spacing.md, gap: Spacing.sm },
});
