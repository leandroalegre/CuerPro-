/**
 * En el navegador, ofrece instalar CuerPro como app (ícono en el inicio, pantalla completa).
 * Android/compu: usa el aviso del navegador. iPhone: explica cómo agregarla desde Compartir.
 */
import { useEffect, useState } from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Colors, Spacing, Typography } from '../constants/theme';
import { Boton, Card } from './ui';

const CERRADO = 'cuerpro_instalar_cerrado';

function leerCerrado() {
  try { return localStorage.getItem(CERRADO) === '1'; } catch { return false; }
}

export function InstalarApp() {
  const [instalable, setInstalable] = useState(false);
  const [cerrado, setCerrado] = useState(true);

  const web = Platform.OS === 'web' && typeof window !== 'undefined';
  const yaInstalada = web && (window.matchMedia?.('(display-mode: standalone)').matches || (navigator as any).standalone);
  const iphone = web && /iphone|ipad|ipod/i.test(navigator.userAgent);

  useEffect(() => {
    if (!web) return;
    setCerrado(leerCerrado());
    const avisar = () => setInstalable(!!(window as any).__cuerproInstalar);
    avisar();
    window.addEventListener('cuerpro-instalable', avisar);
    window.addEventListener('appinstalled', () => setInstalable(false));
    return () => window.removeEventListener('cuerpro-instalable', avisar);
  }, [web]);

  if (!web || yaInstalada || cerrado || (!instalable && !iphone)) return null;

  const instalar = async () => {
    const aviso = (window as any).__cuerproInstalar;
    if (!aviso) return;
    aviso.prompt();
    await aviso.userChoice.catch(() => null);
    (window as any).__cuerproInstalar = null;
    setInstalable(false);
  };
  const cerrar = () => {
    try { localStorage.setItem(CERRADO, '1'); } catch {}
    setCerrado(true);
  };

  return (
    <Card style={{ borderColor: Colors.accent }}>
      <View style={styles.fila}>
        <Text style={styles.titulo}>Instalá CuerPro</Text>
        <TouchableOpacity onPress={cerrar} hitSlop={10} accessibilityLabel="Cerrar">
          <Text style={styles.cerrar}>✕</Text>
        </TouchableOpacity>
      </View>
      {iphone ? (
        <Text style={styles.texto}>
          Tocá el botón Compartir de Safari (el cuadrado con la flecha) y elegí "Agregar a inicio". Queda con su ícono, como una app.
        </Text>
      ) : (
        <>
          <Text style={styles.texto}>Agregala al inicio del celular o la compu y abrila como una app, sin barra del navegador.</Text>
          <Boton titulo="Instalar" onPress={instalar} style={{ marginTop: Spacing.sm }} />
        </>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  fila: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  titulo: { ...Typography.titleMd, color: Colors.textPrimary },
  cerrar: { ...Typography.body, color: Colors.textMuted },
  texto: { ...Typography.body, color: Colors.textSecondary, marginTop: Spacing.xs },
});
