import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { ApiError, requestOtp, resolveCompany, verifyOtp } from '../api/client';
import { deviceLabel, generateDeviceIdentity, saveCredential } from '../auth/credential';
import { theme } from '../ui/theme';
import { formatCode, isCompleteCode, shouldAutoSubmitOtp } from './code';
import { QrScannerSheet } from './QrScannerSheet';
import {
  canSubmit,
  initialOnboardingState,
  onboardingReducer,
  shouldOfferNewCode,
  type OnboardingCompany,
} from './machine';

/**
 * Alta del chofer (Timón · A1): código de empresa → confirmar → teléfono →
 * código de 6 dígitos → «Hola, Wilder».
 *
 * La lógica vive en `machine.ts`; acá solo se dibuja y se avisa lo que pasó.
 *
 * Decisiones de la pantalla, que vienen del brief de diseño y no son estéticas:
 * se usa **con una mano, en una cabina, con sol y a veces con guantes**. De ahí
 * el botón de 64 y los campos de 56, el contraste alto y el tipo grande en lo
 * que hay que teclear.
 */


const formatPhone = (raw: string): string => {
  const digits = raw.replace(/\D/g, '').slice(0, 9);
  return [digits.slice(0, 3), digits.slice(3, 6), digits.slice(6)].filter(Boolean).join(' ');
};

export const OnboardingFlow = ({
  onDone,
}: {
  onDone: (result: { company: OnboardingCompany; driverName: string | null }) => void;
}) => {
  const [state, dispatch] = useReducer(onboardingReducer, initialOnboardingState);

  const [escanerAbierto, setEscanerAbierto] = useState(false);

  const fail = useCallback((error: unknown, kind?: 'otp') => {
    const message =
      error instanceof ApiError ? error.message : 'No se pudo completar. Intenta de nuevo.';
    dispatch({ type: 'fallo', message, kind });
  }, []);

  const submitCode = useCallback(async () => {
    dispatch({ type: 'enviando' });
    try {
      const { company } = await resolveCompany(state.code);
      dispatch({ type: 'empresa-resuelta', company });
    } catch (error) {
      fail(error);
    }
  }, [state.code, fail]);

  const submitPhone = useCallback(async () => {
    dispatch({ type: 'enviando' });
    try {
      await requestOtp({ code: state.code, phone: state.phone });
      dispatch({ type: 'codigo-enviado' });
    } catch (error) {
      fail(error);
    }
  }, [state.code, state.phone, fail]);

  const submitOtp = useCallback(async () => {
    dispatch({ type: 'enviando' });
    try {
      const device = await generateDeviceIdentity();
      const result = await verifyOtp({
        code: state.code,
        phone: state.phone,
        otp: state.otp,
        device: { id: device.id, secret: device.secret, name: deviceLabel(state.driverName) },
      });
      // Sin credencial no hay alta: pasó la verificación pero ese número no
      // tiene ficha de conductor en esta empresa.
      if (!result.credential) {
        dispatch({
          type: 'fallo',
          message: 'Tu número no está registrado como conductor. Habla con tu supervisor.',
        });
        return;
      }
      await saveCredential({
        companyId: result.company.companyId,
        deviceId: device.id,
        deviceSecret: device.secret,
      });
      dispatch({ type: 'verificado', driverName: result.driver?.name ?? null });
      onDone({ company: result.company, driverName: result.driver?.name ?? null });
    } catch (error) {
      fail(error, 'otp');
    }
  }, [state.code, state.phone, state.otp, state.driverName, fail, onDone]);

  const resend = useCallback(async () => {
    dispatch({ type: 'pedir-otro-codigo' });
    try {
      await requestOtp({ code: state.code, phone: state.phone });
      dispatch({ type: 'codigo-enviado' });
    } catch (error) {
      fail(error);
    }
  }, [state.code, state.phone, fail]);

  const enabled = canSubmit(state, isCompleteCode);

  /**
   * Con los 6 dígitos escritos se verifica solo: el teclado numérico tapa el
   * botón y buscarlo es un paso de más. `ultimoOtpRef` evita el bucle — un
   * código rechazado no se reenvía a sí mismo hasta agotar los intentos.
   */
  const ultimoOtpRef = useRef<string | null>(null);
  useEffect(() => {
    if (state.step !== 'verificar') {
      ultimoOtpRef.current = null;
      return;
    }
    if (!shouldAutoSubmitOtp(state, ultimoOtpRef.current)) return;
    ultimoOtpRef.current = state.otp;
    void submitOtp();
  }, [state, submitOtp]);

  return (
    <KeyboardAvoidingView
      style={styles.fill}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
        {state.step === 'codigo' && (
          <>
            <Text style={styles.title}>¿De qué empresa eres?</Text>
            <Text style={styles.help}>Escribe el código que te dio tu empresa</Text>
            <TextInput
              style={[styles.input, styles.codeInput, state.error ? styles.inputError : null]}
              value={state.code}
              onChangeText={(value) =>
                dispatch({ type: 'escribir-codigo', value: formatCode(value) })
              }
              placeholder="TECE-4K7P-92"
              placeholderTextColor={theme.textMuted}
              autoCapitalize="characters"
              autoCorrect={false}
              accessibilityLabel="Código de empresa"
              testID="input-codigo-empresa"
            />
            {/* Atajo, no requisito: si la cámara falla o no hay permiso, el
                código se escribe igual. */}
            <Pressable
              accessibilityRole="button"
              onPress={() => setEscanerAbierto(true)}
              style={styles.scanButton}
              testID="btn-escanear-qr"
            >
              <Text style={styles.scanButtonText}>Escanear código QR</Text>
            </Pressable>
            <QrScannerSheet
              visible={escanerAbierto}
              onClose={() => setEscanerAbierto(false)}
              onCode={(code) => dispatch({ type: 'escribir-codigo', value: code })}
            />
          </>
        )}

        {state.step === 'confirmar' && state.company && (
          <View style={styles.center}>
            {state.company.logoUrl ? (
              <Image
                source={{ uri: state.company.logoUrl }}
                style={styles.logo}
                resizeMode="contain"
              />
            ) : null}
            <Text style={styles.company}>{state.company.name}</Text>
            <Text style={styles.title}>¿Es tu empresa?</Text>
          </View>
        )}

        {state.step === 'telefono' && (
          <>
            <Text style={styles.title}>¿Cuál es tu número?</Text>
            <Text style={styles.help}>El mismo que le diste a tu empresa</Text>
            <View style={styles.phoneRow}>
              <Text style={styles.prefix}>+51</Text>
              <TextInput
                style={[styles.input, styles.phoneInput, state.error ? styles.inputError : null]}
                value={state.phone}
                onChangeText={(value) =>
                  dispatch({ type: 'escribir-telefono', value: formatPhone(value) })
                }
                placeholder="9XX XXX XXX"
                placeholderTextColor={theme.textMuted}
                keyboardType="number-pad"
                accessibilityLabel="Tu número de celular"
                testID="input-telefono"
              />
            </View>
            <Text style={styles.help}>Te vamos a mandar un código por WhatsApp</Text>
          </>
        )}

        {state.step === 'verificar' && (
          <>
            <Text style={styles.title}>Escribe el código</Text>
            {/* No se dice a qué número se envió: eso filtraría el número de un
                tercero a quien tenga el teléfono en la mano. */}
            <Text style={styles.help}>Te lo mandamos por WhatsApp</Text>
            <TextInput
              style={[styles.input, styles.otpInput, state.error ? styles.inputError : null]}
              value={state.otp}
              onChangeText={(value) =>
                dispatch({ type: 'escribir-otp', value: value.replace(/\D/g, '').slice(0, 6) })
              }
              placeholder="000000"
              placeholderTextColor={theme.textMuted}
              keyboardType="number-pad"
              textContentType="oneTimeCode"
              autoComplete="sms-otp"
              accessibilityLabel="Código de verificación"
              testID="input-otp"
            />
            {shouldOfferNewCode(state) && (
              <Text style={styles.help}>
                Ese código ya no sirve. Pide uno nuevo y vuelve a intentar.
              </Text>
            )}
          </>
        )}

        {state.step === 'listo' && (
          <View style={styles.center}>
            <Text style={styles.hello}>Hola, {state.driverName ?? 'conductor'}</Text>
            <Text style={styles.company}>{state.company?.name}</Text>
          </View>
        )}

        {state.error ? <Text style={styles.error}>{state.error}</Text> : null}
      </ScrollView>

      <View style={styles.footer}>
        {shouldOfferNewCode(state) ? (
          <Pressable
            style={[styles.button, state.isBusy && styles.buttonOff]}
            disabled={state.isBusy}
            onPress={resend}
            accessibilityRole="button"
          >
            <Text style={styles.buttonText}>Enviar otro código</Text>
          </Pressable>
        ) : (
          <Pressable
            style={[styles.button, !enabled && styles.buttonOff]}
            disabled={!enabled}
            accessibilityRole="button"
            onPress={() => {
              if (state.step === 'codigo') void submitCode();
              else if (state.step === 'confirmar') dispatch({ type: 'empresa-confirmada' });
              else if (state.step === 'telefono') void submitPhone();
              else if (state.step === 'verificar') void submitOtp();
            }}
          >
            {state.isBusy ? (
              <ActivityIndicator color={theme.onAccent} />
            ) : (
              <Text style={styles.buttonText}>
                {state.step === 'confirmar' ? 'Sí, continuar' : 'Continuar'}
              </Text>
            )}
          </Pressable>
        )}

        {state.step !== 'codigo' && state.step !== 'listo' && (
          <Pressable
            style={styles.back}
            onPress={() => dispatch({ type: 'atras' })}
            accessibilityRole="button"
          >
            <Text style={styles.backText}>
              {state.step === 'confirmar' ? 'No, escribir otro código' : 'Atrás'}
            </Text>
          </Pressable>
        )}
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  // 56 px como los campos: se toca con una mano dentro de la cabina.
  scanButton: {
    alignItems: 'center',
    borderColor: theme.accent,
    borderRadius: 14,
    borderWidth: 2,
    justifyContent: 'center',
    marginTop: 12,
    minHeight: 56,
  },
  scanButtonText: { color: theme.accent, fontSize: 16, fontWeight: '700' },
  fill: { flex: 1, backgroundColor: theme.background },
  page: { flexGrow: 1, justifyContent: 'center', padding: 24, gap: 12 },
  center: { alignItems: 'center', gap: 12 },
  title: { fontSize: 28, fontWeight: '700', color: theme.text },
  help: { fontSize: 16, color: theme.textSecondary, lineHeight: 24 },
  company: { fontSize: 20, fontWeight: '600', color: theme.text },
  hello: { fontSize: 32, fontWeight: '700', color: theme.text },
  logo: { width: 160, height: 80 },
  // 56 de alto: el mínimo para una mano con guantes en una cabina.
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
  inputError: { borderColor: theme.danger },
  codeInput: { fontSize: 26, letterSpacing: 2, fontVariant: ['tabular-nums'] },
  otpInput: { fontSize: 32, letterSpacing: 8, textAlign: 'center' },
  phoneRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  prefix: { fontSize: 20, color: theme.textSecondary },
  phoneInput: { flex: 1, fontSize: 22, letterSpacing: 1 },
  error: { fontSize: 15, color: theme.danger, lineHeight: 22 },
  footer: { padding: 24, gap: 8 },
  // 64 de alto y ancho completo: es LA acción de la pantalla.
  button: {
    minHeight: 64,
    borderRadius: 14,
    backgroundColor: theme.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonOff: { opacity: 0.4 },
  buttonText: { fontSize: 18, fontWeight: '600', color: theme.onAccent },
  back: { minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  backText: { fontSize: 16, color: theme.textSecondary },
});
