import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { checkSession, fetchMinVersion } from './src/api/client';
import { clearCredential, loadCredential, type StoredCredential } from './src/auth/credential';
import { OnboardingFlow } from './src/onboarding/OnboardingFlow';
import { TripsScreen } from './src/trips/TripsScreen';
import { AttendanceScreen } from './src/attendance/AttendanceScreen';
import { AppHeader } from './src/ui/AppHeader';
import { AppMenuSheet } from './src/ui/AppMenuSheet';
import { applyAccent, theme } from './src/ui/theme';
import { resolveVersionGate, type VersionGate } from './src/version/gate';
import { useVersionGate } from './src/version/useVersionGate';
import { UpdateRequiredScreen } from './src/version/UpdateRequiredScreen';
import appConfig from './app.json';

/**
 * Raíz de Timón (A1).
 *
 * Al abrir hay tres estados posibles y la app tiene que resolverlos ANTES de
 * mostrar nada: no hay credencial (alta), la hay y sigue viva (adentro), o la
 * hay y el server ya no la reconoce (se borra y vuelve al alta).
 *
 * Ese tercer caso es el que se olvida: quedarse con una credencial muerta deja
 * al chofer mirando una pantalla que falla sin explicar por qué.
 */

type Boot =
  | { phase: 'cargando' }
  | { phase: 'alta' }
  | {
      phase: 'adentro';
      credential: StoredCredential;
      attendance: boolean;
      companyName?: string;
      companyLogoUrl?: string;
      driverName?: string;
    }
  | { phase: 'actualizar'; gate: VersionGate };

export default function App() {
  const [boot, setBoot] = useState<Boot>({ phase: 'cargando' });
  /** Los dos menús del pedido. Arranca en viajes: es lo que se mira todo el día. */
  const [menu, setMenu] = useState<'viajes' | 'asistencia'>('viajes');
  const [menuAbierto, setMenuAbierto] = useState(false);
  /**
   * «Ahora no» de la pantalla de actualización. Vive en MEMORIA a propósito:
   * al volver a abrir la app la compuerta pregunta de nuevo. Saltar es por
   * esta vez —para no dejar a nadie tirado en medio de un viaje—, no para
   * siempre.
   */
  const saltoActualizacionRef = useRef(false);
  /**
   * S6: la compuerta sigue viva con la app abierta. El chofer no cierra Timón
   * en todo el turno, así que un contrato que cambia a media mañana tiene que
   * frenarlo ahí, no al día siguiente.
   */
  const gateVivo = useVersionGate(appConfig.expo.version);

  const resume = useCallback(async () => {
    // La compuerta de versión va PRIMERO, antes del alta y antes de la sesión:
    // una app que ya no habla el idioma del server no debería ni dejar escribir
    // el código de empresa (A7 §6-1).
    const { minVersion, downloadUrl } = await fetchMinVersion();
    const gate = resolveVersionGate({
      current: appConfig.expo.version,
      minimum: minVersion,
      downloadUrl,
    });
    // El salto vale para esta sesión: `resume` se llama de nuevo al reabrir la
    // app y ahí el ref vuelve a `false`, así que la compuerta pregunta otra vez.
    if (gate.blocked && !saltoActualizacionRef.current) {
      setBoot({ phase: 'actualizar', gate });
      return;
    }

    const credential = await loadCredential();
    if (!credential) {
      setBoot({ phase: 'alta' });
      return;
    }
    try {
      const session = await checkSession(credential);
      applyAccent(session.company.accentColor);
      setBoot({
        phase: 'adentro',
        credential,
        attendance: session.capabilities.attendance,
        // Para la cabecera: el chofer tiene que ver DÓNDE trabaja al abrir la app.
        companyName: session.company?.name,
        companyLogoUrl: session.company?.logoUrl ?? undefined,
        driverName: session.driver?.name,
      });
    } catch {
      // Revocado, chofer dado de baja o empresa desactivada: se borra el alta y
      // se empieza de nuevo, en vez de dejarlo con una llave que no abre.
      await clearCredential();
      setBoot({ phase: 'alta' });
    }
  }, []);

  useEffect(() => {
    void resume();
  }, [resume]);

  if (boot.phase === 'cargando') {
    return (
      <View style={styles.center}>
        <StatusBar style="auto" />
        <ActivityIndicator color={theme.accent} size="large" />
      </View>
    );
  }

  // El bloqueo gana sobre cualquier pantalla: si la versión ya no sirve, lo que
  // el chofer registre no va a llegar, y dejarlo trabajar es peor que frenarlo.
  // Va en dos ramas y no en una sola para no perder el estrechamiento de `boot`.
  if (gateVivo?.blocked) {
    return (
      <View style={styles.fill}>
        <StatusBar style="auto" />
        <UpdateRequiredScreen gate={gateVivo} />
      </View>
    );
  }

  if (boot.phase === 'actualizar') {
    return (
      <View style={styles.fill}>
        <StatusBar style="auto" />
        <UpdateRequiredScreen
          gate={boot.gate}
          onSkip={() => {
            saltoActualizacionRef.current = true;
            void resume();
          }}
        />
      </View>
    );
  }

  if (boot.phase === 'alta') {
    return (
      <View style={styles.fill}>
        <StatusBar style="auto" />
        <OnboardingFlow
          onDone={({ company }) => {
            applyAccent(company.accentColor);
            // Se re-resuelve desde el llavero en vez de armar el estado a mano:
            // así el camino de «recién dado de alta» y el de «abrió la app» son
            // EL MISMO, y no hay uno de los dos sin probar.
            void resume();
          }}
        />
      </View>
    );
  }

  const salir = () => {
    void clearCredential();
    setBoot({ phase: 'alta' });
  };

  return (
    <View style={styles.fill}>
      <StatusBar style="auto" />
      <AppHeader
        companyName={boot.companyName}
        companyLogoUrl={boot.companyLogoUrl}
        onOpenMenu={() => setMenuAbierto(true)}
      />
      <AppMenuSheet
        visible={menuAbierto}
        onClose={() => setMenuAbierto(false)}
        companyName={boot.companyName}
        driverName={boot.driverName}
        attendanceEnabled={boot.attendance}
        onGoTrips={() => setMenu('viajes')}
        onGoAttendance={() => setMenu('asistencia')}
        onLogout={salir}
        onCheckUpdates={() => {
          // Se vuelve a preguntar al server: si hay versión nueva, `resume`
          // lleva a la pantalla de actualización con su enlace.
          saltoActualizacionRef.current = false;
          void resume();
        }}
      />
      <View style={styles.fill}>
        {menu === 'asistencia' && boot.attendance ? (
          <AttendanceScreen credential={boot.credential} />
        ) : (
          <TripsScreen credential={boot.credential} onUnauthorized={salir} />
        )}
      </View>

      {/* Los DOS menús del pedido. Se muestra el de asistencia solo si la
          empresa lo tiene contratado: una pestaña que no lleva a nada es peor
          que no tenerla. */}
      {boot.attendance ? (
        <View style={styles.tabs}>
          <Tab
            testID="tab-viajes"
            label="Mis viajes"
            activo={menu === 'viajes'}
            onPress={() => setMenu('viajes')}
          />
          <Tab
            testID="tab-asistencia"
            label="Asistencia"
            activo={menu === 'asistencia'}
            onPress={() => setMenu('asistencia')}
          />
        </View>
      ) : null}
    </View>
  );
}

/** Pestaña de 64 px: se toca sin mirar, con el camión en marcha. */
const Tab = ({
  label,
  activo,
  onPress,
  testID,
}: {
  label: string;
  activo: boolean;
  onPress: () => void;
  testID: string;
}) => (
  <Pressable testID={testID} onPress={onPress} style={[styles.tab, activo && styles.tabOn]}>
    <Text style={[styles.tabText, activo && styles.tabTextOn]}>{label}</Text>
  </Pressable>
);

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: theme.background },
  tabs: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: theme.border,
    backgroundColor: theme.surface,
  },
  tab: { flex: 1, minHeight: 64, alignItems: 'center', justifyContent: 'center' },
  tabOn: { borderTopWidth: 3, borderTopColor: theme.accent },
  tabText: { fontSize: 16, color: theme.textSecondary },
  tabTextOn: { color: theme.accent, fontWeight: '700' },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 24,
    backgroundColor: theme.background,
  },
  hello: { fontSize: 32, fontWeight: '700', color: theme.text },
  company: { fontSize: 20, fontWeight: '600', color: theme.textSecondary },
  note: { fontSize: 15, color: theme.textMuted, textAlign: 'center' },
});
