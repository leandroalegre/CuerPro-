/**
 * Pantalla SOBRE CUERPRO
 * - Quién hizo la app y cómo escribirle
 * - Pedir CuerPro para otro gimnasio o grupo
 */
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Image, Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Boton, Card, pantalla } from '../components/ui';
import { APP_VERSION, DESARROLLADOR, EMAIL_DESARROLLADOR, ESLOGAN, URL_PRIVACIDAD, URL_TERMINOS } from '../constants/app';
import { Colors, Spacing, Typography } from '../constants/theme';

const escribir = (asunto: string) =>
  Linking.openURL(`mailto:${EMAIL_DESARROLLADOR}?subject=${encodeURIComponent(asunto)}`).catch(() => {});

export default function AcercaScreen() {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.bg }}>
      <View style={styles.encabezado}>
        <TouchableOpacity onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} hitSlop={12}>
          <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.titulo}>Sobre CuerPro</Text>
      </View>

      <ScrollView style={pantalla.scroll} contentContainerStyle={pantalla.contenido}>
        <Image source={require('../assets/images/logo.png')} style={styles.logo} resizeMode="contain" accessibilityLabel="CuerPro" />
        <Text style={styles.eslogan}>{ESLOGAN}</Text>

        <Card>
          <Text style={styles.etiqueta}>CREADA POR</Text>
          <Text style={styles.nombre}>{DESARROLLADOR}</Text>
          <Text style={styles.texto}>
            Hice CuerPro para entrenar con mis amigos sin perder el ritmo: saber qué toca hoy, quién va y cuánto vamos mejorando.
          </Text>
          <Text style={styles.frase}>
            “No hace falta ser el más fuerte del gimnasio. Hace falta volver mañana.”
          </Text>
          <TouchableOpacity style={styles.email} onPress={() => escribir('CuerPro')}>
            <Ionicons name="mail-outline" size={18} color={Colors.accent} />
            <Text style={styles.emailTexto} selectable>{EMAIL_DESARROLLADOR}</Text>
          </TouchableOpacity>
        </Card>

        <Card>
          <Text style={styles.subtitulo}>¿Querés CuerPro para tu gimnasio o tu grupo?</Text>
          <Text style={styles.texto}>Escribime y lo armamos juntos. También me sirven tus ideas o si encontrás algo que no anda.</Text>
          <Boton titulo="Escribime" onPress={() => escribir('Quiero CuerPro para mi gimnasio o grupo')} style={{ marginTop: Spacing.sm }} />
        </Card>

        <TouchableOpacity onPress={() => Linking.openURL(URL_TERMINOS).catch(() => {})}>
          <Text style={styles.privacidad}>Términos y condiciones</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => Linking.openURL(URL_PRIVACIDAD).catch(() => {})}>
          <Text style={[styles.privacidad, { marginTop: Spacing.xs }]}>Política de privacidad</Text>
        </TouchableOpacity>
        <Text style={styles.version}>{`CuerPro v${APP_VERSION}`}</Text>
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
  logo: { width: 240, height: 86, alignSelf: 'center', marginTop: Spacing.md },
  eslogan: { ...Typography.body, color: Colors.textSecondary, textAlign: 'center', marginBottom: Spacing.lg },
  etiqueta: { ...Typography.label, color: Colors.textMuted, letterSpacing: 1 },
  nombre: { ...Typography.titleLg, color: Colors.textPrimary, marginBottom: Spacing.sm },
  subtitulo: { ...Typography.titleMd, color: Colors.textPrimary, marginBottom: Spacing.xs },
  texto: { ...Typography.body, color: Colors.textSecondary, lineHeight: 22 },
  frase: {
    ...Typography.body, color: Colors.textPrimary, fontStyle: 'italic', marginTop: Spacing.md,
    paddingLeft: Spacing.sm, borderLeftWidth: 3, borderLeftColor: Colors.accent,
  },
  email: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, marginTop: Spacing.md },
  emailTexto: { ...Typography.body, color: Colors.accent, fontWeight: '600' },
  privacidad: { ...Typography.caption, color: Colors.accent, textAlign: 'center', marginTop: Spacing.md },
  version: { ...Typography.caption, color: Colors.textMuted, textAlign: 'center', marginTop: Spacing.md },
});
