import { useEffect, useState } from 'react';
import { Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import appConfig from '../../app.json';
import { fetchMinVersion } from '../api/client';
import { buildAboutRows, resolveUpdateState, type UpdateState } from './about';
import { theme } from './theme';

/**
 * Menú de la app (hamburguesa): navegación, «Acerca de» y desvincular.
 *
 * El «Acerca de» no es decorativo — responde la pregunta que se hace SIEMPRE
 * cuando algo falla en la calle: qué versión tiene ese teléfono y contra qué
 * servidor habla. Y trae el botón para buscar actualización, porque un APK
 * fuera de la tienda no se actualiza solo.
 */
export type AppMenuSheetProps = {
  visible: boolean;
  onClose: () => void;
  companyName?: string;
  driverName?: string;
  attendanceEnabled: boolean;
  onGoTrips: () => void;
  onGoAttendance: () => void;
  onLogout: () => void;
  /** Abre la pantalla de actualización con lo que diga el server. */
  onCheckUpdates: () => void;
};

const SERVER_URL = process.env.EXPO_PUBLIC_API_URL ?? 'https://www.constroad.com';

export const AppMenuSheet = ({
  visible,
  onClose,
  companyName,
  driverName,
  attendanceEnabled,
  onGoTrips,
  onGoAttendance,
  onLogout,
  onCheckUpdates,
}: AppMenuSheetProps) => {
  const [acercaDe, setAcercaDe] = useState(false);
  const [update, setUpdate] = useState<UpdateState | null>(null);
  const [downloadUrl, setDownloadUrl] = useState('');
  const [buscando, setBuscando] = useState(false);

  const version = appConfig.expo.version;
  const build = appConfig.expo.android.versionCode;

  useEffect(() => {
    if (!visible) {
      setAcercaDe(false);
      setUpdate(null);
    }
  }, [visible]);

  const buscarActualizacion = async () => {
    setBuscando(true);
    try {
      const { minVersion, downloadUrl: url } = await fetchMinVersion();
      setDownloadUrl(url);
      setUpdate(resolveUpdateState({ current: version, minimum: minVersion }));
    } catch {
      setUpdate({ outdated: false, message: 'No se pudo consultar al servidor.' });
    } finally {
      setBuscando(false);
    }
  };

  const ir = (accion: () => void) => {
    accion();
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.fondo} onPress={onClose} accessibilityLabel="Cerrar menú" />
      <View style={styles.hoja}>
        <View style={styles.manija} />
        <ScrollView>
          {!acercaDe ? (
            <>
              <Text style={styles.titulo}>{companyName ?? 'Timón'}</Text>
              {driverName ? <Text style={styles.sub}>{driverName}</Text> : null}

              <Opcion label="Mis viajes" onPress={() => ir(onGoTrips)} testID="menu-viajes" />
              {attendanceEnabled ? (
                <Opcion
                  label="Asistencia"
                  onPress={() => ir(onGoAttendance)}
                  testID="menu-asistencia"
                />
              ) : null}
              <Opcion
                label="Ver actualizaciones"
                onPress={() => ir(onCheckUpdates)}
                testID="menu-actualizaciones"
              />
              <Opcion
                label="Acerca de"
                onPress={() => {
                  setAcercaDe(true);
                  void buscarActualizacion();
                }}
                testID="menu-acerca-de"
              />
              {/* Destructivo y al final, separado: desvincular obliga a hacer el
                  alta de nuevo (código de empresa + WhatsApp). */}
              <Opcion label="Cerrar sesión" onPress={() => ir(onLogout)} destructivo testID="menu-salir" />
            </>
          ) : (
            <>
              <Text style={styles.titulo}>Acerca de</Text>
              {buildAboutRows({
                version,
                buildNumber: build,
                companyName,
                driverName,
                serverUrl: SERVER_URL,
              }).map((fila) => (
                <View key={fila.label} style={styles.fila}>
                  <Text style={styles.filaLabel}>{fila.label}</Text>
                  <Text style={styles.filaValor} numberOfLines={2}>
                    {fila.value}
                  </Text>
                </View>
              ))}

              <Text style={[styles.estado, update?.outdated ? styles.estadoAlerta : null]}>
                {buscando ? 'Consultando…' : (update?.message ?? '')}
              </Text>

              {update?.outdated && downloadUrl ? (
                <Pressable
                  accessibilityRole="button"
                  style={styles.botonPrimario}
                  onPress={() => void Linking.openURL(downloadUrl)}
                  testID="btn-descargar-actualizacion"
                >
                  <Text style={styles.botonPrimarioTexto}>Descargar la nueva versión</Text>
                </Pressable>
              ) : null}

              <Opcion label="Volver" onPress={() => setAcercaDe(false)} testID="menu-volver" />
            </>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
};

const Opcion = ({
  label,
  onPress,
  destructivo,
  testID,
}: {
  label: string;
  onPress: () => void;
  destructivo?: boolean;
  testID: string;
}) => (
  <Pressable accessibilityRole="button" onPress={onPress} style={styles.opcion} testID={testID}>
    <Text style={[styles.opcionTexto, destructivo ? styles.opcionDestructiva : null]}>{label}</Text>
  </Pressable>
);

const styles = StyleSheet.create({
  fondo: { backgroundColor: 'rgba(0,0,0,0.5)', flex: 1 },
  hoja: {
    backgroundColor: theme.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
    paddingBottom: 28,
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  manija: {
    alignSelf: 'center',
    backgroundColor: theme.border,
    borderRadius: 3,
    height: 5,
    marginBottom: 12,
    width: 44,
  },
  titulo: { color: theme.text, fontSize: 20, fontWeight: '700' },
  sub: { color: theme.textSecondary, fontSize: 14, marginTop: 2 },
  // 56 px: la app se usa con una mano y a veces con guantes.
  opcion: { borderTopColor: theme.border, borderTopWidth: 1, justifyContent: 'center', minHeight: 56 },
  opcionTexto: { color: theme.text, fontSize: 16, fontWeight: '600' },
  opcionDestructiva: { color: theme.danger },
  fila: { flexDirection: 'row', gap: 12, justifyContent: 'space-between', paddingVertical: 8 },
  filaLabel: { color: theme.textSecondary, fontSize: 14 },
  filaValor: { color: theme.text, flexShrink: 1, fontSize: 14, fontWeight: '600', textAlign: 'right' },
  estado: { color: theme.textSecondary, fontSize: 14, marginTop: 10 },
  estadoAlerta: { color: theme.accent, fontWeight: '700' },
  botonPrimario: {
    alignItems: 'center',
    backgroundColor: theme.accent,
    borderRadius: 14,
    justifyContent: 'center',
    marginTop: 12,
    minHeight: 56,
  },
  botonPrimarioTexto: { color: theme.onAccent, fontSize: 16, fontWeight: '700' },
});
