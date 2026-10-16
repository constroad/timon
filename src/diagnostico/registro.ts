import { File, Paths } from 'expo-file-system';
import * as Crypto from 'expo-crypto';
import appConfig from '../../app.json';
import {
  agregar,
  cuerpoDeReporte,
  entradaDeError,
  entradaDePerf,
  parsearBuffer,
  type EntradaDiagnostico,
} from './diagnostico';

/**
 * Diagnóstico de Timón — la parte IMPURA: archivo, captura global y envío.
 *
 * Timón no tiene AsyncStorage; el buffer vive en un JSON del directorio de
 * documentos con la API síncrona de `expo-file-system`, igual que la cola
 * offline (`offline/store.ts`). «Enviar problema» lo sube a LilaStore —el hub
 * que ya conoce la app— y nada se manda solo (regla
 * `nada-se-manda-sin-que-lo-enciendan`): lo dispara el chofer desde el menú.
 */

const ARCHIVO = 'diagnostico.json';
const ARCHIVO_INSTALL = 'diagnostico-install.txt';
const TIENDA = 'https://lilastore.constroad.com';
const MAX_ENTRADAS_PERSIST = 200;
const DEBOUNCE_MS = 400;

/** El slug de LilaStore es el de `app.json` (como Lilafotos con `fotos`): una sola fuente. */
const SLUG = appConfig.expo.slug;
const VERSION = appConfig.expo.version;
const VERSION_CODE = appConfig.expo.android.versionCode;

let buffer: EntradaDiagnostico[] = [];
let cargado = false;

const archivoBuffer = (): File => new File(Paths.document, ARCHIVO);

function cargar(): void {
  if (cargado) return;
  cargado = true;
  try {
    const file = archivoBuffer();
    if (!file.exists) return;
    buffer = parsearBuffer(JSON.parse(file.textSync()), MAX_ENTRADAS_PERSIST);
  } catch {
    // Disco lleno, permisos, archivo ilegible: arranca vacío. Quedarse sin app
    // por un log corrupto es peor que quedarse sin el log.
  }
}

let pendiente: ReturnType<typeof setTimeout> | null = null;
function persistir(): void {
  // Se agrupa: una ráfaga de errores no escribe el disco en cada uno.
  if (pendiente) return;
  pendiente = setTimeout(() => {
    pendiente = null;
    try {
      const file = archivoBuffer();
      if (!file.exists) file.create({ overwrite: true });
      file.write(JSON.stringify(buffer));
    } catch {
      // No se pudo persistir: el buffer sigue en memoria y se reintenta.
    }
  }, DEBOUNCE_MS);
}

export function registrarError(valor: unknown, origen?: string): void {
  cargar();
  buffer = agregar(buffer, entradaDeError(valor, origen));
  persistir();
}

export function registrarPerf(op: string, ms: number, extra?: Record<string, number>): void {
  cargar();
  buffer = agregar(buffer, entradaDePerf(op, ms, extra));
  persistir();
}

/** Cronómetro de una operación async: anota cuánto tardó, pase lo que pase. */
export async function medir<T>(op: string, fn: () => Promise<T>, extra?: Record<string, number>): Promise<T> {
  const t0 = Date.now();
  try {
    return await fn();
  } finally {
    registrarPerf(op, Date.now() - t0, extra);
  }
}

/** Igual pero para una función SÍNCRONA: no bloquea más de lo que ya tardaba. */
export function medirSync<T>(op: string, fn: () => T, extra?: Record<string, number>): T {
  const t0 = Date.now();
  try {
    return fn();
  } finally {
    registrarPerf(op, Date.now() - t0, extra);
  }
}

type ManejadorGlobal = (error: unknown, fatal?: boolean) => void;

/**
 * Engancha el handler global de RN: lo que no se atrapa cae acá, queda en el
 * log y DESPUÉS se encadena al handler original para que la app siga igual. Se
 * llama UNA vez al arrancar, en `index.ts`.
 */
export function instalarCapturaGlobal(): void {
  const utils = (
    globalThis as {
      ErrorUtils?: { getGlobalHandler?: () => ManejadorGlobal; setGlobalHandler?: (h: ManejadorGlobal) => void };
    }
  ).ErrorUtils;
  if (!utils?.setGlobalHandler) return;
  const anterior = utils.getGlobalHandler?.();
  utils.setGlobalHandler((error, fatal) => {
    registrarError(error, fatal ? 'fatal' : 'global');
    anterior?.(error, fatal);
  });
}

export function leerDiagnostico(): EntradaDiagnostico[] {
  cargar();
  return [...buffer];
}

export function limpiarDiagnostico(): void {
  buffer = [];
  try {
    const file = archivoBuffer();
    if (file.exists) file.delete();
  } catch {
    // No se pudo borrar el archivo: el buffer en memoria ya quedó vacío.
  }
}

/**
 * Un id de instalación ANÓNIMO, creado una vez y guardado. No es el `deviceId`
 * de la credencial (ese es secreto y va en el llavero): solo agrupa los
 * reportes de ESTE teléfono, sin nada que identifique a la persona.
 */
function idDeInstalacion(): string {
  const file = new File(Paths.document, ARCHIVO_INSTALL);
  try {
    if (file.exists) {
      const guardado = file.textSync().trim();
      if (guardado) return guardado;
    }
  } catch {
    // sigue y genera uno nuevo
  }
  const nuevo = Crypto.randomUUID();
  try {
    if (!file.exists) file.create({ overwrite: true });
    file.write(nuevo);
  } catch {
    // Si no se pudo guardar, igual se devuelve: un id efímero es mejor que nada.
  }
  return nuevo;
}

export type EnvioDiagnostico = { ok: true } | { ok: false; motivo: 'vacio' | 'sin_red' | 'rechazado' };

/** Manda el buffer a LilaStore. No borra nada local: el chofer puede reintentar. */
export async function enviarDiagnostico(): Promise<EnvioDiagnostico> {
  const entradas = leerDiagnostico();
  if (entradas.length === 0) return { ok: false, motivo: 'vacio' };
  const cuerpo = cuerpoDeReporte(entradas, {
    slug: SLUG,
    installId: idDeInstalacion(),
    version: VERSION,
    versionCode: VERSION_CODE,
  });
  try {
    const respuesta = await fetch(`${TIENDA}/api/v1/report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cuerpo),
      signal: AbortSignal.timeout(12_000),
    });
    return respuesta.ok ? { ok: true } : { ok: false, motivo: 'rechazado' };
  } catch {
    return { ok: false, motivo: 'sin_red' };
  }
}
