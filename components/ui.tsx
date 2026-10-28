import { ReactNode } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  TouchableOpacity,
  View,
  ViewStyle,
} from 'react-native';
import { Colors, Radius, Spacing, Typography } from '../constants/theme';

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

// Tarjeta principal de una pantalla: borde de color a la izquierda
export function CardDestacada({ children, color = Colors.accent }: { children: ReactNode; color?: string }) {
  return <View style={[styles.card, { borderLeftWidth: 4, borderLeftColor: color }]}>{children}</View>;
}

const INSIGNIAS = {
  exito: { color: Colors.success, backgroundColor: Colors.successBg },
  aviso: { color: Colors.warning, backgroundColor: Colors.warningBg },
  peligro: { color: Colors.error, backgroundColor: Colors.errorBg },
  marca: { color: Colors.accent, backgroundColor: Colors.accentGlow },
};

// Etiqueta corta en mayúsculas: ACTIVO, VAS, TOCA HOY…
export function Insignia({ texto, tipo = 'marca' }: { texto: string; tipo?: keyof typeof INSIGNIAS }) {
  return <Text style={[styles.insignia, INSIGNIAS[tipo]]}>{texto.toUpperCase()}</Text>;
}

export function Titulo({ children }: { children: ReactNode }) {
  return <Text style={styles.titulo}>{children}</Text>;
}

export function Etiqueta({ children }: { children: ReactNode }) {
  return <Text style={styles.etiqueta}>{children}</Text>;
}

export function Texto({ children, muted }: { children: ReactNode; muted?: boolean }) {
  return <Text style={[styles.texto, muted && { color: Colors.textSecondary }]}>{children}</Text>;
}

export function Boton({
  titulo,
  onPress,
  tipo = 'primario',
  cargando,
  disabled,
  style,
}: {
  titulo: string;
  onPress: () => void;
  tipo?: 'primario' | 'secundario' | 'peligro' | 'exito';
  cargando?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
}) {
  const fondo = {
    primario: Colors.accent,
    secundario: Colors.bgMuted,
    peligro: Colors.errorBg,
    exito: Colors.successBg,
  }[tipo];
  const color = {
    primario: Colors.textInverse,
    secundario: Colors.textPrimary,
    peligro: Colors.error,
    exito: Colors.success,
  }[tipo];
  return (
    <TouchableOpacity
      style={[styles.boton, { backgroundColor: fondo }, (disabled || cargando) && { opacity: 0.5 }, style]}
      onPress={onPress}
      disabled={disabled || cargando}
      activeOpacity={0.8}
    >
      {cargando ? <ActivityIndicator color={color} /> : <Text style={[styles.botonTexto, { color }]}>{titulo}</Text>}
    </TouchableOpacity>
  );
}

export function Campo(props: TextInputProps) {
  return <TextInput placeholderTextColor={Colors.textMuted} {...props} style={[styles.campo, props.style]} />;
}

export function Vacio({ texto }: { texto: string }) {
  return (
    <Card>
      <Text style={[styles.texto, { color: Colors.textSecondary, textAlign: 'center' }]}>{texto}</Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  insignia: {
    fontSize: 11, fontWeight: '700', letterSpacing: 0.8, paddingHorizontal: 8, paddingVertical: 2,
    borderRadius: Radius.full, overflow: 'hidden', alignSelf: 'flex-start',
  },
  titulo: { ...Typography.titleLg, color: Colors.textPrimary, marginBottom: Spacing.sm },
  etiqueta: { ...Typography.label, color: Colors.textMuted, textTransform: 'uppercase', marginBottom: Spacing.xs },
  texto: { ...Typography.body, color: Colors.textPrimary },
  boton: {
    borderRadius: Radius.md,
    paddingVertical: 14,
    paddingHorizontal: Spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  botonTexto: { ...Typography.titleMd },
  campo: {
    backgroundColor: Colors.bgInput,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    color: Colors.textPrimary,
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
    fontSize: 16,
    marginBottom: Spacing.sm,
  },
});

export const pantalla = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: Colors.bg },
  contenido: { padding: Spacing.md, paddingBottom: Spacing.xl },
});
