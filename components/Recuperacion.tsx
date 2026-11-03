import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';
import { Text } from './Letra';
import { Colors, Radius, Spacing, Typography } from '../constants/theme';
import { musculoLindo, Recuperacion, textoRecuperacion } from '../lib/api';

// Rojo si está muy cansado, amarillo a medio camino
export const colorRecuperacion = (p: number) => (p < 50 ? Colors.error : p < 85 ? Colors.warning : Colors.success);

// Una línea por músculo que todavía no se recuperó: "Pecho al 60% de recuperación (100% en 1 día)"
export function AvisoRecuperacion({ lista }: { lista: Recuperacion[] }) {
  if (!lista.length) return null;
  return (
    <View style={styles.aviso}>
      {lista.map(r => (
        <View key={r.musculo} style={styles.fila}>
          <Ionicons name="battery-half-outline" size={16} color={colorRecuperacion(r.porcentaje)} />
          <Text style={[styles.texto, { color: colorRecuperacion(r.porcentaje) }]}>{textoRecuperacion(r)}</Text>
        </View>
      ))}
    </View>
  );
}

// Tarjeta con barras: cómo están tus músculos hoy
export function BarrasRecuperacion({ lista }: { lista: Recuperacion[] }) {
  return (
    <View style={styles.tarjeta}>
      <Text style={styles.titulo}>Recuperación de tus músculos</Text>
      {!lista.length ? (
        <Text style={styles.nota}>Todos al 100%: podés entrenar cualquier músculo.</Text>
      ) : (
        <>
          {lista.map(r => (
            <View key={r.musculo} style={{ marginTop: Spacing.sm }}>
              <View style={styles.cabecera}>
                <Text style={styles.musculo}>{musculoLindo(r.musculo)}</Text>
                <Text style={[styles.musculo, { color: colorRecuperacion(r.porcentaje) }]}>{`${r.porcentaje}%`}</Text>
              </View>
              <View style={styles.barra}>
                <View style={[styles.relleno, { width: `${r.porcentaje}%`, backgroundColor: colorRecuperacion(r.porcentaje) }]} />
              </View>
            </View>
          ))}
          <Text style={[styles.nota, { marginTop: Spacing.sm }]}>Los que no aparecen están al 100%. Se calcula con la última vez que entrenaste cada músculo.</Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  aviso: { marginTop: Spacing.xs, gap: 2 },
  fila: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  texto: { ...Typography.caption, fontWeight: '600', flex: 1, minWidth: 0 },
  tarjeta: {
    backgroundColor: Colors.bgCard, borderRadius: Radius.lg, padding: Spacing.md, marginBottom: Spacing.md,
    borderWidth: 1, borderColor: Colors.border,
  },
  titulo: { ...Typography.titleMd, color: Colors.textPrimary },
  cabecera: { flexDirection: 'row', justifyContent: 'space-between' },
  musculo: { ...Typography.caption, color: Colors.textPrimary, fontWeight: '600' },
  barra: { height: 8, borderRadius: Radius.full, backgroundColor: Colors.bgMuted, marginTop: 4, overflow: 'hidden' },
  relleno: { height: 8, borderRadius: Radius.full },
  nota: { ...Typography.caption, color: Colors.textSecondary },
});
