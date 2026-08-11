import {
  MAX_OTP_ATTEMPTS,
  canSubmit,
  initialOnboardingState,
  onboardingReducer,
  shouldOfferNewCode,
  type OnboardingEvent,
  type OnboardingState,
} from './machine';

/**
 * El alta es lo primero que ve el chofer y donde más fácil se lo pierde. Lo que
 * estos tests protegen: que nunca quede encerrado sin salida, y que un error
 * viejo no se arrastre a la pantalla siguiente.
 */

const EMPRESA = {
  companyId: 'test',
  name: 'Tece Cargo',
  logoUrl: null,
  accentColor: '#10B981',
};

const correr = (events: OnboardingEvent[], from: OnboardingState = initialOnboardingState) =>
  events.reduce(onboardingReducer, from);

const codigoValido = (code: string) => code.replace(/[^A-Z0-9]/gi, '').length === 10;

describe('recorrido feliz', () => {
  it('llega de código a listo', () => {
    const state = correr([
      { type: 'escribir-codigo', value: 'TECE-4K7P-92' },
      { type: 'enviando' },
      { type: 'empresa-resuelta', company: EMPRESA },
      { type: 'empresa-confirmada' },
      { type: 'escribir-telefono', value: '987654321' },
      { type: 'enviando' },
      { type: 'codigo-enviado' },
      { type: 'escribir-otp', value: '123456' },
      { type: 'enviando' },
      { type: 'verificado', driverName: 'Wilder Ccahuana' },
    ]);

    expect(state.step).toBe('listo');
    expect(state.driverName).toBe('Wilder Ccahuana');
    expect(state.company?.name).toBe('Tece Cargo');
    expect(state.isBusy).toBe(false);
  });

  it('arranca pidiendo el código de empresa', () => {
    expect(initialOnboardingState.step).toBe('codigo');
    expect(initialOnboardingState.company).toBeNull();
  });
});

describe('errores', () => {
  it('un fallo corta el «enviando» y muestra el motivo', () => {
    const state = correr([
      { type: 'enviando' },
      { type: 'fallo', message: 'Ese código no existe. Revísalo con tu empresa.' },
    ]);

    expect(state.isBusy).toBe(false);
    expect(state.error).toContain('no existe');
  });

  /** Dejarlo en rojo mientras corrige solo lo pone nervioso. */
  it('escribir limpia el error', () => {
    const conError = correr([{ type: 'fallo', message: 'x' }]);

    expect(onboardingReducer(conError, { type: 'escribir-codigo', value: 'T' }).error).toBeNull();
    expect(onboardingReducer(conError, { type: 'escribir-telefono', value: '9' }).error).toBeNull();
    expect(onboardingReducer(conError, { type: 'escribir-otp', value: '1' }).error).toBeNull();
  });

  it('volver atrás no arrastra el error', () => {
    const state = correr([
      { type: 'empresa-resuelta', company: EMPRESA },
      { type: 'fallo', message: 'algo' },
      { type: 'atras' },
    ]);

    expect(state.step).toBe('codigo');
    expect(state.error).toBeNull();
  });

  it('desde la primera pantalla, atrás no rompe nada', () => {
    expect(correr([{ type: 'atras' }]).step).toBe('codigo');
  });
});

describe('intentos del código de 6 dígitos', () => {
  const hasta = (n: number) =>
    correr(
      [
        { type: 'empresa-resuelta', company: EMPRESA },
        { type: 'empresa-confirmada' },
        { type: 'codigo-enviado' },
        ...Array.from({ length: n }, () => ({ type: 'fallo' as const, message: 'Ese código no es correcto.', kind: 'otp' as const })),
      ]
    );

  it('cuenta solo los fallos DEL CÓDIGO, no cualquier error', () => {
    const state = correr([
      { type: 'codigo-enviado' },
      { type: 'fallo', message: 'sin señal' },
      { type: 'fallo', message: 'malo', kind: 'otp' },
    ]);

    expect(state.otpAttempts).toBe(1);
  });

  /**
   * El server no puede decir «se te acabaron los intentos» sin filtrar, así que
   * la pantalla lleva la cuenta. A la tercera, el camino es pedir otro código —
   * si no, el chofer teclea el código CORRECTO y se lo siguen rechazando.
   */
  it('a los tres fallos ofrece pedir otro código y bloquea el botón', () => {
    const state = hasta(MAX_OTP_ATTEMPTS);

    expect(shouldOfferNewCode(state)).toBe(true);
    expect(
      canSubmit({ ...state, otp: '123456' }, codigoValido)
    ).toBe(false);
  });

  it('antes del tercero no molesta', () => {
    expect(shouldOfferNewCode(hasta(MAX_OTP_ATTEMPTS - 1))).toBe(false);
  });

  it('pedir otro código reinicia la cuenta y limpia lo tecleado', () => {
    const state = onboardingReducer(hasta(MAX_OTP_ATTEMPTS), { type: 'pedir-otro-codigo' });

    expect(state.otpAttempts).toBe(0);
    expect(state.otp).toBe('');
    expect(shouldOfferNewCode(state)).toBe(false);
  });

  /** Los intentos son del código que acaba de llegar, no de la sesión. */
  it('un código nuevo enviado reinicia la cuenta', () => {
    const state = onboardingReducer(hasta(MAX_OTP_ATTEMPTS), { type: 'codigo-enviado' });

    expect(state.otpAttempts).toBe(0);
  });
});

describe('canSubmit', () => {
  const en = (step: OnboardingState['step'], over: Partial<OnboardingState> = {}) =>
    ({ ...initialOnboardingState, step, ...over }) as OnboardingState;

  it('el código de empresa tiene que estar completo', () => {
    expect(canSubmit(en('codigo', { code: 'TECE-4K7P' }), codigoValido)).toBe(false);
    expect(canSubmit(en('codigo', { code: 'TECE-4K7P-92' }), codigoValido)).toBe(true);
  });

  it('el teléfono necesita sus nueve dígitos', () => {
    expect(canSubmit(en('telefono', { phone: '98765' }), codigoValido)).toBe(false);
    expect(canSubmit(en('telefono', { phone: '987 654 321' }), codigoValido)).toBe(true);
  });

  it('el código de verificación necesita los seis', () => {
    expect(canSubmit(en('verificar', { otp: '12345' }), codigoValido)).toBe(false);
    expect(canSubmit(en('verificar', { otp: '123456' }), codigoValido)).toBe(true);
  });

  /** Con un envío en vuelo, el botón no se toca: evita el doble alta. */
  it('nada se puede tocar mientras hay algo en vuelo', () => {
    expect(canSubmit(en('codigo', { code: 'TECE-4K7P-92', isBusy: true }), codigoValido)).toBe(false);
  });

  it('la confirmación necesita una empresa resuelta', () => {
    expect(canSubmit(en('confirmar'), codigoValido)).toBe(false);
    expect(canSubmit(en('confirmar', { company: EMPRESA }), codigoValido)).toBe(true);
  });
});
