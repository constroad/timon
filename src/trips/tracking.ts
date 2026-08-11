/**
 * El seguimiento del viaje, en palabras del chofer (Timón · S4). Motor PURO.
 *
 * El server manda tres datos crudos; acá se convierten en las dos frases que le
 * sirven. La importante es la segunda: **si la oficina lo está viendo**. Un
 * rastreo caído hoy se descubre cuando alguien llama a preguntar dónde va el
 * camión, y para entonces ya se perdió el tramo.
 */

export interface TripTracking {
  etaAt?: string;
  progressPct: number;
  live: boolean;
  lastPositionAt?: string;
}

/** Hora de llegada en formato de reloj, en horario de Lima. */
export function formatEta(etaAt?: string): string | null {
  if (!etaAt) return null;
  const fecha = new Date(etaAt);
  if (Number.isNaN(fecha.getTime())) return null;
  return new Intl.DateTimeFormat('es-PE', {
    timeZone: 'America/Lima',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(fecha);
}

/**
 * Qué se le dice sobre su propio rastreo.
 *
 * Cuando NO está en vivo, el texto nombra lo que él puede hacer —prender la
 * ubicación, buscar señal—. Decirle «sin señal» a secas lo deja mirando el
 * teléfono sin saber qué tocar.
 */
export function trackingStatusLabel(tracking?: TripTracking | null): string | null {
  if (!tracking) return null;
  if (tracking.live) return 'La oficina te está viendo';
  return tracking.lastPositionAt
    ? 'Tu ubicación no llega hace rato. Revisa que esté prendida.'
    : 'Tu ubicación todavía no llega a la oficina.';
}
