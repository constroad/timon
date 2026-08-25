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

/**
 * Cuánto puede oscilar el GPS sin que cuente como haberse movido.
 *
 * **Sin esta tolerancia la rama «detenido» no se activa nunca**: un fix parado
 * deriva metros entre lecturas, así que el camión en la balanza «se mueve» cada
 * minuto. 60 m es holgado para la deriva y chico frente a cualquier maniobra
 * real de un camión.
 */
const DERIVA_M = 60;

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

/**
 * Hace cuántos minutos el teléfono está en el mismo lugar.
 *
 * **Existe porque la rama «detenido» de `resolveSampling` era código muerto**:
 * el único sitio que la llamaba pasaba `stoppedMinutes: 0` fijo, así que un
 * camión tres horas en la balanza seguía pidiendo GPS de alta precisión cada
 * minuto (`specs/BATERIA.spec.md` §1.1).
 *
 * Se mide contra el punto MÁS RECIENTE, no contra el último del array: Android
 * entrega en ráfagas y no siempre en orden.
 *
 * Sin puntos devuelve `0` — ante la duda, la rama de «en movimiento». Un
 * teléfono recién arrancado no lleva media hora quieto solo porque no tengamos
 * con qué compararlo.
 */
export function minutosDetenido(
  puntos: { lat: number; lng: number; at: string }[],
  ahoraMs: number
): number {
  if (puntos.length === 0) return 0;

  const conFecha = puntos
    .map((p) => ({ ...p, ms: Date.parse(p.at) }))
    .filter((p) => Number.isFinite(p.ms))
    .sort((a, b) => a.ms - b.ms);
  if (conFecha.length === 0) return 0;

  const actual = conFecha[conFecha.length - 1];

  // Hacia atrás hasta el primero que YA no está en este lugar: lo que quedó
  // entre ese y ahora es el tiempo quieto.
  let desde = actual.ms;
  for (let i = conFecha.length - 1; i >= 0; i -= 1) {
    if (metrosEntre(conFecha[i], actual) > DERIVA_M) break;
    desde = conFecha[i].ms;
  }

  return Math.max(0, Math.round((ahoraMs - desde) / 60_000));
}

/**
 * ¿El muestreo nuevo justifica reiniciar el rastreo?
 *
 * Cambiar el intervalo no es ajustar un parámetro: hay que parar y rearrancar
 * `startLocationUpdatesAsync`, que corta el servicio un instante. Hacerlo en
 * cada fix costaría más batería de la que ahorra, así que solo se reinicia
 * cuando el muestreo de verdad cambió.
 */
export function cambioDeRama(actual: Sampling, nuevo: Sampling): boolean {
  return actual.intervalMs !== nuevo.intervalMs || actual.distanceM !== nuevo.distanceM;
}

/**
 * Distancia en metros. Haversine sobre esfera: a estas escalas el error contra
 * un elipsoide es de centímetros, y lo que se compara son decenas de metros.
 */
function metrosEntre(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  const RADIO_TIERRA_M = 6_371_000;
  const rad = (grados: number) => (grados * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * RADIO_TIERRA_M * Math.asin(Math.min(1, Math.sqrt(h)));
}
