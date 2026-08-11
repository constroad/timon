import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ApiError, fetchAttendanceToday, type AttendanceToday } from '../api/client';
import type { StoredCredential } from '../auth/credential';
import { useOfflineQueue } from '../offline/useOfflineQueue';
import { getCurrentFix } from '../tracking/service';
import { theme } from '../ui/theme';

/**
 * Registro de asistencia (Timón · A6).
 *
 * Una pantalla, un botón, y el botón dice lo que el SERVER permite ahora —
 * «Marcar entrada» o «Marcar salida»—, nunca un texto fijo del cliente. Si la
 * app decidiera por su cuenta qué marca toca, terminaría discrepando con el
 * fichador web y alguien perdería una jornada.
 *
 * Lo que NO hace, que es la funcionalidad: **no bloquea**. Ni por foto, ni por
 * geocerca, ni por falta de GPS. Costó dos días de fichaje perdido aprender que
 * nada puede impedir que una persona registre que trabajó; la ubicación se
 * adjunta si está, y si no está la marca sale igual.
 */

export const AttendanceScreen = ({ credential }: { credential: StoredCredential }) => {
  const [hoy, setHoy] = useState<AttendanceToday | null>(null);
  const [isLoading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmacion, setConfirmacion] = useState<string | null>(null);
  const [isSaving, setSaving] = useState(false);
  const { submit } = useOfflineQueue(credential);

  const load = useCallback(async () => {
    try {
      setError(null);
      setHoy(await fetchAttendanceToday(credential));
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'No se pudo cargar tu asistencia.');
    } finally {
      setLoading(false);
    }
  }, [credential]);

  useEffect(() => {
    void load();
  }, [load]);

  const marcar = async () => {
    if (!hoy?.nextAction || hoy.nextAction === 'closed') return;
    setSaving(true);
    setError(null);

    // La ubicación se ADJUNTA, no se exige: si el GPS no da fix, la marca sale
    // igual. Es la diferencia con el bloqueo de arranque de viaje, donde sí es
    // condición — acá lo que está en juego es que alguien cobre su día.
    const fix = await getCurrentFix();
    const at = new Date().toISOString();
    const resultado = await submit({
      // La hora del HECHO es la identidad de la marca: reenviarla no puede
      // crear una segunda entrada.
      id: `asistencia-${hoy.nextAction}-${at.slice(0, 16)}`,
      stream: 'asistencia',
      target: 'attendance',
      label: hoy.nextAction === 'entry' ? 'Entrada registrada' : 'Salida registrada',
      body: {
        action: hoy.nextAction,
        at,
        // La precisión viaja con el punto: sin ella el server no puede
        // descartar el error del GPS y, ante la duda, no acusa a nadie de estar
        // fuera de zona (S7).
        ...(fix
          ? {
              location: {
                lat: fix.lat,
                lng: fix.lng,
                ...(typeof fix.accuracyM === 'number' ? { accuracyM: fix.accuracyM } : {}),
              },
            }
          : {}),
      },
    });
    if (resultado.outcome === 'failed') setError(resultado.message);
    else setConfirmacion(resultado.message);
    if (resultado.outcome === 'ok') await load();
    setSaving(false);
  };

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={theme.accent} />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.fill}
      contentContainerStyle={styles.page}
      refreshControl={<RefreshControl refreshing={false} onRefresh={() => void load()} />}
    >
      <Text style={styles.title}>Tu asistencia de hoy</Text>

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {confirmacion ? (
        <Pressable onPress={() => setConfirmacion(null)} testID="asistencia-confirmacion">
          <Text style={styles.ok}>{confirmacion}</Text>
        </Pressable>
      ) : null}

      {/* S2: la mayoría de los choferes todavía no tiene ficha de empleado. Se
          dice con todas las letras en vez de un botón que falla sin explicar. */}
      {hoy && !hoy.linked ? (
        <View style={styles.card}>
          <Text style={styles.status} testID="asistencia-sin-enlace">
            {hoy.message ?? 'Tu usuario todavía no está enlazado a tu ficha de empleado.'}
          </Text>
        </View>
      ) : null}

      {hoy?.linked ? (
        <View style={styles.card}>
          <Text style={styles.status} testID="asistencia-estado">
            {hoy.statusLabel}
          </Text>
          <View style={styles.horas}>
            <Marca titulo="Entrada" hora={hoy.startTime} />
            <Marca titulo="Salida" hora={hoy.endTime} />
          </View>
        </View>
      ) : null}

      {hoy?.linked && hoy.actionLabel ? (
        <Pressable
          testID="asistencia-marcar"
          style={[styles.primary, isSaving && styles.primaryOff]}
          disabled={isSaving}
          onPress={() => void marcar()}
        >
          <Text style={styles.primaryText}>{isSaving ? 'Registrando…' : hoy.actionLabel}</Text>
        </Pressable>
      ) : null}
    </ScrollView>
  );
};

/** Una hora firmada. El guion largo dice «todavía no», no «cero». */
const Marca = ({ titulo, hora }: { titulo: string; hora?: string }) => (
  <View style={styles.marca}>
    <Text style={styles.marcaTitulo}>{titulo}</Text>
    <Text style={styles.marcaHora}>{hora?.trim() ? hora : '—'}</Text>
  </View>
);

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: theme.background },
  page: { padding: 20, gap: 16 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.background },
  title: { fontSize: 26, fontWeight: '700', color: theme.text },
  card: {
    backgroundColor: theme.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.border,
    padding: 20,
    gap: 16,
  },
  status: { fontSize: 18, fontWeight: '600', color: theme.text },
  horas: { flexDirection: 'row', gap: 16 },
  marca: { flex: 1 },
  marcaTitulo: { fontSize: 14, color: theme.textSecondary },
  // La hora es lo que el chofer viene a ver: grande y sin competencia.
  marcaHora: { fontSize: 32, fontWeight: '700', color: theme.text },
  // 72: se toca con guantes y de madrugada.
  primary: {
    minHeight: 72,
    borderRadius: 14,
    backgroundColor: theme.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryOff: { backgroundColor: theme.border },
  primaryText: { fontSize: 20, fontWeight: '700', color: theme.onAccent },
  error: { fontSize: 15, color: theme.danger },
  ok: { fontSize: 15, color: theme.accent, fontWeight: '600' },
});
