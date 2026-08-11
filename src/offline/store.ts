import { File, Paths } from 'expo-file-system';
import { parseQueue, type QueuedAction } from './queue';

/**
 * La cola, en disco (Timón · A4).
 *
 * Un archivo JSON en el directorio de documentos, que es el que **sobrevive** a
 * que el sistema libere espacio (a diferencia de la caché). Lo que hay acá son
 * hechos que ya ocurrieron: si el teléfono se apaga con la cola llena, al
 * encender tienen que seguir estando.
 *
 * Se usa la API **síncrona** a propósito: escribir la cola es el paso final de
 * cada tap y dos escrituras solapadas dejarían el archivo a medias. Con `File`
 * en vez de un almacén clave-valor no hay techo de tamaño que preocupe — una
 * firma pesa hasta 400 KB.
 *
 * Este módulo es SOLO entrada/salida: toda la decisión vive en `queue.ts`.
 */

const FILE_NAME = 'cola-offline.json';

const queueFile = (): File => new File(Paths.document, FILE_NAME);

export function readQueueFromDisk(): QueuedAction[] {
  try {
    const file = queueFile();
    if (!file.exists) return [];
    return parseQueue(file.textSync());
  } catch {
    // Disco lleno, permisos, archivo ilegible: la app arranca igual. Quedarse
    // sin app es peor que quedarse sin lo pendiente.
    return [];
  }
}

export function writeQueueToDisk(queue: QueuedAction[]): void {
  try {
    const file = queueFile();
    if (!file.exists) file.create({ overwrite: true });
    file.write(JSON.stringify(queue));
  } catch {
    // No se pudo persistir. La cola sigue viva en memoria y se reintenta en la
    // próxima escritura; romper el tap del chofer por esto no ayuda a nadie.
  }
}
