import { shouldKeepFix } from './policy';

/**
 * El rastro que espera en el teléfono (Timón · A5 §4.4-5). Motor PURO.
 *
 * El caso que define este archivo: dos horas sin señal en la sierra y el chofer
 * vuelve con ~120 puntos. Tienen que estar TODOS, sin repetirse, y sin haberle
 * llenado el teléfono si la subida quedó rota una semana.
 *
 * Los puntos se guardan en disco, no en memoria: el sistema mata la app en el
 * bolsillo del chofer y el rastro no puede depender de que siga viva.
 */

/**
 * Techo del buffer. ~33 horas de viaje al ritmo normal (60 s), que cubre de
 * sobra el caso «sin señal todo el día» sin dejar que crezca sin fin.
 */
export const MAX_BUFFERED_POINTS = 2_000;
/** Lo mismo que acepta el server: más que esto no es un lote, es un volcado. */
export const MAX_BATCH_POINTS = 200;

export interface BufferedPoint {
  /** Id local del dispositivo: es lo que hace idempotente al reintento. */
  id: string;
  lat: number;
  lng: number;
  /** Instante de la MEDICIÓN, del reloj del teléfono. */
  at: string;
  accuracyM?: number;
  speedKph?: number;
  headingDeg?: number;
  /** Android informa si el fix vino de una app de ubicación simulada. */
  isMocked?: boolean;
}

export function addPoint(buffer: BufferedPoint[], point: BufferedPoint): BufferedPoint[] {
  // El filtro de precisión vive en el TELÉFONO: no vale gastar datos de un
  // prepago en subir un fix que el server va a descartar.
  if (!shouldKeepFix(point)) return buffer;
  if (buffer.some((guardado) => guardado.id === point.id)) return buffer;

  const conElNuevo = [...buffer, point];
  // Lleno: se tira lo MÁS VIEJO. El rastro reciente es el que la torre usa y el
  // que le sirve al cliente que está esperando su carga.
  return conElNuevo.length > MAX_BUFFERED_POINTS
    ? conElNuevo.slice(conElNuevo.length - MAX_BUFFERED_POINTS)
    : conElNuevo;
}

export function takeBatch(buffer: BufferedPoint[]): BufferedPoint[] {
  return buffer.slice(0, MAX_BATCH_POINTS);
}

/**
 * Saca del buffer lo que el server aceptó.
 *
 * Por ID, nunca «los primeros N»: mientras el lote viajaba el servicio siguió
 * escribiendo puntos, y cortar por posición se los llevaría puestos.
 */
export function dropSent(buffer: BufferedPoint[], sent: BufferedPoint[]): BufferedPoint[] {
  const enviados = new Set(sent.map((point) => point.id));
  return buffer.filter((point) => !enviados.has(point.id));
}

export function parseBuffer(raw: string | null | undefined): BufferedPoint[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(isBufferedPoint);
}

function isBufferedPoint(value: unknown): value is BufferedPoint {
  const point = value as Partial<BufferedPoint> | null;
  return (
    typeof point?.id === 'string' &&
    typeof point.lat === 'number' &&
    typeof point.lng === 'number' &&
    typeof point.at === 'string'
  );
}
