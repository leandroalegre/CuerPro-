/**
 * Controles del tamaño de letra:
 * - BotonLetra: "Aa" arriba a la derecha de cada pestaña, pasa Normal → Mediana → Grande.
 * - ElegirLetra: las tres opciones a la vista, en Grupos → Mi cuenta y en la entrada.
 */
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { Colors, Radius, Spacing } from '../constants/theme';
import { TAMANOS, Text, useLetra } from './Letra';

export function BotonLetra() {
  const { nombre, siguiente, escala } = useLetra();
  return (
    <TouchableOpacity
      style={[styles.boton, escala !== 1 && styles.botonActivo]}
      onPress={siguiente}
      hitSlop={8}
      accessibilityLabel={`Tamaño de letra: ${nombre}. Tocá para cambiarlo`}
    >
      <Text style={[styles.aa, escala !== 1 && { color: Colors.textInverse }]}>Aa</Text>
    </TouchableOpacity>
  );
}

export function ElegirLetra() {
  const { escala, elegir } = useLetra();
  return (
    <View style={styles.opciones}>
      {TAMANOS.map(t => {
        const activo = t.escala === escala;
        return (
          <TouchableOpacity
            key={t.escala}
            style={[styles.opcion, activo && styles.opcionActiva]}
            onPress={() => elegir(t.escala)}
            accessibilityLabel={`Letra ${t.nombre}`}
          >
            {/* Cada opción se muestra en su tamaño, sin la escala actual encima */}
            <Text style={[styles.opcionAa, { fontSize: (18 * t.escala) / escala }, activo && { color: Colors.textInverse }]}>Aa</Text>
            <Text style={[styles.opcionNombre, activo && { color: Colors.textInverse }]}>{t.nombre}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  boton: {
    marginRight: Spacing.md, paddingVertical: 4, paddingHorizontal: 10,
    borderRadius: Radius.full, backgroundColor: Colors.bgMuted,
  },
  botonActivo: { backgroundColor: Colors.accent },
  aa: { fontSize: 15, fontWeight: '800', color: Colors.textPrimary },
  opciones: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.sm },
  opcion: {
    flex: 1, alignItems: 'center', justifyContent: 'flex-end', paddingVertical: Spacing.sm,
    borderRadius: Radius.md, backgroundColor: Colors.bgMuted,
  },
  opcionActiva: { backgroundColor: Colors.accent },
  opcionAa: { fontWeight: '800', color: Colors.textPrimary },
  opcionNombre: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
});
