import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { ApiError, postAttendanceMark, postDriverAction } from '../api/client';
import type { StoredCredential } from '../auth/credential';
import {
  applyOutcome,
  classifyStatus,
  enqueue,
  nextReady,
  reviveAll,
  type QueuedAction,
} from './queue';
import { readQueueFromDisk, writeQueueToDisk } from './store';

/**
 * El motor de la cola offline en marcha (Timón · A4).
 *
 * Reparte responsabilidades a propósito: `queue.ts` DECIDE (puro y testeado),
 * `store.ts` persiste, y esto solo mueve la manivela — cuándo intentar, cuándo
 * volver a intentar y cuándo avisar.
 *
 * La regla de producto que ordena todo: **el chofer nunca espera a la red**. Se
 * intenta enviar de una; si no se puede, el hecho queda guardado y la pantalla
 * lo dice. Nunca se le pierde un tap y nunca se le muestra un error por algo
 * que sí quedó registrado.
 */

/** Cada cuánto se despierta la cola mientras haya pendientes. */
const TICK_MS = 15_000;

export interface QueueSubmission {
  /** `ok` salió ahora mismo · `queued` quedó guardado · `failed` el server lo rechazó. */
  outcome: 'ok' | 'queued' | 'failed';
  message: string;
}

export function useOfflineQueue(credential: StoredCredential | null) {
  const [pending, setPending] = useState<QueuedAction[]>([]);
  /**
   * Lo que el server rechazó mientras el chofer no miraba. Si una entrega
   * firmada offline se cae por un documento vencido, tiene que enterarse al
   * abrir la app — descartarla en silencio sería peor que no encolarla.
   */
  const [lastFailure, setLastFailure] = useState<string | null>(null);
  const queueRef = useRef<QueuedAction[]>([]);
  const drainingRef = useRef(false);

  const commit = useCallback((queue: QueuedAction[]) => {
    queueRef.current = queue;
    setPending(queue);
    writeQueueToDisk(queue);
  }, []);

  // Lo pendiente de la sesión anterior: el teléfono pudo apagarse con la cola
  // llena y esos hechos siguen sin llegar al server.
  useEffect(() => {
    const guardada = readQueueFromDisk();
    queueRef.current = guardada;
    setPending(guardada);
  }, []);

  const drain = useCallback(async () => {
    if (drainingRef.current || !credential) return;
    drainingRef.current = true;
    try {
      let siguiente = nextReady(queueRef.current, Date.now());
      while (siguiente) {
        const { status, message } = await enviarUna(credential, siguiente);
        const decision = classifyStatus(status, siguiente.successOn409 !== false);
        if (decision === 'drop') setLastFailure(`${siguiente.label}: ${message}`);
        commit(applyOutcome(queueRef.current, siguiente.id, decision, Date.now()));
        // Sin red la siguiente daría igual: se corta la vuelta y se reintenta
        // en el próximo tick en vez de castigar la batería.
        if (status === 0) break;
        siguiente = nextReady(queueRef.current, Date.now());
      }
    } finally {
      drainingRef.current = false;
    }
  }, [commit, credential]);

  /**
   * Intenta AHORA y, si no se puede, guarda. Devuelve qué pasó para que la
   * pantalla diga la verdad: «enviado» y «se enviará» no son lo mismo.
   */
  const submit = useCallback(
    async (action: Omit<QueuedAction, 'createdAt' | 'attempts' | 'nextAttemptAt'>): Promise<QueueSubmission> => {
      if (!credential) return { outcome: 'failed', message: 'No hay sesión.' };
      try {
        await enviarSegunDestino(credential, action.target, action.body);
        return { outcome: 'ok', message: action.label };
      } catch (caught) {
        const status = caught instanceof ApiError ? caught.status : 0;
        const decision = classifyStatus(status, action.successOn409 !== false);
        if (decision === 'ok') return { outcome: 'ok', message: action.label };
        if (decision === 'drop' || decision === 'revoked') {
          if (decision === 'revoked') commit([]);
          return {
            outcome: 'failed',
            message: caught instanceof ApiError ? caught.message : 'No se pudo enviar.',
          };
        }
        const ahora = Date.now();
        const { queue, accepted } = enqueue(queueRef.current, {
          ...action,
          createdAt: ahora,
          attempts: 1,
          nextAttemptAt: ahora + TICK_MS,
        });
        commit(queue);
        return accepted
          ? { outcome: 'queued', message: 'Sin señal. Se enviará solo cuando vuelva.' }
          : { outcome: 'failed', message: 'Hay demasiado sin enviar. Busca señal.' };
      }
    },
    [commit, credential]
  );

  // Reintentos: un tick mientras haya pendientes, y un empujón al volver a la
  // app — que es cuando el chofer suele haber recuperado señal.
  useEffect(() => {
    if (pending.length === 0) return;
    const timer = setInterval(() => void drain(), TICK_MS);
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      commit(reviveAll(queueRef.current, Date.now()));
      void drain();
    });
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, [commit, drain, pending.length]);

  return { pending, submit, drain, lastFailure, clearFailure: () => setLastFailure(null) };
}

/** Una cola, dos superficies: el viaje y la marca de asistencia. */
function enviarSegunDestino(
  credential: StoredCredential,
  target: QueuedAction['target'],
  body: Record<string, unknown>
): Promise<unknown> {
  return target === 'attendance'
    ? postAttendanceMark(credential, body)
    : postDriverAction(credential, body);
}

/** Devuelve el status crudo (0 = no hubo respuesta) y el motivo del server. */
async function enviarUna(
  credential: StoredCredential,
  action: QueuedAction
): Promise<{ status: number; message: string }> {
  try {
    await enviarSegunDestino(credential, action.target, action.body);
    return { status: 200, message: '' };
  } catch (caught) {
    if (caught instanceof ApiError) return { status: caught.status, message: caught.message };
    return { status: 0, message: 'Sin señal.' };
  }
}
