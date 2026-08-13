import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { theme } from '../ui/theme';
import { parseScannedCode } from './code';

/**
 * Escanear el código de empresa del cartel del taller.
 *
 * El código se puede tipear igual —esto es un atajo, no un requisito—: si la
 * cámara falla, se niega el permiso o el cartel está gastado, la pantalla de
 * atrás sigue funcionando. Por eso el escáner es un modal que se cierra y no un
 * paso obligatorio del alta.
 *
 * `parseScannedCode` filtra: la cámara lee todos los QR que se le crucen (wifi,
 * links) y sin ese filtro mandaríamos basura al server.
 */
export type QrScannerSheetProps = {
  visible: boolean;
  onClose: () => void;
  onCode: (code: string) => void;
};

export const QrScannerSheet = ({ visible, onClose, onCode }: QrScannerSheetProps) => {
  const [permission, requestPermission] = useCameraPermissions();
  // Un QR se lee decenas de veces por segundo: sin este cerrojo el `onCode`
  // dispara en bucle y la pantalla de atrás parpadea.
  const [yaLeido, setYaLeido] = useState(false);
  const [ajeno, setAjeno] = useState(false);

  useEffect(() => {
    if (!visible) {
      setYaLeido(false);
      setAjeno(false);
      return;
    }
    if (permission && !permission.granted && permission.canAskAgain) {
      void requestPermission();
    }
  }, [visible, permission, requestPermission]);

  const alLeer = (raw: string) => {
    if (yaLeido) return;
    const codigo = parseScannedCode(raw);
    if (!codigo) {
      setAjeno(true);
      return;
    }
    setYaLeido(true);
    onCode(codigo);
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} testID="modal-escaner">
      <View style={styles.container}>
        {permission?.granted ? (
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={({ data }) => alLeer(data)}
          />
        ) : (
          <View style={styles.centro}>
            <Text style={styles.titulo}>Necesitamos la cámara</Text>
            <Text style={styles.ayuda}>
              {permission?.canAskAgain === false
                ? 'Actívala desde los ajustes del teléfono, o escribe el código a mano.'
                : 'Dale permiso para leer el código del cartel.'}
            </Text>
          </View>
        )}

        <View pointerEvents="none" style={styles.marco} />

        <View style={styles.pie}>
          <Text style={styles.instruccion} testID="texto-escaner">
            {ajeno ? 'Ese QR no es de una empresa. Prueba con el del taller.' : 'Apunta al código de tu empresa'}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={onClose}
            style={styles.boton}
            testID="btn-cerrar-escaner"
          >
            <Text style={styles.botonTexto}>Escribirlo a mano</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: { backgroundColor: '#000', flex: 1 },
  centro: { alignItems: 'center', flex: 1, gap: 8, justifyContent: 'center', padding: 24 },
  titulo: { color: '#fff', fontSize: 20, fontWeight: '700' },
  ayuda: { color: 'rgba(255,255,255,0.75)', fontSize: 15, textAlign: 'center' },
  marco: {
    alignSelf: 'center',
    borderColor: theme.accent,
    borderRadius: 24,
    borderWidth: 3,
    height: 240,
    marginTop: '35%',
    width: 240,
  },
  pie: { bottom: 0, gap: 12, left: 0, padding: 24, position: 'absolute', right: 0 },
  instruccion: { color: '#fff', fontSize: 16, fontWeight: '600', textAlign: 'center' },
  // 64 px: se usa con una mano, a veces con guantes (mismo criterio que el alta).
  boton: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 16,
    justifyContent: 'center',
    minHeight: 64,
  },
  botonTexto: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
