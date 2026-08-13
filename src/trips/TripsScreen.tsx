import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  ApiError,
  advanceTrip,
  fetchPortal,
  postDriverAction,
  type PortalPayload,
} from '../api/client';
import { ChecklistSheet } from './ChecklistSheet';
import { PodSheet } from './PodSheet';
import { CyclesSheet } from './CyclesSheet';
import { IncidentSheet } from './IncidentSheet';
import { toPodPayload } from './pod';
import type { ChecklistAnswer } from './checklist';
import type { StoredCredential } from '../auth/credential';
import { theme } from '../ui/theme';
import { STATUS_LABEL, formatTripDate, resolveTripFocus, type PortalTrip } from './focus';
import { normalizePortalTrips } from './portalTrip';
import { formatEta, resolveLocationWarning, trackingStatusLabel, type TripTracking } from './tracking';
import { pendingLabel } from '../offline/queue';
import { useOfflineQueue } from '../offline/useOfflineQueue';
import * as Location from 'expo-location';
import { getCurrentFix } from '../tracking/service';
import { useTripTracking } from '../tracking/useTripTracking';

/**
 * Mis viajes (Timón · A2). **Solo lectura**: avanzar el viaje, el checklist y la
 * firma son A3.
 *
 * La pantalla responde primero «¿qué hago ahora?» — un viaje protagonista con su
 * ruta y su estado, y el resto como filas compactas. Es la misma jerarquía del
 * portal web rediseñado (W1), a propósito: el chofer que usa las dos no aprende
 * dos productos.
 */

const STATUS_TONE: Record<string, string> = {
  en_curso: theme.accent,
  completado: theme.success,
  programado: theme.textSecondary,
  cancelado: theme.textMuted,
};

const Badge = ({ status }: { status: PortalTrip['status'] }) => (
  <View style={[styles.badge, { borderColor: STATUS_TONE[status] ?? theme.border }]}>
    <Text style={[styles.badgeText, { color: STATUS_TONE[status] ?? theme.textSecondary }]}>
      {STATUS_LABEL[status]}
    </Text>
  </View>
);

export const TripsScreen = ({
  credential,
  onUnauthorized,
}: {
  credential: StoredCredential;
  /** El server dijo que este equipo ya no vale: la app tiene que rehacer el alta. */
  onUnauthorized: () => void;
}) => {
  const [payload, setPayload] = useState<PortalPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [checklistFor, setChecklistFor] = useState<PortalTrip | null>(null);
  const [podFor, setPodFor] = useState<PortalTrip | null>(null);
  /**
   * Confirmación de lo que acaba de pasar.
   *
   * Detectado en el emulador: al firmar la entrega el viaje deja de ser el
   * protagonista y cae a la lista colapsada — el chofer cierra la acción más
   * importante del día y la pantalla se le queda en blanco, sin decirle que
   * salió bien ni quién recibió. Un cambio de estado no es un aviso.
   */
  const [confirmacion, setConfirmacion] = useState<string | null>(null);
  const [cyclesFor, setCyclesFor] = useState<PortalTrip | null>(null);
  const [incidentFor, setIncidentFor] = useState<PortalTrip | null>(null);
  const [isSaving, setSaving] = useState(false);
  const { pending, submit, lastFailure, clearFailure } = useOfflineQueue(credential);
  const enCurso = (payload?.trips ?? []).find((trip) => trip.status === 'en_curso') ?? null;
  const seguimiento = (payload as { tracking?: TripTracking } | null)?.tracking ?? null;
  /**
   * Con «solo mientras uso la app» el rastreo se corta al bloquear la pantalla
   * y el chofer no se entera hasta que la oficina lo llama. Se consulta el
   * permiso REAL, no el que se pidió.
   */
  const [permisoFondo, setPermisoFondo] = useState(true);
  useEffect(() => {
    void Location.getBackgroundPermissionsAsync()
      .then((estado) => setPermisoFondo(estado.granted))
      .catch(() => setPermisoFondo(true));
  }, [payload]);

  const { isSharing, lastUploadError, hasUploaded } = useTripTracking({
    credential,
    activeTripId: enCurso?._id ?? null,
    isRunning: Boolean(enCurso),
  });

  const load = useCallback(async () => {
    try {
      setError(null);
      setPayload(await fetchPortal(credential));
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) {
        onUnauthorized();
        return;
      }
      setError(caught instanceof ApiError ? caught.message : 'No se pudieron cargar tus viajes.');
    } finally {
      setLoading(false);
    }
  }, [credential, onUnauthorized]);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * Avanza el viaje. Iniciar pasa SIEMPRE por el checklist: es la evidencia de
   * que alguien miró la unidad antes de salir, y saltearla desde la app haría
   * que el registro dijera algo que no ocurrió.
   */
  const avanzar = useCallback(
    async (
      trip: PortalTrip,
      extra?: { checklist?: ChecklistAnswer[]; pod?: ReturnType<typeof toPodPayload> }
    ) => {
      if (!trip.nextAction) return;
      if (trip.nextAction.toStatus === 'en_curso' && !extra?.checklist) {
        setChecklistFor(trip);
        return;
      }
      // Entregar SIEMPRE pasa por la firma: cerrar un viaje sin constancia
      // dejaría la entrega sin prueba, que es de lo que cuelga la facturación.
      if (trip.nextAction.toStatus === 'completado' && !extra?.pod) {
        setPodFor(trip);
        return;
      }
      setSaving(true);
      setError(null);

      // A5 §4.6: sin ubicación no arranca. Se exige un FIX real, no el permiso:
      // un teléfono con el GPS del sistema apagado tiene el permiso dado y no
      // da posición. El server aplica la misma regla — acá solo se le evita al
      // chofer un viaje al server para que le digan que no.
      let startLocation: { lat: number; lng: number; at: string; accuracyM?: number } | undefined;
      if (trip.nextAction.toStatus === 'en_curso') {
        const fix = await getCurrentFix();
        if (!fix) {
          setError('Prende la ubicación para iniciar el viaje.');
          setChecklistFor(null);
          setSaving(false);
          return;
        }
        startLocation = {
          lat: fix.lat,
          lng: fix.lng,
          at: fix.at,
          ...(typeof fix.accuracyM === 'number' ? { accuracyM: fix.accuracyM } : {}),
        };
      }

      const exito = extra?.pod ? `Entregado a ${extra.pod.receiverName}` : 'Viaje iniciado';
      const resultado = await submit({
        id: `avance-${trip._id}-${trip.nextAction.toStatus}`,
        stream: trip._id,
        label: exito,
        // El 409 de un avance NO es éxito: trae el motivo del bloqueo
        // (documento vencido, hallazgo crítico) y el chofer tiene que leerlo.
        successOn409: false,
        body: {
          tripId: trip._id,
          toStatus: trip.nextAction.toStatus,
          ...(extra?.checklist ? { checklist: extra.checklist } : {}),
          ...(extra?.pod ? { pod: extra.pod } : {}),
          ...(startLocation ? { startLocation } : {}),
        },
      });
      setChecklistFor(null);
      setPodFor(null);
      if (resultado.outcome === 'failed') setError(resultado.message);
      else setConfirmacion(resultado.message);
      if (resultado.outcome === 'ok') await load();
      setSaving(false);
    },
    [credential, load]
  );

  /**
   * Vueltas y reportes: mismo endpoint y misma cola. Acá el 409 SÍ es éxito —
   * significa que el hecho ya estaba registrado, que es lo que se buscaba.
   */
  const enviar = useCallback(
    async (id: string, stream: string, body: Record<string, unknown>, exito: string) => {
      setSaving(true);
      setError(null);
      const resultado = await submit({ id, stream, body, label: exito });
      setCyclesFor(null);
      setIncidentFor(null);
      if (resultado.outcome === 'failed') setError(resultado.message);
      else setConfirmacion(resultado.message);
      if (resultado.outcome === 'ok') await load();
      setSaving(false);
    },
    [load, submit]
  );

  // Primera carga: se muestra el indicador. En las siguientes NO se borra lo que
  // ya está en pantalla — parpadear la lista en cada refresco es peor que
  // esperar un segundo con la lista vieja.
  if (isLoading && !payload) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={theme.accent} />
      </View>
    );
  }

  const { active, rest } = resolveTripFocus(normalizePortalTrips(payload?.trips));

  return (
    <ScrollView
      style={styles.fill}
      contentContainerStyle={styles.page}
      refreshControl={
        <RefreshControl refreshing={isLoading} onRefresh={load} tintColor={theme.accent} />
      }
    >
      <Text style={styles.hello}>Hola, {payload?.driverName ?? 'conductor'}</Text>
      {/* El logo de la empresa: el chofer tiene que ver DÓNDE trabaja al abrir
          la app, no solo el nombre. Si no carga, queda el texto — nunca un
          hueco ni un ícono roto. */}
      <View style={styles.companyRow}>
        {payload?.companyLogoUrl ? (
          <Image
            source={{ uri: payload.companyLogoUrl }}
            style={styles.companyLogo}
            resizeMode="contain"
            accessibilityLabel={payload?.companyName ?? 'Empresa'}
          />
        ) : null}
        <Text style={styles.company}>{payload?.companyName ?? ''}</Text>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {/* §4.2: mientras se rastrea, se DICE. Un rastreo que el chofer no ve es
          el que termina con la app desinstalada.

          S4: y además se le dice si de verdad ESTÁ LLEGANDO. Compartir y que la
          oficina no lo vea son dos cosas distintas, y hasta acá el chofer no
          tenía forma de notar la diferencia. */}
      {resolveLocationWarning({ tripEnCurso: isSharing, backgroundGranted: permisoFondo }) ? (
        <Pressable
          style={styles.avisoPermiso}
          onPress={() => void Linking.openSettings()}
          testID="aviso-permiso-ubicacion"
        >
          <Text style={styles.avisoPermisoTexto}>
            {resolveLocationWarning({ tripEnCurso: isSharing, backgroundGranted: permisoFondo })}
          </Text>
          <Text style={styles.avisoPermisoAccion}>Abrir Ajustes</Text>
        </Pressable>
      ) : null}

      {isSharing ? (
        <View style={styles.rastreo} testID="rastreo-activo">
          <Text style={styles.rastreoTitulo}>
            {trackingStatusLabel(seguimiento, hasUploaded) ?? 'Compartiendo tu ubicación'}
          </Text>
          <Text style={styles.rastreoDetalle}>
            {formatEta(seguimiento?.etaAt)
              ? `Llegada estimada ${formatEta(seguimiento?.etaAt)} · se apaga al entregar`
              : 'Se apaga al entregar'}
          </Text>
        </View>
      ) : null}

      {/* Lo pendiente se DICE. Un tap que quedó guardado y una pantalla muda
          se leen igual que un tap perdido, y el chofer vuelve a tocar. */}
      {pendingLabel(pending.length) ? (
        <Text style={styles.pendiente} testID="cola-pendiente">
          {pendingLabel(pending.length)} · se envía solo al volver la señal
        </Text>
      ) : null}

      {/* El server lo rechazó mientras nadie miraba: se entera al abrir. */}
      {lastFailure ? (
        <Pressable onPress={clearFailure} testID="cola-rechazo">
          <Text style={styles.error}>{lastFailure}</Text>
        </Pressable>
      ) : null}

      {confirmacion ? (
        <Pressable onPress={() => setConfirmacion(null)} testID="confirmacion">
          <Text style={styles.ok}>{confirmacion}</Text>
        </Pressable>
      ) : null}

      {!active && rest.length === 0 && !error ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>Hoy no tienes viajes asignados.</Text>
        </View>
      ) : null}

      {active ? (
        <View style={styles.hero}>
          <View style={styles.heroBar} />
          <View style={styles.heroBody}>
            <Text style={styles.kicker}>
              {active.status === 'en_curso' ? 'TU VIAJE AHORA' : 'TU PRÓXIMO VIAJE'}
            </Text>
            <Text style={styles.route}>
              {active.origin} → {active.destination}
            </Text>
            <Text style={styles.meta}>
              {[formatTripDate(active.date), active.plate, active.cargo].filter(Boolean).join(' · ')}
            </Text>
            <View style={styles.badgeRow}>
              <Badge status={active.status} />
              {active.stopProgress ? (
                <Text style={styles.meta}>
                  Entregas {active.stopProgress.signed} de {active.stopProgress.total}
                </Text>
              ) : null}
            </View>
            {active.pod ? (
              <Text style={styles.delivered}>Entregado a {active.pod.receiverName}</Text>
            ) : null}
            {/* Jornada por vueltas: el tap de la vuelta ES la acción del viaje
                mientras está en curso, no «avanzar el estado». */}
            {active.mode === 'cycles' && active.status === 'en_curso' ? (
              <Pressable
                testID="abrir-vueltas"
                style={styles.action}
                onPress={() => setCyclesFor(active)}
                accessibilityRole="button"
              >
                <Text style={styles.actionText}>
                  Registrar vuelta · {active.cycleCount ?? 0}
                </Text>
              </Pressable>
            ) : null}

            {active.status === 'en_curso' ? (
              <Pressable
                testID="abrir-incidente"
                style={styles.secondary}
                onPress={() => setIncidentFor(active)}
                accessibilityRole="button"
              >
                <Text style={styles.secondaryText}>Reportar un problema</Text>
              </Pressable>
            ) : null}

            {active.nextAction ? (
              <Pressable
                testID="accion-viaje"
                style={[styles.action, isSaving && styles.actionOff]}
                disabled={isSaving}
                onPress={() => void avanzar(active)}
                accessibilityRole="button"
              >
                <Text style={styles.actionText}>
                  {isSaving ? 'Guardando…' : active.nextAction.label}
                </Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      ) : null}

      {rest.length > 0 ? (
        <>
          <Text style={styles.section}>{active ? 'TUS OTROS VIAJES' : 'TUS VIAJES'}</Text>
          {rest.map((trip) => {
            const isOpen = openId === trip._id;
            return (
              <Pressable
                key={trip._id}
                style={styles.row}
                onPress={() => setOpenId(isOpen ? null : trip._id)}
                accessibilityRole="button"
              >
                <View style={styles.rowHead}>
                  <View style={styles.rowMain}>
                    <Text style={styles.rowRoute} numberOfLines={1}>
                      {trip.origin} → {trip.destination}
                    </Text>
                    <Text style={styles.meta} numberOfLines={1}>
                      {[formatTripDate(trip.date), trip.plate].filter(Boolean).join(' · ')}
                    </Text>
                  </View>
                  <Badge status={trip.status} />
                </View>
                {isOpen ? (
                  <View style={styles.rowDetail}>
                    {trip.cargo ? <Text style={styles.meta}>Carga: {trip.cargo}</Text> : null}
                    {trip.pod ? (
                      <Text style={styles.delivered}>Entregado a {trip.pod.receiverName}</Text>
                    ) : null}
                    {trip.stops?.map((stop, index) => (
                      <Text key={`${stop.name}-${index}`} style={styles.meta}>
                        {stop.signed ? '✓' : '○'} {stop.name}
                        {stop.receiverName ? ` · firmó ${stop.receiverName}` : ''}
                      </Text>
                    ))}
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </>
      ) : null}
      <ChecklistSheet
        visible={checklistFor !== null}
        items={payload?.checklist ?? []}
        isBusy={isSaving}
        onCancel={() => setChecklistFor(null)}
        onConfirm={(answers) => {
          if (checklistFor) void avanzar(checklistFor, { checklist: answers });
        }}
      />

      <CyclesSheet
        visible={cyclesFor !== null}
        tripId={cyclesFor?._id ?? ''}
        routeLabel={cyclesFor ? `${cyclesFor.origin} → ${cyclesFor.destination}` : ''}
        count={cyclesFor?.cycleCount ?? 0}
        m3PerCycle={cyclesFor?.m3PerCycle}
        isBusy={isSaving}
        onCancel={() => setCyclesFor(null)}
        onRegister={(cycle) => {
          if (cyclesFor) {
            // El `clientKey` del tap es la identidad de la vuelta en la cola:
            // reenviarla no puede sumar una vuelta más.
            void enviar(
              String(cycle.clientKey),
              cyclesFor._id,
              { tripId: cyclesFor._id, cycle },
              'Vuelta registrada'
            );
          }
        }}
      />

      <IncidentSheet
        visible={incidentFor !== null}
        routeLabel={incidentFor ? `${incidentFor.origin} → ${incidentFor.destination}` : ''}
        isBusy={isSaving}
        onCancel={() => setIncidentFor(null)}
        onConfirm={(report) => {
          if (incidentFor) {
            void enviar(
              `incidente-${incidentFor._id}-${report.incidentKind}`,
              incidentFor._id,
              { tripId: incidentFor._id, report },
              'Reporte enviado'
            );
          }
        }}
      />

      <PodSheet
        visible={podFor !== null}
        routeLabel={podFor ? `${podFor.origin} → ${podFor.destination}` : ''}
        isBusy={isSaving}
        onCancel={() => setPodFor(null)}
        onConfirm={(pod) => {
          if (podFor) void avanzar(podFor, { pod });
        }}
      />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: theme.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.background },
  page: { padding: 20, gap: 12, paddingBottom: 40 },
  hello: { fontSize: 26, fontWeight: '700', color: theme.text },
  company: { fontSize: 15, color: theme.textSecondary },
  // Ámbar: es una advertencia, no un error — la app sigue funcionando.
  avisoPermiso: {
    backgroundColor: 'rgba(245,158,11,0.12)',
    borderColor: 'rgba(245,158,11,0.5)',
    borderRadius: 14,
    borderWidth: 1,
    gap: 6,
    marginBottom: 12,
    padding: 14,
  },
  avisoPermisoTexto: { color: theme.text, fontSize: 14, lineHeight: 20 },
  avisoPermisoAccion: { color: theme.accent, fontSize: 15, fontWeight: '700' },
  companyRow: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  companyLogo: { height: 28, width: 28 },
  rastreo: {
    backgroundColor: theme.surface,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 4,
  },
  rastreoTitulo: { fontSize: 15, fontWeight: '600', color: theme.accent },
  rastreoDetalle: { fontSize: 14, color: theme.textSecondary },
  pendiente: {
    fontSize: 15,
    color: theme.textSecondary,
    backgroundColor: theme.surface,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  error: { fontSize: 15, color: theme.danger, lineHeight: 22 },
  ok: { fontSize: 16, color: theme.success, fontWeight: '600', lineHeight: 24 },
  empty: { padding: 32, alignItems: 'center' },
  emptyText: { fontSize: 16, color: theme.textSecondary, textAlign: 'center' },
  hero: {
    flexDirection: 'row',
    backgroundColor: theme.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.border,
    overflow: 'hidden',
  },
  heroBar: { width: 5, backgroundColor: theme.accent },
  heroBody: { flex: 1, padding: 16, gap: 6 },
  kicker: { fontSize: 12, fontWeight: '700', letterSpacing: 1, color: theme.accent },
  route: { fontSize: 22, fontWeight: '700', color: theme.text },
  meta: { fontSize: 15, color: theme.textSecondary },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 2 },
  badge: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { fontSize: 13, fontWeight: '600' },
  delivered: { fontSize: 15, color: theme.success, fontWeight: '600' },
  pending: { fontSize: 15, color: theme.textSecondary, fontStyle: 'italic' },
  section: { fontSize: 12, fontWeight: '700', letterSpacing: 1, color: theme.textMuted, marginTop: 8 },
  // 72 de alto: una fila que se toca con una mano, en movimiento.
  row: {
    minHeight: 72,
    backgroundColor: theme.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.border,
    padding: 14,
    gap: 8,
  },
  rowHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rowMain: { flex: 1, gap: 2 },
  rowRoute: { fontSize: 16, fontWeight: '600', color: theme.text },
  rowDetail: { gap: 4, borderTopWidth: 1, borderTopColor: theme.border, paddingTop: 10 },
  // La acción del viaje: 64 de alto y ancho completo. Es LO que vino a hacer.
  action: {
    minHeight: 64,
    borderRadius: 14,
    backgroundColor: theme.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
  },
  actionOff: { backgroundColor: theme.border },
  actionText: { fontSize: 18, fontWeight: '600', color: theme.onAccent },
  // Secundaria: el siniestro se reporta rápido, pero no compite con la acción
  // del viaje. Borde en vez de relleno.
  secondary: {
    minHeight: 56,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.danger,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
  },
  secondaryText: { fontSize: 16, fontWeight: '600', color: theme.danger },
});
