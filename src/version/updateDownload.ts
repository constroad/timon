/**
 * Motor de la descarga de la actualización (A7 §6-2).
 *
 * Vive aparte del componente porque son decisiones, no pintura: cómo se llama
 * el archivo que hay que guardar (el instalador de Android **exige** que
 * termine en `.apk`), qué porcentaje mostrar cuando el server no dice el
 * tamaño, y qué explicarle al chofer cuando el sistema bloquea la instalación.
 */

/** Nombre con el que se guarda el APK. Siempre termina en `.apk`. */
export const apkFileName = (url: string): string => {
  const sinQuery = String(url ?? '').split(/[?#]/)[0];
  const ultimo = sinQuery.split('/').filter(Boolean).pop() ?? '';
  return ultimo.toLowerCase().endsWith('.apk') ? ultimo : 'timon-update.apk';
};

/** 0..1, o `null` si el server no mandó el tamaño: mejor sin barra que con una inventada. */
export const downloadRatio = (progress: {
  totalBytesWritten: number;
  totalBytesExpectedToWrite: number;
}): number | null => {
  const total = progress.totalBytesExpectedToWrite;
  if (!total || total <= 0) return null;
  return Math.min(1, progress.totalBytesWritten / total);
};

/**
 * Qué decirle al chofer si el instalador no abre.
 *
 * El caso real es Android pidiendo el permiso «instalar apps desconocidas»: sin
 * nombrarlo, el chofer ve «no se pudo» y se queda ahí. Con el camino escrito lo
 * resuelve solo.
 */
export const resolveInstallHint = (error: unknown): string => {
  const mensaje = error instanceof Error ? error.message : String(error ?? '');
  if (/INSTALL_PACKAGES|permission/i.test(mensaje)) {
    return 'Android pide permiso para instalar apps desde Timón. Acepta el aviso, o actívalo en Ajustes › Apps › Timón › Instalar apps desconocidas.';
  }
  return 'No se pudo abrir el instalador. Busca el archivo descargado y ábrelo desde el teléfono.';
};
