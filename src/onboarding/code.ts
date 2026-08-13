/**
 * Código de empresa: tipeado o escaneado.
 *
 * Vive fuera del componente a propósito (regla del loop de RN): son decisiones
 * de negocio —qué es un código válido, qué se corrige, qué se descarta— y así
 * corren en Jest en un segundo, sin emulador.
 *
 * El alfabeto no tiene **I, L, O ni U** (se confunden con 1, 0 y entre sí), y
 * por eso al leer sí se aceptan y se corrigen: quien escribe «O» quiso escribir
 * «0», y rechazarle el código por la tipografía sería castigarlo por un problema
 * nuestro. Es la misma normalización que hace el server.
 */
export const CODE_LENGTH = 10;

const normalize = (raw: string): string =>
  raw
    .toUpperCase()
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1')
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, CODE_LENGTH);

/** Lo que se ve mientras se tipea: `X7G2-DP4E-Z8`. */
export const formatCode = (raw: string): string => {
  const clean = normalize(raw);
  return [clean.slice(0, 4), clean.slice(4, 8), clean.slice(8)].filter(Boolean).join('-');
};

export const isCompleteCode = (code: string): boolean =>
  code.replace(/[^A-Z0-9]/gi, '').length === CODE_LENGTH;

/**
 * Texto de un QR → código, o `null` si no lo es.
 *
 * La cámara lee TODO lo que se le cruce (wifi, links, otros QR del taller), así
 * que esto es también el filtro: sin él, la app mandaría basura al server y el
 * chofer vería «ese código no existe» sin entender por qué.
 */
export const parseScannedCode = (raw: string | null | undefined): string | null => {
  const texto = String(raw ?? '').trim();
  if (!texto) return null;

  // Dentro de una URL o deep link el código viaja en `?code=`.
  const enParametro = texto.match(/[?&]code=([^&\s]+)/i)?.[1];
  const candidato = enParametro ?? texto;

  // Un texto largo con espacios/símbolos no es nuestro código: solo se acepta
  // lo que ya venía como código (con o sin guiones/espacios de agrupación).
  if (!enParametro && !/^[a-z0-9\s-]+$/i.test(candidato)) return null;

  const limpio = normalize(candidato);
  return limpio.length === CODE_LENGTH ? formatCode(limpio) : null;
};

/** Los 6 dígitos del código que llega por WhatsApp. */
export const OTP_LENGTH = 6;

/**
 * ¿Hay que verificar el código sin esperar a que toque «Continuar»?
 *
 * Sí cuando ya escribió los 6 dígitos — con el teclado numérico abierto, el
 * botón queda tapado y buscarlo es un paso de más. Pero **nunca dos veces el
 * mismo código**: si el server lo rechaza, reenviarlo solo agotaría los
 * intentos sin que el chofer toque nada.
 */
export const shouldAutoSubmitOtp = (
  state: { otp: string; isBusy: boolean },
  lastAttempted: string | null
): boolean =>
  !state.isBusy && state.otp.length === OTP_LENGTH && state.otp !== lastAttempted;
