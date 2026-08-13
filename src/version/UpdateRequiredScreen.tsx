import { useRef, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
// API legacy: en expo-file-system 57 la nueva API (File/Directory) no expone
// descarga reanudable con progreso, que es justo lo que hace falta acá.
import * as FileSystem from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';
import { theme } from '../ui/theme';
import { apkFileName, downloadRatio, resolveInstallHint } from './updateDownload';
import type { VersionGate } from './gate';

/**
 * Actualizar SIN salir de la app (A7 §6-2).
 *
 * Antes el botón abría la URL en el navegador: el chofer salía de Timón, veía
 * una URL cruda de un host que no reconoce y tenía que encontrar el archivo en
 * el gestor de descargas. Ahora se baja acá —con barra, bytes y cancelar— y al
 * terminar se abre el instalador de Android.
 *
 * El enlace sigue a la vista y copiable: si el instalador no abre (Android pide
 * permiso para «apps desconocidas»), esa es la salida.
 */
export type UpdateRequiredScreenProps = {
  gate: VersionGate;
  /**
   * «Ahora no». Existe porque la alternativa real no es que el chofer
   * actualice: es que se quede sin poder trabajar en medio de un viaje. Se
   * vuelve a mostrar en cada arranque — saltar es por esta vez, no para
   * siempre.
   */
  onSkip?: () => void;
};

type Estado =
  | { fase: 'idle' }
  | { fase: 'descargando'; ratio: number | null; bytes: number; total: number }
  | { fase: 'listo'; uri: string }
  | { fase: 'error'; mensaje: string };

const mb = (bytes: number) => `${(bytes / 1048576).toFixed(1)} MB`;

export const UpdateRequiredScreen = ({ gate, onSkip }: UpdateRequiredScreenProps) => {
  const [estado, setEstado] = useState<Estado>({ fase: 'idle' });
  const descargaRef = useRef<FileSystem.DownloadResumable | null>(null);

  const instalar = async (uri: string) => {
    try {
      const contentUri = await FileSystem.getContentUriAsync(uri);
      await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
        data: contentUri,
        // FLAG_GRANT_READ_URI_PERMISSION: sin esto el instalador no puede leer
        // el archivo que le pasamos y falla sin decir por qué.
        flags: 1,
        type: 'application/vnd.android.package-archive',
      });
    } catch (error) {
      setEstado({ fase: 'error', mensaje: resolveInstallHint(error) });
    }
  };

  const descargar = async () => {
    if (!gate.downloadUrl) return;
    const destino = `${FileSystem.cacheDirectory}${apkFileName(gate.downloadUrl)}`;
    setEstado({ fase: 'descargando', ratio: null, bytes: 0, total: 0 });

    const descarga = FileSystem.createDownloadResumable(
      gate.downloadUrl,
      destino,
      {},
      (progreso) =>
        setEstado({
          fase: 'descargando',
          ratio: downloadRatio(progreso),
          bytes: progreso.totalBytesWritten,
          total: progreso.totalBytesExpectedToWrite,
        })
    );
    descargaRef.current = descarga;

    try {
      const resultado = await descarga.downloadAsync();
      if (!resultado?.uri) {
        // Cancelada: no es un error que haya que explicar.
        setEstado({ fase: 'idle' });
        return;
      }
      setEstado({ fase: 'listo', uri: resultado.uri });
      void instalar(resultado.uri);
    } catch {
      setEstado({
        fase: 'error',
        mensaje: 'No se pudo descargar. Revisa tu conexión e inténtalo de nuevo.',
      });
    } finally {
      descargaRef.current = null;
    }
  };

  const cancelar = async () => {
    await descargaRef.current?.cancelAsync().catch(() => undefined);
    descargaRef.current = null;
    setEstado({ fase: 'idle' });
  };

  const porcentaje =
    estado.fase === 'descargando' && estado.ratio != null ? Math.round(estado.ratio * 100) : null;

  return (
    <View style={styles.page}>
      <Text style={styles.title}>Actualiza Timón</Text>
      <Text style={styles.body}>{gate.message}</Text>

      {gate.downloadUrl ? (
        <>
          {estado.fase === 'descargando' ? (
            <View style={styles.progresoCaja} testID="actualizar-progreso">
              <View style={styles.progresoFila}>
                <Text style={styles.progresoTexto}>
                  {porcentaje != null ? `Descargando ${porcentaje}%` : 'Descargando…'}
                </Text>
                <Text style={styles.progresoBytes}>
                  {mb(estado.bytes)}
                  {estado.total > 0 ? ` de ${mb(estado.total)}` : ''}
                </Text>
              </View>
              <View style={styles.barra}>
                <View
                  style={[
                    styles.barraRelleno,
                    porcentaje != null ? { width: `${porcentaje}%` } : { width: '35%' },
                  ]}
                />
              </View>
              <Pressable onPress={() => void cancelar()} testID="actualizar-cancelar">
                <Text style={styles.cancelar}>Cancelar descarga</Text>
              </Pressable>
            </View>
          ) : estado.fase === 'listo' ? (
            <Pressable
              testID="actualizar-instalar"
              style={styles.primary}
              onPress={() => void instalar(estado.uri)}
            >
              <Text style={styles.primaryText}>Instalar la actualización</Text>
            </Pressable>
          ) : (
            <Pressable
              testID="actualizar-descargar"
              style={styles.primary}
              onPress={() => void descargar()}
            >
              <Text style={styles.primaryText}>Descargar la nueva versión</Text>
            </Pressable>
          )}

          {estado.fase === 'error' ? (
            <Text style={styles.error} testID="actualizar-error">
              {estado.mensaje}
            </Text>
          ) : null}

          {/* El enlace sigue a la vista: es la salida si el instalador no abre
              (Android puede pedir permiso para «apps desconocidas»). */}
          <Text style={styles.url} selectable testID="actualizar-url">
            {gate.downloadUrl}
          </Text>
          <Pressable onPress={() => void Linking.openURL(gate.downloadUrl as string)}>
            <Text style={styles.help}>Abrir el enlace en el navegador</Text>
          </Pressable>
        </>
      ) : (
        <Text style={styles.help} testID="actualizar-sin-enlace">
          Pídele la nueva versión a tu supervisor.
        </Text>
      )}

      {onSkip && estado.fase !== 'descargando' ? (
        <Pressable style={styles.skip} onPress={onSkip} testID="actualizar-skip">
          <Text style={styles.skipTexto}>Ahora no, seguir trabajando</Text>
        </Pressable>
      ) : null}

      {estado.fase === 'listo' ? <ActivityIndicator color={theme.accent} /> : null}
    </View>
  );
};

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: theme.background,
    padding: 24,
    gap: 16,
    justifyContent: 'center',
  },
  title: { fontSize: 30, fontWeight: '700', color: theme.text },
  body: { fontSize: 18, color: theme.textSecondary, lineHeight: 26 },
  help: { fontSize: 16, color: theme.textSecondary },
  error: { fontSize: 15, color: theme.danger, lineHeight: 22 },
  url: {
    fontSize: 14,
    color: theme.text,
    backgroundColor: theme.surface,
    borderRadius: 10,
    padding: 12,
    fontFamily: 'monospace',
  },
  primary: {
    minHeight: 64,
    borderRadius: 14,
    backgroundColor: theme.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: { fontSize: 18, fontWeight: '700', color: theme.onAccent },
  progresoCaja: {
    backgroundColor: theme.surface,
    borderRadius: 14,
    gap: 10,
    padding: 16,
  },
  progresoFila: { flexDirection: 'row', justifyContent: 'space-between' },
  progresoTexto: { color: theme.text, fontSize: 16, fontWeight: '700' },
  progresoBytes: { color: theme.textSecondary, fontSize: 14 },
  barra: { backgroundColor: theme.border, borderRadius: 4, height: 8, overflow: 'hidden' },
  barraRelleno: { backgroundColor: theme.accent, borderRadius: 4, height: '100%' },
  cancelar: { color: theme.danger, fontSize: 15, fontWeight: '700', paddingVertical: 8 },
  // Salida secundaria y sin color de acción: es «ahora no», no el camino feliz.
  skip: { alignItems: 'center', justifyContent: 'center', minHeight: 56 },
  skipTexto: { color: theme.textSecondary, fontSize: 16, fontWeight: '600' },
});
