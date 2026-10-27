/**
 * Pantalla de ENTRADA
 * - Entrar con email y contraseña
 * - Crear cuenta nueva
 * - Recuperar la contraseña con un código por email
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
  const [modo, setModo] = useState<'login' | 'registro' | 'recuperar'>('login');
  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [cargando, setCargando] = useState(false);
  const [codigo, setCodigo] = useState('');
  const [codigoEnviado, setCodigoEnviado] = useState(false);

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

  const pedirCodigo = async () => {
    setCargando(true);
    try {
      await api('recuperar_pedir', { email });
      setCodigoEnviado(true);
      Alert.alert('Revisá tu email', 'Si hay una cuenta con ese email, te mandamos un código de 6 números. Mirá también en spam.');
    } catch (e: any) {
      Alert.alert('No se pudo', e.message);
    } finally {
      setCargando(false);
    }
  };

  const cambiarConCodigo = async () => {
    setCargando(true);
    try {
      const data = await api<{ token: string }>('recuperar_cambiar', { email, codigo, nueva: password });
      await entrar(data.token);
    } catch (e: any) {
      Alert.alert('No se pudo', e.message);
    } finally {
      setCargando(false);
    }
  };

  const ir = (m: typeof modo) => {
    setModo(m);
    setPassword('');
    setCodigo('');
    setCodigoEnviado(false);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.bg }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.contenido} keyboardShouldPersistTaps="handled">
          <Image source={require('../assets/images/logo.png')} style={styles.logo} resizeMode="contain" accessibilityLabel="CuerPro" />
          <Text style={styles.subtitulo}>Entrená con tu grupo, seguí tu progreso.</Text>

          {modo === 'recuperar' ? (
            <Card>
              <Text style={styles.ayuda}>
                {codigoEnviado
                  ? 'Escribí el código que te llegó por email y elegí una contraseña nueva.'
                  : 'Te mandamos un código por email para que elijas una contraseña nueva.'}
              </Text>
              <Campo
                placeholder="Email"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                editable={!codigoEnviado}
              />
              {codigoEnviado ? (
                <>
                  <Campo placeholder="Código de 6 números" value={codigo} onChangeText={setCodigo} keyboardType="number-pad" maxLength={6} />
                  <Campo placeholder="Contraseña nueva" value={password} onChangeText={setPassword} secureTextEntry />
                  <Boton
                    titulo="Cambiar y entrar"
                    onPress={cambiarConCodigo}
                    cargando={cargando}
                    disabled={codigo.trim().length !== 6 || password.length < 6}
                    style={{ marginTop: Spacing.sm }}
                  />
                  <TouchableOpacity onPress={pedirCodigo} disabled={cargando}>
                    <Text style={styles.cambiar}>No me llegó, mandar otro</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <Boton titulo="Mandar código" onPress={pedirCodigo} cargando={cargando} disabled={!email.trim()} style={{ marginTop: Spacing.sm }} />
              )}
            </Card>
          ) : (
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
              {modo === 'login' && (
                <TouchableOpacity onPress={() => ir('recuperar')}>
                  <Text style={styles.olvide}>Me olvidé la contraseña</Text>
                </TouchableOpacity>
              )}
            </Card>
          )}

          <TouchableOpacity onPress={() => ir(modo === 'login' ? 'registro' : 'login')}>
            <Text style={styles.cambiar}>
              {modo === 'login' ? '¿No tenés cuenta? Creá una' : modo === 'registro' ? '¿Ya tenés cuenta? Entrá' : 'Volver a entrar'}
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
  ayuda: { ...Typography.body, color: Colors.textSecondary, marginBottom: Spacing.sm },
  olvide: { ...Typography.caption, color: Colors.textSecondary, textAlign: 'center', marginTop: Spacing.md },
  cambiar: { ...Typography.body, color: Colors.accent, textAlign: 'center', marginTop: Spacing.sm },
  creditos: { ...Typography.caption, color: Colors.textMuted, textAlign: 'center', marginTop: Spacing.xl },
});
