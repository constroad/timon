/**
 * Política de muestreo del rastro (Timón · A5 §4.5). Motor PURO.
 *
 * Cada punto de más es batería y datos de un prepago; cada punto de menos es un
 * tramo que la torre no puede dibujar. Los números de fábrica salen del spec y
 * son un punto de partida a calibrar con un viaje Lima–Ica real — por eso lo
 * importante no es el número sino que **la política la mande el server**: un APK
 * sideloaded se actualiza tarde y mal, y recompilar para cambiar un intervalo no
 * es una opción.
 */

/** Debajo de esto el teléfono se calienta y la batería no llega a destino. */
const MIN_INTERVAL_MS = 15_000;
/** Debajo de este nivel manda la batería sobre cualquier otra consideración. */
const LOW_BATTERY_LEVEL = 0.15;
/** Quieto más que esto ya no es tráfico: es la cola de la balanza o un almuerzo. */
const STOPPED_MINUTES = 10;

export const DEFAULT_SAMPLING = {
  movingMs: 60_000,
  movingDistanceM: 150,
  stoppedMs: 300_000,
  stoppedDistanceM: 150,
  lowBatteryMs: 600_000,
  lowBatteryDistanceM: 300,
} as const;

/** Lo que el server puede pisar. Todo opcional: manda lo que quiera cambiar. */
export type SamplingConfig = Partial<Record<keyof typeof DEFAULT_SAMPLING, number>>;

export interface Sampling {
  intervalMs: number;
  distanceM: number;
}

export function resolveSampling(params: {
  stoppedMinutes: number;
  /** 0–1. `undefined` = el teléfono no lo informó; no se asume lo peor. */
  batteryLevel?: number;
  config?: SamplingConfig;
}): Sampling {
  const valores = { ...DEFAULT_SAMPLING, ...limpiar(params.config) };

  // La batería gana sobre todo: un chofer sin batería al llegar es peor que un
  // rastro con menos puntos.
  if (typeof params.batteryLevel === 'number' && params.batteryLevel < LOW_BATTERY_LEVEL) {
    return acotar(valores.lowBatteryMs, valores.lowBatteryDistanceM);
  }
  if (params.stoppedMinutes >= STOPPED_MINUTES) {
    return acotar(valores.stoppedMs, valores.stoppedDistanceM);
  }
  return acotar(valores.movingMs, valores.movingDistanceM);
}

/**
 * ¿Este fix merece guardarse?
 *
 * Se filtra en el TELÉFONO, antes de gastar datos en subirlo. Lo que no se
 * filtra es el fix simulado: se guarda marcado, porque un rastro falseado es un
 * problema de personas y el dato tiene que quedar para poder mostrarlo.
 */
export const MAX_ACCURACY_M = 100;

export function shouldKeepFix(fix: { accuracyM?: number; isMocked?: boolean }): boolean {
  if (typeof fix.accuracyM !== 'number') return true;
  return fix.accuracyM <= MAX_ACCURACY_M;
}

function limpiar(config?: SamplingConfig): SamplingConfig {
  if (!config) return {};
  const limpio: SamplingConfig = {};
  for (const [clave, valor] of Object.entries(config)) {
    if (typeof valor === 'number' && Number.isFinite(valor) && valor > 0) {
      limpio[clave as keyof SamplingConfig] = valor;
    }
  }
  return limpio;
}

function acotar(intervalMs: number, distanceM: number): Sampling {
  return { intervalMs: Math.max(MIN_INTERVAL_MS, intervalMs), distanceM: Math.max(0, distanceM) };
}
