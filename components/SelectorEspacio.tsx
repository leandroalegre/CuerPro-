/**
 * Arriba a la derecha de cada pestaña: elegir entre tu Individual y tus grupos.
 * Solo aparece si tenés más de uno.
 */
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Colors, Radius, Spacing, Typography } from '../constants/theme';
import { useSesion } from '../hooks/useSesion';

export function SelectorEspacio() {
  const { grupos, grupo, elegirGrupo } = useSesion();
  const [abierto, setAbierto] = useState(false);
  if (grupos.length < 2 || !grupo) return null;

  return (
    <>
      <TouchableOpacity style={styles.boton} onPress={() => setAbierto(true)} accessibilityLabel="Cambiar de grupo">
        <Ionicons name={grupo.individual ? 'person' : 'people'} size={16} color={Colors.accent} />
        <Text style={styles.botonTexto} numberOfLines={1}>{grupo.nombre}</Text>
        <Ionicons name="chevron-down" size={16} color={Colors.textSecondary} />
      </TouchableOpacity>
      <Modal visible={abierto} transparent animationType="fade" onRequestClose={() => setAbierto(false)}>
        <Pressable style={styles.fondo} onPress={() => setAbierto(false)}>
          <View style={styles.panel}>
            <Text style={styles.titulo}>¿Dónde entrenás?</Text>
            {grupos.map(g => (
              <TouchableOpacity
                key={g.id}
                style={[styles.opcion, g.id === grupo.id && styles.opcionActiva]}
                onPress={() => { elegirGrupo(g.id); setAbierto(false); }}
              >
                <Ionicons name={g.individual ? 'person' : 'people'} size={22} color={g.id === grupo.id ? Colors.accent : Colors.textSecondary} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.opcionTitulo}>{g.nombre}</Text>
                  <Text style={styles.opcionDetalle}>{g.individual ? 'Solo vos, tu propio plan' : g.rol === 'coach' ? 'Grupo · sos coach' : 'Grupo'}</Text>
                </View>
                {g.id === grupo.id && <Ionicons name="checkmark" size={20} color={Colors.accent} />}
              </TouchableOpacity>
            ))}
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  boton: {
    flexDirection: 'row', alignItems: 'center', gap: 4, maxWidth: 180, marginRight: Spacing.md,
    paddingVertical: 6, paddingHorizontal: 10, borderRadius: Radius.full, backgroundColor: Colors.bgMuted,
  },
  botonTexto: { ...Typography.label, color: Colors.textPrimary, flexShrink: 1 },
  fondo: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: Spacing.lg },
  panel: { backgroundColor: Colors.bgCard, borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1, borderColor: Colors.border },
  titulo: { ...Typography.titleMd, color: Colors.textPrimary, marginBottom: Spacing.sm },
  opcion: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.sm, marginTop: Spacing.xs,
    borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border,
  },
  opcionActiva: { borderColor: Colors.accent },
  opcionTitulo: { ...Typography.body, color: Colors.textPrimary, fontWeight: '600' },
  opcionDetalle: { ...Typography.caption, color: Colors.textSecondary },
});
