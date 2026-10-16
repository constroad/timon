/**
 * Diagnóstico de Timón — el MOTOR PURO (José, 15/10/2026: «¿no hay forma de
 * medir performance de los APK y guardar eso, como los errores?»).
 *
 * Acá vive solo la decisión: recortar el buffer, serializar un error, armar el
 * cuerpo del reporte. Nada de archivos ni de red (eso es `registro.ts`), así
 * que se prueba en Jest sin tocar expo —el mismo corte que `queue.ts` vs
 * `store.ts`—. Nada sensible entra jamás: ni token, ni placa, ni teléfono.
 */

export type EntradaError = { tipo: 'error'; cuando: number; mensaje: string; stack?: string; origen?: string };
export type EntradaPerf = { tipo: 'perf'; cuando: number; op: string; ms: number; extra?: Record<string, number> };
export type EntradaDiagnostico = EntradaError | EntradaPerf;

/** Tope del buffer: lo viejo se cae para que el log nunca crezca sin fin (rn-app-loop §10). */
export const MAX_ENTRADAS = 200;
const MENSAJE_MAX = 500;
const STACK_MAX = 2_000;

/** PURA: agrega una entrada y recorta a las últimas `max` (las nuevas al final). */
export function agregar(
  buffer: readonly EntradaDiagnostico[],
  entrada: EntradaDiagnostico,
  max = MAX_ENTRADAS
): EntradaDiagnostico[] {
  const siguiente = [...buffer, entrada];
  return siguiente.length > max ? siguiente.slice(siguiente.length - max) : siguiente;
}

/** PURA: el error crudo (string, Error o cualquier cosa) a una entrada acotada. */
export function entradaDeError(valor: unknown, origen?: string, ahora = Date.now()): EntradaError {
  const error = valor as { message?: unknown; stack?: unknown } | null;
  const mensaje =
    error && typeof error === 'object' && typeof error.message === 'string' ? error.message : String(valor);
  const stack = error && typeof error === 'object' && typeof error.stack === 'string' ? error.stack : undefined;
  return {
    tipo: 'error',
    cuando: ahora,
    mensaje: mensaje.slice(0, MENSAJE_MAX),
    ...(stack ? { stack: stack.slice(0, STACK_MAX) } : {}),
    ...(origen ? { origen } : {}),
  };
}

/** PURA: una entrada de performance ya redondeada. */
export function entradaDePerf(op: string, ms: number, extra?: Record<string, number>, ahora = Date.now()): EntradaPerf {
  return { tipo: 'perf', cuando: ahora, op, ms: Math.round(ms), ...(extra ? { extra } : {}) };
}

/** PURA: ¿esto que leí del disco es una entrada válida? (descarta un archivo corrupto). */
export function esEntrada(valor: unknown): valor is EntradaDiagnostico {
  if (typeof valor !== 'object' || valor === null) return false;
  const entrada = valor as { tipo?: unknown };
  return entrada.tipo === 'error' || entrada.tipo === 'perf';
}

/** PURA: lee un arreglo crudo del disco y lo deja en entradas válidas, acotado. */
export function parsearBuffer(crudo: unknown, max = MAX_ENTRADAS): EntradaDiagnostico[] {
  return Array.isArray(crudo) ? crudo.filter(esEntrada).slice(-max) : [];
}

export type MetaReporte = { slug: string; installId: string; version: string; versionCode: number };
export type CuerpoReporte = MetaReporte & { plataforma: 'android'; entradas: EntradaDiagnostico[] };

/** PURA: arma el cuerpo que viaja a LilaStore. Separado para poder probarlo sin red. */
export function cuerpoDeReporte(entradas: EntradaDiagnostico[], meta: MetaReporte): CuerpoReporte {
  return { ...meta, plataforma: 'android', entradas };
}
