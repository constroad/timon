import { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import * as Crypto from 'expo-crypto';
import { theme } from '../ui/theme';
import {
  buildClientKey,
  canRegisterCycle,
  cyclesLabel,
  secondsUntilNextTap,
  toCyclePayload,
} from './cycles';

/**
 * Jornada por vueltas (Timón · A3).
 *
 * En un viaje por ciclos el chofer no «avanza el viaje»: da vueltas, y cada una
 * es plata. Por eso la pantalla es **un número enorme y un botón enorme** — se
 * toca sin mirar, con el camión moviéndose.
 *
 * El m³ se pre-llena con la tolva de la unidad: en el 90% de las vueltas es ese
 * y el chofer no tiene que teclear nada.
 */

export const CyclesSheet = ({
  visible,
  tripId,
  routeLabel,
  count,
  m3PerCycle,
  isBusy,
  onCancel,
  onRegister,
}: {
  visible: boolean;
  tripId: string;
  routeLabel: string;
  count: number;
  m3PerCycle?: number;
  isBusy: boolean;
  onCancel: () => void;
  onRegister: (cycle: ReturnType<typeof toCyclePayload>) => void;
}) => {
  const [m3, setM3] = useState('');
  const [note, setNote] = useState('');
  const [lastTapAt, setLastTapAt] = useState<number | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const tripKey = useRef(Crypto.randomUUID());

  /**
   * La hoja vive montada detrás de la pantalla, así que su estado nace ANTES de
   * que se sepa qué jornada se va a abrir: sin este efecto el m³ quedaba vacío
   * para siempre y la nota de una vuelta se arrastraba a la siguiente.
   */
  useEffect(() => {
    if (!visible) return;
    setM3(m3PerCycle ? String(m3PerCycle) : '');
    setNote('');
    setAviso(null);
  }, [visible, m3PerCycle]);

  const registrar = () => {
    const now = Date.now();
    if (!canRegisterCycle({ lastTapAt, now, isBusy })) {
      // Se explica POR QUÉ no contó. El server también lo filtra, pero desde
      // allá llegaría como un rechazo mudo y el chofer volvería a tocar.
      const faltan = secondsUntilNextTap(lastTapAt, now);
      setAviso(faltan > 0 ? `Espera ${faltan} s para la siguiente vuelta` : null);
      return;
    }
    setAviso(null);
    setLastTapAt(now);
    onRegister(toCyclePayload({ m3, note }, buildClientKey(tripId, now, tripKey.current)));
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onCancel}>
      <ScrollView style={styles.fill} contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
        <Text style={styles.help}>{routeLabel}</Text>

        <View style={styles.counter}>
          <Text style={styles.big} testID="vueltas-cuenta">
            {count}
          </Text>
          <Text style={styles.help}>{cyclesLabel(count)} en la jornada</Text>
        </View>

        <Text style={styles.label}>m³ por vuelta</Text>
        <TextInput
          style={styles.input}
          value={m3}
          onChangeText={setM3}
          keyboardType="decimal-pad"
          placeholder="8"
          placeholderTextColor={theme.textMuted}
          accessibilityLabel="Metros cúbicos de la vuelta"
          testID="vuelta-m3"
        />

        <TextInput
          style={styles.input}
          value={note}
          onChangeText={setNote}
          placeholder="Nota (opcional)"
          placeholderTextColor={theme.textMuted}
          accessibilityLabel="Nota de la vuelta"
          testID="vuelta-nota"
        />

        {aviso ? <Text style={styles.warn}>{aviso}</Text> : null}

        <Pressable
          testID="vuelta-registrar"
          style={[styles.primary, isBusy && styles.primaryOff]}
          disabled={isBusy}
          onPress={registrar}
        >
          <Text style={styles.primaryText}>{isBusy ? 'Guardando…' : 'Registrar vuelta'}</Text>
        </Pressable>
        <Pressable style={styles.cancel} onPress={onCancel} testID="vueltas-cerrar">
          <Text style={styles.cancelText}>Cerrar</Text>
        </Pressable>
      </ScrollView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: theme.background },
  page: { padding: 20, gap: 12 },
  help: { fontSize: 16, color: theme.textSecondary },
  counter: { alignItems: 'center', paddingVertical: 16 },
  // El número es lo primero que mira: enorme y sin competencia alrededor.
  big: { fontSize: 88, fontWeight: '700', color: theme.accent, lineHeight: 96 },
  label: { fontSize: 15, fontWeight: '600', color: theme.textSecondary },
  input: {
    minHeight: 56,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: 20,
    color: theme.text,
    backgroundColor: theme.surface,
  },
  warn: { fontSize: 15, color: theme.danger },
  // 72: se toca sin mirar, con el camión en movimiento.
  primary: {
    minHeight: 72,
    borderRadius: 14,
    backgroundColor: theme.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryOff: { backgroundColor: theme.border },
  primaryText: { fontSize: 20, fontWeight: '700', color: theme.onAccent },
  cancel: { minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  cancelText: { fontSize: 16, color: theme.textSecondary },
});
