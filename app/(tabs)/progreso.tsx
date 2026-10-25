/**
 * Pantalla PROGRESO
 * - Nivel de la temporada (Bronce → Diamante) y cuánto falta para el siguiente
 * - Avisos de músculos que hace mucho no se trabajan
 * - Mejores marcas por ejercicio y asistencia
 */
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Card, Etiqueta, pantalla, Texto, Titulo, Vacio } from '../../components/ui';
import { Colors, NivelColor, Radius, Spacing, Typography } from '../../constants/theme';
import { useSesion } from '../../hooks/useSesion';
import { api, Nivel } from '../../lib/api';

interface Progreso {
  nivel: Nivel;
  musculos: { musculo: string; dias: number }[];
  avisos: { musculo: string; dias: number; texto: string }[];
  records: { ejercicio_id: number; nombre: string; mejor_peso: string; series: number }[];
  asistencia: { fue: number; falto: number };
}

interface FilaRanking { usuario_id: number; nombre: string; puntos: number; nivel: string }

export default function ProgresoScreen() {
  const { token, grupoId, usuario } = useSesion();
  const [datos, setDatos] = useState<Progreso | null>(null);
  const [ranking, setRanking] = useState<FilaRanking[] | null>(null);
  const [cargando, setCargando] = useState(false);

  const cargar = useCallback(async () => {
    if (!token) return;
    setCargando(true);
    try {
      setDatos(await api<Progreso>('progreso', {}, token));
      if (grupoId) {
        const rk = await api<{ activo: boolean; ranking: FilaRanking[] }>('ranking', { grupo_id: grupoId }, token);
        setRanking(rk.activo ? rk.ranking : null);
      }
    } catch {
    } finally {
      setCargando(false);
    }
  }, [token, grupoId]);

  useFocusEffect(useCallback(() => { cargar(); }, [cargar]));

  if (!datos) {
    return <ScrollView style={pantalla.scroll} contentContainerStyle={pantalla.contenido} />;
  }

  const { nivel } = datos;
  const color = NivelColor[nivel.nivel] ?? Colors.accent;
  const avance = nivel.siguiente ? nivel.puntos / (nivel.puntos + nivel.siguiente.faltan) : 1;

  return (
    <ScrollView
      style={pantalla.scroll}
      contentContainerStyle={pantalla.contenido}
      refreshControl={<RefreshControl refreshing={cargando} onRefresh={cargar} tintColor={Colors.accent} />}
    >
      <Card style={{ borderColor: color }}>
        <Etiqueta>{`Temporada ${nivel.temporada}`}</Etiqueta>
        <Text style={[styles.nivel, { color }]}>{nivel.nivel}</Text>
        <Texto>{`${nivel.puntos} puntos`}</Texto>
        <View style={styles.barra}>
          <View style={[styles.relleno, { width: `${Math.min(avance, 1) * 100}%`, backgroundColor: color }]} />
        </View>
        <Texto muted>
          {nivel.siguiente ? `Te faltan ${nivel.siguiente.faltan} para ${nivel.siguiente.nombre}` : 'Llegaste al nivel máximo'}
        </Texto>
      </Card>

      {datos.avisos.map(a => (
        <Card key={a.musculo} style={{ borderColor: Colors.warning, backgroundColor: Colors.warningBg }}>
          <Texto>{a.texto}. ¡Retomalo!</Texto>
        </Card>
      ))}

      {ranking && (
        <Card>
          <Titulo>Ranking del grupo</Titulo>
          {ranking.map((r, i) => (
            <View key={r.usuario_id} style={styles.filaRanking}>
              <Text style={[styles.textoFila, r.usuario_id === usuario?.id && { color: Colors.accent }]}>
                {`${i + 1}. ${r.nombre}`}
              </Text>
              <Text style={[styles.textoFila, { color: NivelColor[r.nivel] }]}>{`${r.puntos} · ${r.nivel}`}</Text>
            </View>
          ))}
        </Card>
      )}

      <Card>
        <Titulo>Asistencia</Titulo>
        <Texto>{`Fuiste ${datos.asistencia.fue} veces · faltaste ${datos.asistencia.falto}`}</Texto>
      </Card>

      <Card>
        <Titulo>Músculos</Titulo>
        {datos.musculos.length === 0 && <Texto muted>Todavía no registraste series.</Texto>}
        {datos.musculos.map(m => (
          <View key={m.musculo} style={styles.filaRanking}>
            <Text style={styles.textoFila}>{m.musculo}</Text>
            <Text style={[styles.textoFila, { color: Colors.textSecondary }]}>
              {m.dias === 0 ? 'hoy' : `hace ${m.dias} días`}
            </Text>
          </View>
        ))}
      </Card>

      {datos.records.length > 0 ? (
        <Card>
          <Titulo>Mejores marcas</Titulo>
          {datos.records.map(r => (
            <View key={r.ejercicio_id} style={styles.filaRanking}>
              <Text style={styles.textoFila}>{r.nombre}</Text>
              <Text style={[styles.textoFila, { color: Colors.accent }]}>{`${Number(r.mejor_peso)} kg`}</Text>
            </View>
          ))}
        </Card>
      ) : (
        <Vacio texto="Cuando registres series, acá vas a ver tus mejores marcas." />
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  nivel: { fontSize: 34, fontWeight: '800', marginVertical: Spacing.xs },
  barra: { height: 8, borderRadius: Radius.full, backgroundColor: Colors.bgMuted, marginVertical: Spacing.sm, overflow: 'hidden' },
  relleno: { height: 8, borderRadius: Radius.full },
  filaRanking: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  textoFila: { ...Typography.body, color: Colors.textPrimary },
});
