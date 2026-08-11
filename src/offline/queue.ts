/**
 * Cola offline del conductor (Timón · A4). Motor PURO.
 *
 * En carretera no hay señal. Lo que esta cola guarda no son formularios sino
 * **hechos que ya ocurrieron**: una vuelta que el chofer dio, una entrega que
 * firmó, un choque que reportó. De ahí sale todo lo demás:
 *
 * - Perderlos es plata (una vuelta no cobrada) o una entrega sin constancia.
 * - Duplicarlos también es plata, así que cada acción viaja con su `clientKey`.
 * - Y **la cola nunca puede trabarse**: una sola acción atorada al frente
 *   dejaría al chofer sin poder registrar nada en todo el día. Por eso lo que
 *   el server rechaza para siempre se DESCARTA, y el orden solo se respeta
 *   dentro de un mismo viaje.
 */

export interface QueuedAction {
  /** El `clientKey` del tap: dos encolados iguales son UNA acción. */
  id: string;
  /** Qué cosa ordena a esta acción — hoy el viaje. Entre streams no hay orden. */
  stream: string;
  /** El cuerpo tal cual va al endpoint del conductor. */
  body: Record<string, unknown>;
  /** Lo que se le confirma al chofer cuando por fin salga. */
  label: string;
  createdAt: number;
  attempts: number;
  nextAttemptAt: number;
  /**
   * Si un 409 es éxito. Lo es para un HECHO (la vuelta ya estaba registrada),
   * pero NO para un avance de estado: ahí el 409 trae el motivo del bloqueo
   * —documento vencido, hallazgo crítico— y el chofer tiene que leerlo.
   */
  successOn409?: boolean;
  /**
   * A qué endpoint va. `driver` es el del viaje (por defecto) y `attendance` el
   * de la marca: la app tiene DOS superficies y una sola cola, porque lo que se
   * garantiza —que nada se pierda sin señal— es idéntico para las dos.
   */
  target?: 'driver' | 'attendance';
}

/** Qué hacer con una acción según lo que respondió el server. */
export type QueueOutcome = 'ok' | 'retry' | 'drop' | 'revoked';

/**
 * Techo de acciones guardadas. Es alto a propósito: una jornada por vueltas
 * puede acumular decenas sin señal, y quedarse corto significa perder plata.
 */
export const MAX_PENDING = 200;

const BASE_BACKOFF_MS = 5_000;
const MAX_BACKOFF_MS = 300_000;

/**
 * Espera creciente entre reintentos, con techo de 5 minutos: sin tope, tras una
 * noche sin señal el siguiente intento caería recién en varias horas.
 */
export function backoffMs(attempts: number): number {
  return Math.min(BASE_BACKOFF_MS * 2 ** Math.max(0, attempts - 1), MAX_BACKOFF_MS);
}

export function enqueue(
  queue: QueuedAction[],
  action: QueuedAction
): { queue: QueuedAction[]; accepted: boolean } {
  // El mismo tap encolado dos veces (el dedo insiste porque sin red no hay
  // feedback inmediato) tiene que ser UNA sola acción.
  if (queue.some((pending) => pending.id === action.id)) return { queue, accepted: true };
  // Llena: se rechaza lo NUEVO, nunca se descarta lo guardado. Lo guardado ya
  // ocurrió; lo nuevo el chofer todavía lo tiene en pantalla.
  if (queue.length >= MAX_PENDING) return { queue, accepted: false };
  return { queue: [...queue, action], accepted: true };
}

/**
 * La próxima acción a intentar.
 *
 * El orden se respeta **por viaje** (no se puede entregar antes de iniciar),
 * pero entre viajes no: un viaje esperando su reintento no puede frenar las
 * vueltas de otro. Esa es la regla anti-traba de toda la cola.
 */
export function nextReady(queue: QueuedAction[], now: number): QueuedAction | null {
  const bloqueados = new Set<string>();
  for (const action of queue) {
    if (bloqueados.has(action.stream)) continue;
    if (action.nextAttemptAt <= now) return action;
    bloqueados.add(action.stream);
  }
  return null;
}

/**
 * Cómo leer la respuesta del server.
 *
 * Los dos casos que no son obvios: un **409 es ÉXITO** (el server ya tenía el
 * hecho registrado, que es exactamente lo que se quería), y un rechazo
 * definitivo se DESCARTA en vez de reintentarse — reintentar un 400 para
 * siempre es cómo una cola se traba.
 */
export function classifyStatus(status: number, successOn409 = true): QueueOutcome {
  if (status === 401) return 'revoked';
  if (status === 409) return successOn409 ? 'ok' : 'drop';
  if (status >= 200 && status < 300) return 'ok';
  if (status === 429) return 'retry';
  if (status >= 400 && status < 500) return 'drop';
  return 'retry';
}

export function applyOutcome(
  queue: QueuedAction[],
  id: string,
  outcome: QueueOutcome,
  now: number
): QueuedAction[] {
  // Chofer o equipo dados de baja: no sincroniza nada de lo que tenía pendiente.
  if (outcome === 'revoked') return [];
  if (outcome === 'ok' || outcome === 'drop') return queue.filter((action) => action.id !== id);
  return queue.map((action) =>
    action.id === id
      ? {
          ...action,
          attempts: action.attempts + 1,
          nextAttemptAt: now + backoffMs(action.attempts + 1),
        }
      : action
  );
}

/** Volvió la señal: no tiene sentido seguir esperando el backoff. */
export function reviveAll(queue: QueuedAction[], now: number): QueuedAction[] {
  return queue.map((action) => ({ ...action, nextAttemptAt: now }));
}

/** Lo que ve el chofer. `null` = no hay nada que decirle. */
export function pendingLabel(count: number): string | null {
  if (count <= 0) return null;
  return count === 1 ? '1 acción sin enviar' : `${count} acciones sin enviar`;
}

/**
 * Lee la cola guardada en disco.
 *
 * Tolerante a propósito: si el archivo quedó a medias (la app murió escribiendo,
 * el sistema mató el proceso) la app tiene que **arrancar igual**. Una cola
 * corrupta que reviente el arranque deja al chofer sin app; perder lo pendiente
 * es malo, no poder trabajar es peor.
 */
export function parseQueue(raw: string | null | undefined): QueuedAction[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(isQueuedAction);
}

function isQueuedAction(value: unknown): value is QueuedAction {
  const action = value as Partial<QueuedAction> | null;
  return (
    typeof action?.id === 'string' &&
    typeof action.stream === 'string' &&
    typeof action.label === 'string' &&
    typeof action.body === 'object' &&
    action.body !== null &&
    typeof action.attempts === 'number' &&
    typeof action.nextAttemptAt === 'number'
  );
}
