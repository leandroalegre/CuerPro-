/**
 * Pantalla de ENTRADA
 * - Entrar con email y contraseña
 * - Crear cuenta nueva
 */
import { useState } from 'react';
import { Alert, Image, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Boton, Campo, Card } from '../components/ui';
import { APP_VERSION, DESARROLLADOR } from '../constants/app';
import { Colors, Spacing, Typography } from '../constants/theme';
import { useSesion } from '../hooks/useSesion';
import { api } from '../lib/api';

export default function LoginScreen() {
  const { entrar } = useSesion();
  const [modo, setModo] = useState<'login' | 'registro'>('login');
  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [cargando, setCargando] = useState(false);

  const enviar = async () => {
    setCargando(true);
    try {
      const data = modo === 'login'
        ? await api<{ token: string }>('login', { email, password })
        : await api<{ token: string }>('registro', { nombre, email, password });
      await entrar(data.token);
    } catch (e: any) {
      Alert.alert('No se pudo entrar', e.message);
    } finally {
      setCargando(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.bg }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.contenido} keyboardShouldPersistTaps="handled">
          <Image source={require('../assets/images/logo.png')} style={styles.logo} resizeMode="contain" accessibilityLabel="CuerPro" />
          <Text style={styles.subtitulo}>Entrená con tu grupo, seguí tu progreso.</Text>

          <Card>
            {modo === 'registro' && (
              <Campo placeholder="Tu nombre" value={nombre} onChangeText={setNombre} autoCapitalize="words" />
            )}
            <Campo
              placeholder="Email"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
            />
            <Campo placeholder="Contraseña" value={password} onChangeText={setPassword} secureTextEntry />
            <Boton
              titulo={modo === 'login' ? 'Entrar' : 'Crear cuenta'}
              onPress={enviar}
              cargando={cargando}
              style={{ marginTop: Spacing.sm }}
            />
          </Card>

          <TouchableOpacity onPress={() => setModo(modo === 'login' ? 'registro' : 'login')}>
            <Text style={styles.cambiar}>
              {modo === 'login' ? '¿No tenés cuenta? Creá una' : '¿Ya tenés cuenta? Entrá'}
            </Text>
          </TouchableOpacity>

          <Text style={styles.creditos}>{`Desarrollado por ${DESARROLLADOR} · v${APP_VERSION}`}</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  contenido: { flexGrow: 1, justifyContent: 'center', padding: Spacing.lg },
  logo: { width: 260, height: 93, alignSelf: 'center' },
  subtitulo: { ...Typography.body, color: Colors.textSecondary, textAlign: 'center', marginBottom: Spacing.lg },
  cambiar: { ...Typography.body, color: Colors.accent, textAlign: 'center', marginTop: Spacing.sm },
  creditos: { ...Typography.caption, color: Colors.textMuted, textAlign: 'center', marginTop: Spacing.xl },
});
