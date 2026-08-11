import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { theme } from '../ui/theme';
import {
  INCIDENT_KINDS,
  INCIDENT_LABELS,
  canSubmitIncident,
  emptyIncident,
  toIncidentPayload,
  type IncidentDraft,
  type IncidentKind,
} from './incident';

/**
 * Reportar un siniestro (Timón · A3).
 *
 * Lo usa alguien que acaba de chocar o al que le acaban de robar la carga. Todo
 * acá está pensado para eso: **elegir el tipo con un toque**, describir en una
 * línea y mandar. El lugar es opcional — quien volcó no sabe el kilómetro, y
 * exigírselo lo dejaría sin poder avisar.
 *
 * Nada de confirmaciones ni de «¿estás seguro?»: si tocó reportar un choque, es
 * porque hubo un choque.
 */

export const IncidentSheet = ({
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
  onConfirm: (report: ReturnType<typeof toIncidentPayload>) => void;
}) => {
  const [draft, setDraft] = useState<IncidentDraft>(emptyIncident);
  const listo = canSubmitIncident(draft);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onCancel}>
      <ScrollView style={styles.fill} contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>¿Qué pasó?</Text>
        <Text style={styles.help}>{routeLabel}</Text>

        <View style={styles.grid}>
          {INCIDENT_KINDS.map((kind: IncidentKind) => (
            <Pressable
              key={kind}
              testID={`incidente-${kind}`}
              accessibilityLabel={INCIDENT_LABELS[kind]}
              style={[styles.kind, draft.kind === kind && styles.kindOn]}
              onPress={() => setDraft((current) => ({ ...current, kind }))}
            >
              <Text style={[styles.kindText, draft.kind === kind && styles.kindTextOn]}>
                {INCIDENT_LABELS[kind]}
              </Text>
            </Pressable>
          ))}
        </View>

        <TextInput
          style={[styles.input, styles.multiline]}
          value={draft.description}
          onChangeText={(value) => setDraft((current) => ({ ...current, description: value }))}
          placeholder="Cuenta en una línea qué pasó"
          placeholderTextColor={theme.textMuted}
          multiline
          accessibilityLabel="Qué pasó"
          testID="incidente-descripcion"
        />
        <TextInput
          style={styles.input}
          value={draft.place}
          onChangeText={(value) => setDraft((current) => ({ ...current, place: value }))}
          placeholder="Dónde (opcional)"
          placeholderTextColor={theme.textMuted}
          accessibilityLabel="Dónde pasó"
          testID="incidente-lugar"
        />

        <Pressable
          testID="incidente-enviar"
          style={[styles.primary, (!listo || isBusy) && styles.primaryOff]}
          disabled={!listo || isBusy}
          onPress={() => onConfirm(toIncidentPayload(draft))}
        >
          <Text style={styles.primaryText}>{isBusy ? 'Enviando…' : 'Enviar reporte'}</Text>
        </Pressable>
        <Pressable style={styles.cancel} onPress={onCancel} testID="incidente-cancelar">
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
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  // Mitad y mitad, 72 de alto: se elige de un toque y sin apuntar.
  kind: {
    width: '47%',
    minHeight: 72,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kindOn: { backgroundColor: theme.danger, borderColor: theme.danger },
  kindText: { fontSize: 16, fontWeight: '600', color: theme.text, textAlign: 'center' },
  kindTextOn: { color: '#FFFFFF' },
  input: {
    minHeight: 56,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingTop: 14,
    fontSize: 18,
    color: theme.text,
    backgroundColor: theme.surface,
  },
  multiline: { minHeight: 96, textAlignVertical: 'top' },
  primary: {
    minHeight: 64,
    borderRadius: 14,
    backgroundColor: theme.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryOff: { backgroundColor: theme.border },
  primaryText: { fontSize: 18, fontWeight: '600', color: '#FFFFFF' },
  cancel: { minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  cancelText: { fontSize: 16, color: theme.textSecondary },
});
