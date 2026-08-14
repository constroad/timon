/**
 * El seguimiento del viaje, en palabras del chofer (Timón · S4). Motor PURO.
 *
 * El server manda tres datos crudos; acá se convierten en las frases que le
 * sirven. La importante: **si el viaje se está registrando**. Un rastreo caído
 * hoy se descubre cuando alguien llama a preguntar dónde va el camión, y para
 * entonces ya se perdió el tramo.
 *
 * **Ningún texto nombra a quién mira.** El cartel decía «La oficina te está
 * viendo» y eso no informa a un chofer que no entiende de GPS ni de permisos:
 * lo asusta. Lo que necesita saber es si SU teléfono está registrando el viaje
 * y, si no, qué tocar. Quién lo consulte después no es asunto de esta pantalla.
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
export function trackingStatusLabel(
  tracking?: TripTracking | null,
  sentFromThisPhone = false
): string | null {
  if (!tracking) return null;
  // La app sabe si acaba de mandar posiciones. El payload en pantalla puede ser
  // anterior a ese envío —nadie lo refresca al vuelo— y sin esto el cartel dice
  // «todavía no llega» con el rastro ya guardado en la oficina.
  if (tracking.live || sentFromThisPhone) return 'Viaje registrándose';
  return tracking.lastPositionAt
    ? 'Tu ubicación no se registra hace rato. Revisa que esté prendida.'
    : 'Todavía no se registra tu ubicación. Revisa que esté prendida.';
}
