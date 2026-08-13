import { formatCode, isCompleteCode, parseScannedCode, shouldAutoSubmitOtp } from './code';

/**
 * El código de empresa se puede TIPEAR o ESCANEAR. Lo que se fija acá:
 *
 * 1. Al tipear se ve en grupos (`X7G2-DP4E-Z8`) y se corrigen las confusiones
 *    del alfabeto — el server hace lo mismo: quien escribe «O» quiso «0».
 * 2. Al escanear, el QR puede traer el código pelado, con guiones, en
 *    minúsculas o dentro de una URL. Todo eso es el mismo código.
 * 3. Cualquier otra cosa devuelve `null`: la cámara lee muchos QR ajenos y no
 *    puede mandar basura al server.
 */
describe('formatCode', () => {
  it('agrupa 4-4-2 y sube a mayúsculas', () => {
    expect(formatCode('x7g2dp4ez8')).toBe('X7G2-DP4E-Z8');
    expect(formatCode('X7G2')).toBe('X7G2');
  });

  it('corrige las letras que se confunden al dictar (O→0, I/L→1)', () => {
    expect(formatCode('OIL2dp4ez8')).toBe('0112-DP4E-Z8');
  });

  it('no deja pasar de 10 caracteres', () => {
    expect(formatCode('X7G2DP4EZ8EXTRA')).toBe('X7G2-DP4E-Z8');
  });
});

describe('isCompleteCode', () => {
  it('solo con los 10 caracteres', () => {
    expect(isCompleteCode('X7G2-DP4E-Z8')).toBe(true);
    expect(isCompleteCode('X7G2-DP4E-Z')).toBe(false);
  });
});

describe('parseScannedCode', () => {
  it('lee el código tal como lo imprime el Portal', () => {
    expect(parseScannedCode('X7G2-DP4E-Z8')).toBe('X7G2-DP4E-Z8');
  });

  it('lee variantes: pelado, en minúsculas y con espacios', () => {
    expect(parseScannedCode('x7g2dp4ez8')).toBe('X7G2-DP4E-Z8');
    expect(parseScannedCode('  X7G2 DP4E Z8 ')).toBe('X7G2-DP4E-Z8');
  });

  it('lee el código dentro de una URL o un deep link', () => {
    expect(parseScannedCode('timon://enroll?code=X7G2DP4EZ8')).toBe('X7G2-DP4E-Z8');
    expect(parseScannedCode('https://constroad.com/app?code=x7g2-dp4e-z8')).toBe('X7G2-DP4E-Z8');
  });

  it('un QR ajeno no devuelve nada (la cámara lee de todo)', () => {
    expect(parseScannedCode('https://www.youtube.com/watch?v=abc')).toBeNull();
    expect(parseScannedCode('WIFI:S:CasaJose;T:WPA;P:12345678;;')).toBeNull();
    expect(parseScannedCode('')).toBeNull();
  });
});

describe('shouldAutoSubmitOtp', () => {
  const base = { otp: '123456', isBusy: false } as const;

  it('con los 6 dígitos escritos, se envía solo: nadie quiere buscar el botón', () => {
    expect(shouldAutoSubmitOtp(base, null)).toBe(true);
  });

  it('incompleto o mientras verifica, no', () => {
    expect(shouldAutoSubmitOtp({ ...base, otp: '12345' }, null)).toBe(false);
    expect(shouldAutoSubmitOtp({ ...base, isBusy: true }, null)).toBe(false);
  });

  /**
   * El caso que rompe todo si falta: el código es incorrecto, el server
   * responde error, y el auto-envío lo vuelve a mandar en bucle hasta agotar
   * los intentos. Un código ya intentado NO se reenvía solo.
   */
  it('un código ya intentado no se reenvía solo', () => {
    expect(shouldAutoSubmitOtp(base, '123456')).toBe(false);
    expect(shouldAutoSubmitOtp({ ...base, otp: '654321' }, '123456')).toBe(true);
  });
});
