/**
 * Máquina del alta (Timón · A1). PURA: no toca red, ni almacenamiento, ni React.
 *
 * El alta tiene cinco pantallas y varias formas de salir mal —código que no
 * existe, número que no está en la ficha, código vencido, sin señal—. Metida
 * dentro de los componentes, esa lógica se vuelve imposible de probar y cada
 * pantalla termina con su propia idea de qué es «volver atrás».
 *
 * Regla que gobierna el archivo: **el estado dice qué pantalla se ve y qué se
 * puede tocar**; los componentes solo dibujan y avisan lo que pasó.
 */

export type OnboardingStep = 'codigo' | 'confirmar' | 'telefono' | 'verificar' | 'listo';

export interface OnboardingCompany {
  companyId: string;
  name: string;
  logoUrl: string | null;
  accentColor: string | null;
}

export interface OnboardingState {
  step: OnboardingStep;
  code: string;
  phone: string;
  otp: string;
  company: OnboardingCompany | null;
  driverName: string | null;
  /** Error para MOSTRAR, ya en lenguaje del chofer. */
  error: string | null;
  isBusy: boolean;
  /**
   * Intentos fallidos del código de 6 dígitos, contados en el cliente.
   *
   * El server no puede decir «se te acabaron los intentos» sin filtrar
   * información, así que responde siempre «Ese código no es correcto». El chofer
   * honesto que ya falló tres veces seguiría tecleando el código CORRECTO sin
   * entender por qué lo rechaza. La pantalla lleva su propia cuenta y a la
   * tercera le ofrece pedir uno nuevo. (Detectado en el E2E de S1b.)
   */
  otpAttempts: number;
}

export const MAX_OTP_ATTEMPTS = 3;

export const initialOnboardingState: OnboardingState = {
  step: 'codigo',
  code: '',
  phone: '',
  otp: '',
  company: null,
  driverName: null,
  error: null,
  isBusy: false,
  otpAttempts: 0,
};

export type OnboardingEvent =
  | { type: 'escribir-codigo'; value: string }
  | { type: 'escribir-telefono'; value: string }
  | { type: 'escribir-otp'; value: string }
  | { type: 'enviando' }
  | { type: 'empresa-resuelta'; company: OnboardingCompany }
  | { type: 'empresa-confirmada' }
  | { type: 'codigo-enviado' }
  | { type: 'verificado'; driverName: string | null }
  | { type: 'fallo'; message: string; kind?: 'otp' | 'general' }
  | { type: 'pedir-otro-codigo' }
  | { type: 'atras' };

/** A qué paso vuelve «atrás». El primero no vuelve a ningún lado. */
const PREVIOUS: Record<OnboardingStep, OnboardingStep> = {
  codigo: 'codigo',
  confirmar: 'codigo',
  telefono: 'confirmar',
  verificar: 'telefono',
  listo: 'listo',
};

export function onboardingReducer(
  state: OnboardingState,
  event: OnboardingEvent
): OnboardingState {
  switch (event.type) {
    case 'escribir-codigo':
      // Escribir limpia el error: el chofer ya está corrigiendo, dejarlo en rojo
      // mientras teclea solo lo pone nervioso.
      return { ...state, code: event.value, error: null };
    case 'escribir-telefono':
      return { ...state, phone: event.value, error: null };
    case 'escribir-otp':
      return { ...state, otp: event.value, error: null };
    case 'enviando':
      return { ...state, isBusy: true, error: null };
    case 'empresa-resuelta':
      return { ...state, isBusy: false, company: event.company, step: 'confirmar', error: null };
    case 'empresa-confirmada':
      return { ...state, step: 'telefono', error: null };
    case 'codigo-enviado':
      // Cada envío nuevo reinicia la cuenta: los intentos son del código que
      // acaba de llegar, no de la sesión.
      return { ...state, isBusy: false, step: 'verificar', otp: '', otpAttempts: 0, error: null };
    case 'verificado':
      return { ...state, isBusy: false, step: 'listo', driverName: event.driverName, error: null };
    case 'fallo':
      return {
        ...state,
        isBusy: false,
        error: event.message,
        otpAttempts: event.kind === 'otp' ? state.otpAttempts + 1 : state.otpAttempts,
      };
    case 'pedir-otro-codigo':
      return { ...state, otp: '', otpAttempts: 0, error: null, isBusy: true };
    case 'atras':
      // Volver atrás no arrastra el error de la pantalla anterior.
      return { ...state, step: PREVIOUS[state.step], error: null, isBusy: false };
    default:
      return state;
  }
}

/** ¿El botón principal de este paso se puede tocar? */
export function canSubmit(state: OnboardingState, isValidCode: (code: string) => boolean): boolean {
  if (state.isBusy) return false;
  switch (state.step) {
    case 'codigo':
      return isValidCode(state.code);
    case 'confirmar':
      return state.company !== null;
    case 'telefono':
      return state.phone.replace(/\D/g, '').length >= 9;
    case 'verificar':
      return state.otp.length === 6 && state.otpAttempts < MAX_OTP_ATTEMPTS;
    default:
      return false;
  }
}

/**
 * ¿Hay que ofrecerle pedir otro código en vez de dejarlo insistir?
 *
 * Es el remate de la nota de `otpAttempts`: a la tercera, el camino de salida es
 * pedir un código nuevo, no volver a teclear el mismo.
 */
export function shouldOfferNewCode(state: OnboardingState): boolean {
  return state.step === 'verificar' && state.otpAttempts >= MAX_OTP_ATTEMPTS;
}
