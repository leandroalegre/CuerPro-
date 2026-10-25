/**
 * Pantalla HOY
 * - Próximo encuentro del grupo y qué rutina toca
 * - Voy / no voy
 * - Quién confirmó; el coach marca quién vino
 * - Si no vas: cuántas veces más tenés que ir para llegar a tu objetivo del mes
 */
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Boton, Card, Etiqueta, pantalla, Texto, Titulo, Vacio } from '../../components/ui';
import { Colors, Spacing, Typography } from '../../constants/theme';
import { fraseDelDia } from '../../constants/frases';
import { fechaLinda, useEncuentro } from '../../hooks/useEncuentro';
import { useSesion } from '../../hooks/useSesion';
import { api, Confirmacion } from '../../lib/api';

export default function HoyScreen() {
  const { token, usuario, grupo } = useSesion();
  const { encuentro, objetivo, cargando, error, recargar } = useEncuentro();
  const [enviando, setEnviando] = useState(false);

  if (!grupo) {
    return (
      <ScrollView style={pantalla.scroll} contentContainerStyle={pantalla.contenido}>
        <Vacio texto="Todavía no estás en ningún grupo. Creá uno o unite con un código." />
        <Boton titulo="Ir a Grupos" onPress={() => router.push('/grupos')} />
      </ScrollView>
    );
  }

  const esCoach = grupo.rol === 'coach';
  const mia = encuentro?.confirmaciones.find(c => c.usuario_id === usuario?.id);
  const van = encuentro?.confirmaciones.filter(c => c.va === 1) ?? [];
  const noVan = encuentro?.confirmaciones.filter(c => c.va === 0) ?? [];
  const sinResponder = encuentro?.confirmaciones.filter(c => c.va === null) ?? [];

  const confirmar = async (va: boolean) => {
    if (!encuentro) return;
    setEnviando(true);
    try {
      await api('confirmar', { encuentro_id: encuentro.id, va: va ? 1 : 0 }, token);
      await recargar();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setEnviando(false);
    }
  };

  const marcarAsistencia = async (c: Confirmacion) => {
    if (!encuentro) return;
    try {
      await api('asistencia', { encuentro_id: encuentro.id, usuario_id: c.usuario_id, asistio: c.asistio ? 0 : 1 }, token);
      await recargar();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  return (
    <ScrollView
      style={pantalla.scroll}
      contentContainerStyle={pantalla.contenido}
      refreshControl={<RefreshControl refreshing={cargando} onRefresh={recargar} tintColor={Colors.accent} />}
    >
      <Etiqueta>{grupo.nombre}</Etiqueta>
      <Text style={styles.frase}>{`“${fraseDelDia()}”`}</Text>

      {error && <Vacio texto={error} />}

      {!encuentro && !cargando && !error && (
        <Vacio
          texto={esCoach
            ? 'El grupo todavía no tiene horarios. Cargalos desde Grupos.'
            : 'El grupo todavía no tiene horarios cargados.'}
        />
      )}

      {encuentro && (
        <>
          <Card>
            <Titulo>Próximo entrenamiento</Titulo>
            <Texto>{fechaLinda(encuentro.fecha_hora)}</Texto>
            <Texto muted>{encuentro.dia ? `Toca: ${encuentro.dia.nombre}` : 'Todavía no hay plan cargado'}</Texto>

            <View style={styles.fila}>
              <Boton
                titulo="Voy"
                tipo={mia?.va === 1 ? 'exito' : 'secundario'}
                onPress={() => confirmar(true)}
                cargando={enviando}
                style={styles.mitad}
              />
              <Boton
                titulo="No voy"
                tipo={mia?.va === 0 ? 'peligro' : 'secundario'}
                onPress={() => confirmar(false)}
                cargando={enviando}
                style={styles.mitad}
              />
            </View>
          </Card>

          {objetivo && (
            <Card style={{ borderColor: Colors.warning, backgroundColor: Colors.warningBg }}>
              <Titulo>{objetivo.objetivo ? `Tu objetivo: ${objetivo.objetivo}` : 'Seguí sumando'}</Titulo>
              <Texto>{objetivo.texto}</Texto>
            </Card>
          )}

          <Card>
            <Titulo>Quién va</Titulo>
            {esCoach && <Texto muted>Tocá a cada uno cuando llegue para marcar la asistencia.</Texto>}
            <Lista titulo={`Van (${van.length})`} gente={van} esCoach={esCoach} onTocar={marcarAsistencia} />
            <Lista titulo={`No van (${noVan.length})`} gente={noVan} esCoach={esCoach} onTocar={marcarAsistencia} />
            <Lista titulo={`Sin responder (${sinResponder.length})`} gente={sinResponder} esCoach={esCoach} onTocar={marcarAsistencia} />
          </Card>

          {encuentro.rutina.length > 0 && (
            <Boton titulo="Empezar a entrenar" onPress={() => router.push('/entrenar')} />
          )}
        </>
      )}
    </ScrollView>
  );
}

function Lista({
  titulo,
  gente,
  esCoach,
  onTocar,
}: {
  titulo: string;
  gente: Confirmacion[];
  esCoach: boolean;
  onTocar: (c: Confirmacion) => void;
}) {
  if (!gente.length) return null;
  return (
    <View style={{ marginTop: Spacing.md }}>
      <Etiqueta>{titulo}</Etiqueta>
      {gente.map(c => (
        <TouchableOpacity key={c.usuario_id} style={styles.persona} disabled={!esCoach} onPress={() => onTocar(c)}>
          <Text style={styles.nombre}>{c.nombre}</Text>
          {c.asistio === 1 && <Ionicons name="checkmark-circle" size={22} color={Colors.success} />}
          {esCoach && c.asistio !== 1 && <Ionicons name="ellipse-outline" size={22} color={Colors.textMuted} />}
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  fila: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.md },
  mitad: { flex: 1 },
  persona: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  nombre: { ...Typography.body, color: Colors.textPrimary },
  frase: { ...Typography.body, color: Colors.textSecondary, fontStyle: 'italic', marginBottom: Spacing.md },
});
