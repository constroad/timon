/**
 * Vueltas de una jornada por ciclos (Timón · A3). Motor PURO.
 *
 * Un viaje «por jornada» no se paga por recorrido sino **por vuelta**: cada tap
 * del chofer es plata en la liquidación y una línea en la factura del cliente.
 * De ahí las dos reglas duras de este archivo.
 */

/** Toques más juntos que esto son el mismo dedo, no dos vueltas. */
export const MIN_MS_BETWEEN_TAPS = 20_000;

export interface CycleDraft {
  m3: string;
  note: string;
}

/**
 * Clave de idempotencia del tap.
 *
 * Viaja con el cuerpo para que **un reintento no sume una vuelta más**: sin
 * ella, cada reenvío tras una respuesta perdida —que en carretera es lo
 * normal— sería un ciclo inventado que alguien cobra o paga.
 *
 * El nonce se recorta porque el server acepta 60 caracteres y rechaza la vuelta
 * entera si se pasa: un `_id` de Mongo (24) + el instante (13) + un UUID (36)
 * daban 75, o sea un 400 mudo en cada tap. Se recorta el NONCE y no el id ni el
 * instante, que son los que hacen única a la clave; el doble tap accidental ya
 * lo frena `canRegisterCycle` con sus 20 segundos.
 */
const NONCE_CHARS = 12;

export function buildClientKey(tripId: string, at: number, nonce: string): string {
  return `${tripId}-${at}-${nonce.replace(/-/g, '').slice(0, NONCE_CHARS)}`;
}

/**
 * ¿Se puede registrar otra vuelta ahora?
 *
 * El doble tap accidental es el error más caro de esta pantalla: el botón es
 * enorme, el camión se mueve y el chofer lo toca con el pulgar. El server
 * también lo filtra, pero avisar acá le explica POR QUÉ no contó — desde el
 * server llegaría como un rechazo mudo.
 */
export function canRegisterCycle(params: {
  lastTapAt: number | null;
  now: number;
  isBusy: boolean;
}): boolean {
  if (params.isBusy) return false;
  if (params.lastTapAt === null) return true;
  return params.now - params.lastTapAt >= MIN_MS_BETWEEN_TAPS;
}

/** Segundos que faltan para poder registrar la siguiente. */
export function secondsUntilNextTap(lastTapAt: number | null, now: number): number {
  if (lastTapAt === null) return 0;
  return Math.max(0, Math.ceil((MIN_MS_BETWEEN_TAPS - (now - lastTapAt)) / 1000));
}

/**
 * Draft → cuerpo del ciclo.
 *
 * El m³ vacío viaja **ausente**, no como cero: la liquidación distingue «no se
 * midió» de «midió cero», y un cero inventado se convierte en una vuelta que no
 * se cobra.
 */
export function toCyclePayload(draft: CycleDraft, clientKey: string) {
  const m3 = Number(String(draft.m3).replace(',', '.'));
  const note = draft.note.trim();
  return {
    ...(Number.isFinite(m3) && m3 > 0 ? { m3 } : {}),
    ...(note ? { note } : {}),
    clientKey,
  };
}

/** Texto del contador: «7 vueltas» se lee de un vistazo; «7» solo, no. */
export function cyclesLabel(count: number): string {
  return count === 1 ? '1 vuelta' : `${count} vueltas`;
}
