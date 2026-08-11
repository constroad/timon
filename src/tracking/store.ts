import { File, Paths } from 'expo-file-system';
import { parseBuffer, type BufferedPoint } from './buffer';

/**
 * El rastro pendiente, en disco (Timón · A5 §4.4-5).
 *
 * En disco y no en memoria por una razón concreta: **el servicio de ubicación
 * corre fuera de la app**. Android puede matar el proceso de la interfaz y
 * seguir entregando fixes al servicio; si el buffer viviera en un `useState`,
 * cada muerte del proceso se llevaría el rastro del tramo.
 *
 * Mismo patrón que la cola offline: API síncrona para que dos escrituras no
 * dejen el archivo a medias, y todo error se traga — quedarse sin app es peor
 * que quedarse sin rastro.
 */

const FILE_NAME = 'rastro-pendiente.json';

const bufferFile = (): File => new File(Paths.document, FILE_NAME);

export function readBufferFromDisk(): BufferedPoint[] {
  try {
    const file = bufferFile();
    if (!file.exists) return [];
    return parseBuffer(file.textSync());
  } catch {
    return [];
  }
}

export function writeBufferToDisk(points: BufferedPoint[]): void {
  try {
    const file = bufferFile();
    if (!file.exists) file.create({ overwrite: true });
    file.write(JSON.stringify(points));
  } catch {
    // Sin disco no hay nada que hacer, pero el viaje sigue.
  }
}
