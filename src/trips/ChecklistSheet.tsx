import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { theme } from '../ui/theme';
import {
  checklistProgress,
  failedItems,
  isChecklistComplete,
  toChecklistPayload,
  type AnswerMap,
  type ChecklistAnswer,
  type ChecklistItem,
} from './checklist';

/**
 * Checklist de pre-viaje (Timón · A3).
 *
 * Cada ítem tiene **dos botones grandes**, no un checkbox: se responde con el
 * pulgar, con una mano, a veces con guantes. Un checkbox de 20 px en una cabina
 * es una invitación a tocar el equivocado.
 *
 * Marcar «mal» abre la nota. No bloquea acá: quien decide si un desperfecto
 * impide la salida es el servidor, que conoce la configuración de la empresa.
 */

export const ChecklistSheet = ({
  visible,
  items,
  isBusy,
  onCancel,
  onConfirm,
}: {
  visible: boolean;
  items: ChecklistItem[];
  isBusy: boolean;
  onCancel: () => void;
  onConfirm: (answers: ChecklistAnswer[]) => void;
}) => {
  const [answers, setAnswers] = useState<AnswerMap>({});

  /**
   * El botón «atrás» de Android NO descarta el checklist si ya hay algo
   * respondido.
   *
   * Detectado en el emulador (A3): ocultar el teclado después de escribir una
   * nota manda la tecla atrás, el `Modal` la tomaba como «cerrar» y el chofer
   * perdía todo lo respondido sin tocar nada. En una cabina eso pasa todo el
   * tiempo. Para salir de verdad está «Cancelar», que es explícito.
   */
  const onAndroidBack = () => {
    if (Object.keys(answers).length === 0) onCancel();
  };

  const answer = (key: string, ok: boolean) =>
    setAnswers((current) => ({ ...current, [key]: { ...current[key], ok } }));
  const note = (key: string, value: string) =>
    setAnswers((current) => ({ ...current, [key]: { ok: current[key]?.ok ?? false, note: value } }));

  const progress = checklistProgress(items, answers);
  const failed = failedItems(items, answers);
  const complete = isChecklistComplete(items, answers);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onAndroidBack}>
      <View style={styles.fill}>
        <View style={styles.head}>
          <Text style={styles.title}>Antes de salir</Text>
          <Text style={styles.counter}>
            {progress.answered} de {progress.total}
          </Text>
        </View>

        <ScrollView contentContainerStyle={styles.list} keyboardShouldPersistTaps="handled">
          {items.map((item) => {
            const current = answers[item.key];
            return (
              <View key={item.key} style={styles.row}>
                <Text style={styles.label}>{item.label}</Text>
                <View style={styles.buttons}>
                  <Pressable
                    testID={`check-bien-${item.key}`}
                    accessibilityLabel={`${item.label}: bien`}
                    style={[styles.choice, current?.ok === true && styles.choiceOk]}
                    onPress={() => answer(item.key, true)}
                  >
                    <Text style={[styles.choiceText, current?.ok === true && styles.choiceTextOn]}>
                      Bien
                    </Text>
                  </Pressable>
                  <Pressable
                    testID={`check-mal-${item.key}`}
                    accessibilityLabel={`${item.label}: mal`}
                    style={[styles.choice, current?.ok === false && styles.choiceBad]}
                    onPress={() => answer(item.key, false)}
                  >
                    <Text style={[styles.choiceText, current?.ok === false && styles.choiceTextOn]}>
                      Mal
                    </Text>
                  </Pressable>
                </View>
                {current?.ok === false ? (
                  <TextInput
                    style={styles.note}
                    value={current.note ?? ''}
                    onChangeText={(value) => note(item.key, value)}
                    placeholder="¿Qué le pasa?"
                    placeholderTextColor={theme.textMuted}
                    testID={`check-nota-${item.key}`}
                  />
                ) : null}
              </View>
            );
          })}
        </ScrollView>

        <View style={styles.footer}>
          {failed.length > 0 ? (
            <Text style={styles.warn}>
              {failed.length === 1
                ? '1 punto en mal estado'
                : `${failed.length} puntos en mal estado`}
              : {failed.map((item) => item.label).join(', ')}
            </Text>
          ) : null}
          <Pressable
            testID="checklist-confirmar"
            style={[styles.primary, (!complete || isBusy) && styles.primaryOff]}
            disabled={!complete || isBusy}
            onPress={() => onConfirm(toChecklistPayload(items, answers))}
          >
            <Text style={styles.primaryText}>
              {isBusy ? 'Guardando…' : complete ? 'Terminar y salir' : `Faltan ${progress.pending}`}
            </Text>
          </Pressable>
          <Pressable style={styles.cancel} onPress={onCancel} testID="checklist-cancelar">
            <Text style={styles.cancelText}>Cancelar</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: theme.background },
  head: { padding: 20, paddingBottom: 8, flexDirection: 'row', justifyContent: 'space-between' },
  title: { fontSize: 26, fontWeight: '700', color: theme.text },
  counter: { fontSize: 16, color: theme.textSecondary, alignSelf: 'flex-end' },
  list: { padding: 20, paddingTop: 8, gap: 10 },
  row: {
    backgroundColor: theme.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.border,
    padding: 14,
    gap: 10,
  },
  label: { fontSize: 17, fontWeight: '600', color: theme.text },
  buttons: { flexDirection: 'row', gap: 10 },
  // 56 de alto y mitad y mitad: se responde con el pulgar, no con precisión.
  choice: {
    flex: 1,
    minHeight: 56,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  choiceOk: { backgroundColor: theme.success, borderColor: theme.success },
  choiceBad: { backgroundColor: theme.danger, borderColor: theme.danger },
  choiceText: { fontSize: 17, fontWeight: '600', color: theme.textSecondary },
  choiceTextOn: { color: '#FFFFFF' },
  note: {
    minHeight: 52,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 16,
    color: theme.text,
    backgroundColor: theme.background,
  },
  footer: { padding: 20, gap: 8, borderTopWidth: 1, borderTopColor: theme.border },
  warn: { fontSize: 15, color: theme.danger },
  primary: {
    minHeight: 64,
    borderRadius: 14,
    backgroundColor: theme.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Un deshabilitado con opacidad se pierde con sol: cambia el COLOR.
  primaryOff: { backgroundColor: theme.border },
  primaryText: { fontSize: 18, fontWeight: '600', color: theme.onAccent },
  cancel: { minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  cancelText: { fontSize: 16, color: theme.textSecondary },
});
