/**
 * Pantalla GRUPOS
 * - Mis grupos y cuál está elegido
 * - Crear grupo o unirse con código de invitación
 * - El coach carga los horarios fijos del grupo
 */
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Boton, Campo, Card, Etiqueta, pantalla, Texto, Titulo } from '../../components/ui';
import { APP_VERSION, DESARROLLADOR } from '../../constants/app';
import { Colors, Radius, Spacing, Typography } from '../../constants/theme';
import { useSesion } from '../../hooks/useSesion';
import { api } from '../../lib/api';

const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

interface Detalle {
  miembros: { id: number; nombre: string; rol: string }[];
  horarios: { id: number; dia_semana: number; hora: string }[];
}

export default function GruposScreen() {
  const { token, usuario, grupos, grupo, elegirGrupo, recargar, salir } = useSesion();
  const [codigo, setCodigo] = useState('');
  const [nombreNuevo, setNombreNuevo] = useState('');
  const [detalle, setDetalle] = useState<Detalle | null>(null);
  const [dias, setDias] = useState<number[]>([]);
  const [hora, setHora] = useState('19:00');

  const cargarDetalle = useCallback(async () => {
    if (!token || !grupo) return setDetalle(null);
    try {
      const data = await api<Detalle>('grupo_detalle', { grupo_id: grupo.id }, token);
      setDetalle(data);
      setDias(data.horarios.map(h => h.dia_semana));
      if (data.horarios[0]) setHora(data.horarios[0].hora);
    } catch {}
  }, [token, grupo]);

  useFocusEffect(useCallback(() => { cargarDetalle(); }, [cargarDetalle]));

  const unirse = async () => {
    try {
      const data = await api<{ grupo: { id: number; nombre: string } }>('grupo_unirse', { codigo }, token);
      setCodigo('');
      await recargar();
      await elegirGrupo(data.grupo.id);
      Alert.alert('Listo', `Ya sos parte de ${data.grupo.nombre}.`);
    } catch (e: any) {
      Alert.alert('No se pudo', e.message);
    }
  };

  const crear = async () => {
    if (!nombreNuevo.trim()) return;
    try {
      const data = await api<{ grupo: { id: number; codigo_invitacion: string } }>(
        'grupo_crear',
        { nombre: nombreNuevo.trim() },
        token,
      );
      setNombreNuevo('');
      await recargar();
      await elegirGrupo(data.grupo.id);
      Alert.alert('Grupo creado', `Pasales este código a tus amigos: ${data.grupo.codigo_invitacion}`);
    } catch (e: any) {
      Alert.alert('No se pudo', e.message);
    }
  };

  const guardarHorarios = async () => {
    if (!grupo) return;
    if (!/^\d{1,2}:\d{2}$/.test(hora)) return Alert.alert('Hora inválida', 'Usá el formato 19:00');
    try {
      await api('horarios_guardar', {
        grupo_id: grupo.id,
        horarios: dias.sort().map(d => ({ dia_semana: d, hora })),
      }, token);
      Alert.alert('Horarios guardados');
      cargarDetalle();
    } catch (e: any) {
      Alert.alert('No se pudo', e.message);
    }
  };

  return (
    <ScrollView style={pantalla.scroll} contentContainerStyle={pantalla.contenido} keyboardShouldPersistTaps="handled">
      <Etiqueta>{`Hola, ${usuario?.nombre ?? ''}`}</Etiqueta>

      {grupos.length > 0 && (
        <Card>
          <Titulo>Mis grupos</Titulo>
          {grupos.map(g => (
            <TouchableOpacity key={g.id} style={styles.fila} onPress={() => elegirGrupo(g.id)}>
              <Text style={[styles.textoFila, g.id === grupo?.id && { color: Colors.accent }]}>{g.nombre}</Text>
              <Text style={styles.rol}>{g.rol}</Text>
            </TouchableOpacity>
          ))}
        </Card>
      )}

      {grupo && detalle && (
        <Card>
          <Titulo>{grupo.nombre}</Titulo>
          <Texto muted>{`Código de invitación: ${grupo.codigo_invitacion}`}</Texto>
          <Etiqueta>{`Miembros (${detalle.miembros.length})`}</Etiqueta>
          {detalle.miembros.map(m => (
            <View key={m.id} style={styles.fila}>
              <Text style={styles.textoFila}>{m.nombre}</Text>
              <Text style={styles.rol}>{m.rol}</Text>
            </View>
          ))}

          <View style={{ marginTop: Spacing.md }}>
            <Etiqueta>Horarios</Etiqueta>
            {grupo.rol === 'coach' ? (
              <>
                <View style={styles.dias}>
                  {DIAS.map((d, i) => {
                    const activo = dias.includes(i);
                    return (
                      <TouchableOpacity
                        key={d}
                        style={[styles.dia, activo && styles.diaActivo]}
                        onPress={() => setDias(activo ? dias.filter(x => x !== i) : [...dias, i])}
                      >
                        <Text style={[styles.diaTexto, activo && { color: Colors.textInverse }]}>{d}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <Campo value={hora} onChangeText={setHora} placeholder="19:00" keyboardType="numbers-and-punctuation" />
                <Boton titulo="Guardar horarios" tipo="secundario" onPress={guardarHorarios} />
              </>
            ) : (
              <Texto>
                {detalle.horarios.length
                  ? detalle.horarios.map(h => `${DIAS[h.dia_semana]} ${h.hora}`).join(' · ')
                  : 'Sin horarios todavía'}
              </Texto>
            )}
          </View>
        </Card>
      )}

      <Card>
        <Titulo>Unirme a un grupo</Titulo>
        <Campo placeholder="Código de invitación" value={codigo} onChangeText={setCodigo} autoCapitalize="characters" />
        <Boton titulo="Unirme" onPress={unirse} disabled={!codigo.trim()} />
      </Card>

      <Card>
        <Titulo>Crear un grupo</Titulo>
        <Campo placeholder="Nombre del grupo" value={nombreNuevo} onChangeText={setNombreNuevo} />
        <Boton titulo="Crear" tipo="secundario" onPress={crear} disabled={!nombreNuevo.trim()} />
      </Card>

      <Boton titulo="Cerrar sesión" tipo="peligro" onPress={salir} />

      <Text style={styles.creditos}>{`CuerPro v${APP_VERSION}\nDesarrollado por ${DESARROLLADOR}`}</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  fila: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  textoFila: { ...Typography.body, color: Colors.textPrimary },
  rol: { ...Typography.caption, color: Colors.textSecondary },
  dias: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs, marginBottom: Spacing.sm },
  dia: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: Radius.full,
    backgroundColor: Colors.bgMuted,
  },
  diaActivo: { backgroundColor: Colors.accent },
  diaTexto: { ...Typography.label, color: Colors.textPrimary },
  creditos: { ...Typography.caption, color: Colors.textMuted, textAlign: 'center', marginTop: Spacing.lg, lineHeight: 18 },
});
