import { useState } from 'react';
import { Alert, Platform, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from './Letra';
import { Colors, Radius, Spacing, Typography } from '../constants/theme';
import { useSesion } from '../hooks/useSesion';
import { api, Plan } from '../lib/api';

// El coach elige qué día del plan se entrena en este encuentro (vale para todo el grupo).
// Sirve si el grupo fue un día sin anotarlo y la app muestra lo mismo de la vez anterior.
// Los entrenamientos siguientes siguen el orden del plan desde el elegido.
export function CambiarDiaEncuentro({ encuentroId, diaId, onCambio }: { encuentroId: number; diaId: number | null; onCambio: () => void }) {
  const { token, grupo } = useSesion();
  const [dias, setDias] = useState<{ id: number; nombre: string }[] | null>(null);
  const [abierto, setAbierto] = useState(false);

  const abrir = async () => {
    setAbierto(!abierto);
    if (dias || !grupo) return;
    try {
      const d = await api<{ plan: Plan | null }>('plan', { grupo_id: grupo.id }, token);
      setDias(d.plan?.dias.map(x => ({ id: x.id, nombre: x.nombre })) ?? []);
    } catch {}
  };

  const elegir = async (id: number) => {
    try {
      await api('encuentro_dia', { encuentro_id: encuentroId, dia_id: id }, token);
      setAbierto(false);
      onCambio();
    } catch (e: any) {
      if (Platform.OS === 'web') window.alert(e.message);
      else Alert.alert('No se pudo', e.message);
    }
  };

  return (
    <View style={{ marginTop: Spacing.sm }}>
      <TouchableOpacity onPress={abrir}>
        <Text style={styles.link}>{abierto ? 'Cerrar' : 'Cambiar qué día del plan se hace'}</Text>
      </TouchableOpacity>
      {abierto && (
        <>
          <Text style={styles.nota}>Cambia para todo el grupo. Los próximos siguen el orden del plan desde el que elijas.</Text>
          <View style={styles.chips}>
            {(dias ?? []).map(d => (
              <TouchableOpacity key={d.id} style={[styles.chip, d.id === diaId && styles.chipActivo]} onPress={() => elegir(d.id)}>
                <Text style={[styles.chipTexto, d.id === diaId && { color: Colors.textInverse }]}>{d.nombre}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  link: { ...Typography.label, color: Colors.accent },
  nota: { ...Typography.caption, color: Colors.textSecondary, marginTop: Spacing.xs },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs, marginTop: Spacing.sm },
  chip: { paddingVertical: 6, paddingHorizontal: 10, borderRadius: Radius.full, backgroundColor: Colors.bgMuted },
  chipActivo: { backgroundColor: Colors.accent },
  chipTexto: { ...Typography.label, color: Colors.textPrimary },
});
