import { useRef, useState } from 'react';
import {
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { captureRef } from 'react-native-view-shot';
import { theme } from '../ui/theme';
import {
  POD_PROBLEM_TEXT,
  canSubmitPod,
  emptyPod,
  hasRealSignature,
  podProblems,
  strokesToPath,
  toPodPayload,
  type PodDraft,
  type Stroke,
} from './pod';

/**
 * Constancia de entrega (Timón · A3).
 *
 * El receptor firma con el dedo en el teléfono del chofer. Tres decisiones que
 * no son de estilo:
 *
 * 1. **El área de firma es grande** (40% de la pantalla). Una firma en un
 *    recuadro chico sale ilegible y no sirve como prueba de nada.
 * 2. **El trazo se captura como PNG**, no como coordenadas: es lo que el server
 *    guarda y lo que se imprime en el PDF de la constancia.
 * 3. **Un toque suelto no es una firma.** Sin ese piso, un roce cerraría la
 *    entrega con una constancia vacía de contenido y llena de consecuencias.
 */

export const PodSheet = ({
  visible,
  routeLabel,
  isBusy,
  onCancel,
  onConfirm,
}: {
  visible: boolean;
  routeLabel: string;
  isBusy: boolean;
  onCancel: () => void;
  onConfirm: (pod: ReturnType<typeof toPodPayload>) => void;
}) => {
  const [draft, setDraft] = useState<PodDraft>(emptyPod);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [capturing, setCapturing] = useState(false);
  const canvasRef = useRef<View>(null);
  const currentStroke = useRef<Stroke>([]);

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (event) => {
        currentStroke.current = [
          { x: event.nativeEvent.locationX, y: event.nativeEvent.locationY },
        ];
        setStrokes((current) => [...current, currentStroke.current]);
      },
      onPanResponderMove: (event) => {
        currentStroke.current = [
          ...currentStroke.current,
          { x: event.nativeEvent.locationX, y: event.nativeEvent.locationY },
        ];
        setStrokes((current) => [...current.slice(0, -1), currentStroke.current]);
      },
    })
  ).current;

  const limpiar = () => {
    setStrokes([]);
    currentStroke.current = [];
    setDraft((current) => ({ ...current, signatureDataUrl: '' }));
  };

  /**
   * Captura el trazo a PNG recién al confirmar, no en cada movimiento del dedo:
   * capturar la vista es caro y hacerlo mientras se firma da un trazo a tirones.
   */
  const confirmar = async () => {
    if (!hasRealSignature(strokes)) return;
    setCapturing(true);
    try {
      const base64 = await captureRef(canvasRef, { format: 'png', quality: 0.8, result: 'base64' });
      const pod = { ...draft, signatureDataUrl: `data:image/png;base64,${base64}` };
      if (!canSubmitPod(pod)) {
        setDraft(pod);
        return;
      }
      onConfirm(toPodPayload(pod));
    } finally {
      setCapturing(false);
    }
  };

  const firmado = hasRealSignature(strokes);
  const problemas = podProblems({ ...draft, signatureDataUrl: firmado ? 'ok' : '' });
  const listo = draft.receiverName.trim().length >= 3 && firmado;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onCancel}>
      <ScrollView style={styles.fill} contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Firma de quien recibe</Text>
        <Text style={styles.help}>{routeLabel}</Text>

        <TextInput
          style={styles.input}
          value={draft.receiverName}
          onChangeText={(value) => setDraft((current) => ({ ...current, receiverName: value }))}
          placeholder="Nombre de quien recibe"
          placeholderTextColor={theme.textMuted}
          accessibilityLabel="Nombre de quien recibe"
          testID="pod-nombre"
        />
        <TextInput
          style={styles.input}
          value={draft.receiverDni}
          onChangeText={(value) => setDraft((current) => ({ ...current, receiverDni: value }))}
          placeholder="DNI (opcional)"
          placeholderTextColor={theme.textMuted}
          keyboardType="number-pad"
          accessibilityLabel="DNI de quien recibe"
          testID="pod-dni"
        />

        <View
          ref={canvasRef}
          collapsable={false}
          style={styles.canvas}
          testID="pod-firma"
          {...pan.panHandlers}
        >
          <Svg style={StyleSheet.absoluteFill}>
            <Path
              d={strokesToPath(strokes)}
              stroke={theme.text}
              strokeWidth={3}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          </Svg>
          {!firmado ? <Text style={styles.canvasHint}>Firma aquí</Text> : null}
        </View>

        <Pressable style={styles.clear} onPress={limpiar} testID="pod-borrar">
          <Text style={styles.clearText}>Borrar firma</Text>
        </Pressable>

        {problemas.length > 0 ? (
          <Text style={styles.error}>{POD_PROBLEM_TEXT[problemas[0]]}</Text>
        ) : null}

        <Pressable
          testID="pod-guardar"
          style={[styles.primary, (!listo || isBusy || capturing) && styles.primaryOff]}
          disabled={!listo || isBusy || capturing}
          onPress={() => void confirmar()}
        >
          <Text style={styles.primaryText}>
            {isBusy || capturing ? 'Guardando…' : 'Guardar entrega'}
          </Text>
        </Pressable>
        <Pressable style={styles.cancel} onPress={onCancel} testID="pod-cancelar">
          <Text style={styles.cancelText}>Cancelar</Text>
        </Pressable>
      </ScrollView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: theme.background },
  page: { padding: 20, gap: 12 },
  title: { fontSize: 26, fontWeight: '700', color: theme.text },
  help: { fontSize: 16, color: theme.textSecondary },
  input: {
    minHeight: 56,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: 18,
    color: theme.text,
    backgroundColor: theme.surface,
  },
  // Grande a propósito: una firma en un recuadro chico sale ilegible y no
  // prueba nada.
  canvas: {
    height: 260,
    borderRadius: 14,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: theme.border,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  canvasHint: { fontSize: 18, color: theme.textMuted },
  clear: { minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  clearText: { fontSize: 16, color: theme.textSecondary },
  error: { fontSize: 15, color: theme.danger },
  primary: {
    minHeight: 64,
    borderRadius: 14,
    backgroundColor: theme.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryOff: { backgroundColor: theme.border },
  primaryText: { fontSize: 18, fontWeight: '600', color: theme.onAccent },
  cancel: { minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  cancelText: { fontSize: 16, color: theme.textSecondary },
});
