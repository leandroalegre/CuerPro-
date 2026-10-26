import { DarkTheme, ThemeProvider } from '@react-navigation/native';
import * as Notifications from 'expo-notifications';
import { router, Stack, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { Colors } from '../constants/theme';
import { useNotificaciones } from '../hooks/useNotificaciones';
import { SesionProvider, useSesion } from '../hooks/useSesion';

SplashScreen.preventAutoHideAsync();

// Mostrar las notificaciones aunque la app esté abierta
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

const tema = {
  ...DarkTheme,
  colors: { ...DarkTheme.colors, background: Colors.bg, card: Colors.bgCard, primary: Colors.accent },
};

function Navegacion() {
  const { loaded, token } = useSesion();
  const segments = useSegments();
  useNotificaciones(token);

  useEffect(() => {
    if (loaded) SplashScreen.hideAsync();
  }, [loaded]);

  // Sin sesión → pantalla de entrada; con sesión → pestañas.
  // El Stack se monta siempre: expo-router no deja navegar antes de que exista.
  const enLogin = segments[0] === 'login';
  useEffect(() => {
    if (!loaded) return;
    if (!token && !enLogin) router.replace('/login');
    if (token && enLogin) router.replace('/');
  }, [loaded, token, enLogin]);

  // Mientras se decide a dónde ir, una tapa del color de fondo evita ver
  // las pestañas un instante antes del login.
  const redirigiendo = !loaded || (!token && !enLogin) || (!!token && enLogin);

  return (
    <>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: Colors.bg } }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="login" />
      </Stack>
      {redirigiendo && <View style={[StyleSheet.absoluteFill, { backgroundColor: Colors.bg }]} />}
    </>
  );
}

export default function RootLayout() {
  return (
    <ThemeProvider value={tema}>
      <SesionProvider>
        <StatusBar style="light" />
        <Navegacion />
      </SesionProvider>
    </ThemeProvider>
  );
}
