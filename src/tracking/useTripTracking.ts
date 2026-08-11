import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { ApiError, postPositions } from '../api/client';
import type { StoredCredential } from '../auth/credential';
import { dropSent, takeBatch } from './buffer';
import { readBufferFromDisk, writeBufferToDisk } from './store';
import { isTracking, startTracking, stopTracking } from './service';

/**
 * Ata el rastro al VIAJE (Timón · A5 §4.2).
 *
 * La regla que ordena todo: **se rastrea solo entre «iniciar viaje» y
 * «entregado»**. No hay un interruptor de rastreo — el interruptor es el estado
 * del viaje, y por eso el servicio arranca y se detiene solo. Un chofer que ve
 * la app tomando GPS un domingo la desinstala, y tiene razón.
 *
 * De acá salen gratis dos edge cases del spec: el viaje cancelado desde la
 * oficina apaga el servicio en el siguiente refresco (§4.4-9), y un teléfono que
 * se reinició a mitad de viaje lo vuelve a levantar al abrir la app (§4.4-4).
 */

/** Cada cuánto se intenta subir lo juntado. Con red, casi siempre son pocos. */
const UPLOAD_MS = 300_000;

export function useTripTracking(params: {
  credential: StoredCredential | null;
  /** El viaje en curso, o `null` si no hay ninguno. */
  activeTripId: string | null;
  isRunning: boolean;
}) {
  const { credential, activeTripId, isRunning } = params;
  const [isSharing, setSharing] = useState(false);
  /** Por qué no está subiendo el rastro. `null` = va bien. */
  const [lastUploadError, setLastUploadError] = useState<string | null>(null);
  const uploadingRef = useRef(false);

  const upload = useCallback(async () => {
    if (uploadingRef.current || !credential || !activeTripId) return;
    uploadingRef.current = true;
    try {
      const buffer = readBufferFromDisk();
      const lote = takeBatch(buffer);
      if (lote.length === 0) return;
      await postPositions(credential, { tripId: activeTripId, points: lote });
      setLastUploadError(null);
      // Se descuenta por ID y se relee el disco: mientras el lote viajaba el
      // servicio siguió escribiendo, y cortar por posición se los llevaría.
      writeBufferToDisk(dropSent(readBufferFromDisk(), lote));
    } catch (caught) {
      // Sin red el rastro se queda en disco y se reintenta. Perderlo por un
      // error de subida sería perder el tramo entero.
      //
      // Pero NO se traga en silencio: un rastro que dejó de subir es invisible
      // —la app se ve normal, el chofer maneja tranquilo y la torre no lo ve—.
      // Se expone para que la pantalla pueda decirlo y para que quede en el log.
      const motivo = caught instanceof ApiError ? `${caught.status} ${caught.message}` : 'sin red';
      setLastUploadError(motivo);
      console.warn('[timon] rastro sin subir:', motivo);
    } finally {
      uploadingRef.current = false;
    }
  }, [activeTripId, credential]);

  // Arranque y parada: los manda el estado del viaje, nadie más.
  useEffect(() => {
    let vivo = true;
    (async () => {
      if (isRunning && activeTripId) {
        const arrancó = await startTracking();
        if (vivo) setSharing(arrancó);
        return;
      }
      await stopTracking();
      if (vivo) setSharing(false);
    })();
    return () => {
      vivo = false;
    };
  }, [activeTripId, isRunning]);

  // Subida periódica, más un empujón al volver a la app: es cuando el chofer
  // suele haber recuperado señal.
  useEffect(() => {
    if (!isRunning) return;
    void upload();
    const timer = setInterval(() => void upload(), UPLOAD_MS);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void upload();
    });
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, [isRunning, upload]);

  // Si el sistema mató el servicio (matadores de OEM, §4.4-3) la app lo nota al
  // volver al frente y lo vuelve a levantar.
  useEffect(() => {
    const sub = AppState.addEventListener('change', async (state) => {
      if (state !== 'active' || !isRunning || !activeTripId) return;
      const vivo = await isTracking();
      if (!vivo) setSharing(await startTracking());
    });
    return () => sub.remove();
  }, [activeTripId, isRunning]);

  return { isSharing, upload, lastUploadError };
}
