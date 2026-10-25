import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { api } from '../lib/api';

// Pide permiso y le manda al servidor el token de notificaciones del celular
export function useNotificaciones(token: string | null) {
  useEffect(() => {
    if (!token || !Device.isDevice || Platform.OS === 'web') return;
    (async () => {
      const { status } = await Notifications.requestPermissionsAsync();
      if (status !== 'granted') return;
      // El projectId aparece en app.json después de correr `eas init`
      const projectId = Constants.expoConfig?.extra?.eas?.projectId;
      if (!projectId) return;
      const push = await Notifications.getExpoPushTokenAsync({ projectId });
      await api('push_token', { push_token: push.data }, token);
    })().catch(() => {});
  }, [token]);
}
