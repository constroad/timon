import type { OnboardingCompany } from '../onboarding/machine';
import type { StoredCredential } from '../auth/credential';
import type { PortalTrip, TripStatus } from '../trips/focus';
import type { ChecklistAnswer, ChecklistItem } from '../trips/checklist';

/**
 * Cliente de la API de Portal (Timón · A1).
 *
 * La URL base **no se compila**: sale de `EXPO_PUBLIC_API_URL`. Un APK que se
 * distribuye a mano se actualiza tarde y mal, así que apuntar a otro entorno no
 * puede exigir un binario nuevo.
 */

const BASE_URL = (process.env.EXPO_PUBLIC_API_URL ?? 'https://www.constroad.com').replace(/\/+$/, '');

/**
 * LilaStore: de dónde sale la versión mínima y el APK.
 *
 * **Se fija acá y no se hereda del `.env`**, por la misma razón que `API_URL` en
 * `scripts/build-apk.sh`: un release compilado con el entorno de desarrollo
 * apuntaría al emulador, se instalaría perfecto y fallaría en la mano del chofer
 * con el wifi andando. El override existe solo para probar contra una LilaStore
 * local.
 */
const STORE_URL = (
  process.env.EXPO_PUBLIC_STORE_URL ?? 'https://lilastore.constroad.com'
).replace(/\/+$/, '');

/** Cómo se llama esta app EN LilaStore. Es la clave de la ruta, no un rótulo. */
const SLUG = 'timon';

/** Cota de paciencia. Más allá de esto el chofer ya volvió a tocar el botón. */
const TIMEOUT_MS = 12_000;

/**
 * Error con el mensaje **que se le muestra al chofer**. El server ya responde en
 * su idioma y pensando en él («Ese código no existe. Revísalo con tu empresa»),
 * así que no se traduce ni se decora: se muestra tal cual.
 */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Sin red no hay alta, y hay que decirlo con esas palabras. */
const SIN_RED = 'Sin conexión. Revisa tus datos o el wifi e intenta de nuevo.';

/**
 * Headers con los que la app se identifica en el portal del conductor.
 *
 * Van en HEADERS y no en la query porque el portal se lee con GET: un secreto en
 * la query queda escrito en los logs de acceso de cualquier proxy.
 */
const credentialHeaders = (credential: StoredCredential) => ({
  'x-timon-company': credential.companyId,
  'x-timon-device': credential.deviceId,
  'x-timon-secret': credential.deviceSecret,
});

export interface PortalPayload {
  companyName: string;
  companyLogoUrl?: string;
  driverName: string;
  scope: 'driver' | 'trip';
  trips: PortalTrip[];
  /** Catálogo del checklist, configurable por empresa. */
  checklist?: ChecklistItem[];
}

/**
 * Avanza el estado de un viaje (Timón · A3).
 *
 * El 409 se propaga tal cual con su mensaje: el server rechaza la salida cuando
 * un documento está vencido o un punto crítico del checklist falló, y **esa
 * explicación es la que el chofer necesita leer**. Traducirla acá a un «no se
 * pudo» le quitaría lo único útil que tiene.
 */
export async function advanceTrip(
  credential: StoredCredential,
  body: {
    tripId: string;
    toStatus: TripStatus;
    checklist?: ChecklistAnswer[];
    pod?: { receiverName: string; signatureDataUrl: string; receiverDni?: string };
  }
): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(`${BASE_URL}/api/public/fleet/driver`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...credentialHeaders(credential) },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch {
    throw new ApiError(SIN_RED, 0);
  } finally {
    clearTimeout(timer);
  }
  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { message?: string };
    throw new ApiError(payload.message || 'No se pudo actualizar el viaje.', response.status);
  }
}

/** Mis viajes. El mismo endpoint que usa el portal web, con la otra identidad. */
export async function fetchPortal(credential: StoredCredential): Promise<PortalPayload> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(`${BASE_URL}/api/public/fleet/driver`, {
      headers: credentialHeaders(credential),
      signal: controller.signal,
    });
  } catch {
    throw new ApiError(SIN_RED, 0);
  } finally {
    clearTimeout(timer);
  }
  const payload = (await response.json().catch(() => ({}))) as PortalPayload & { message?: string };
  if (!response.ok) {
    throw new ApiError(payload.message || 'No se pudieron cargar tus viajes.', response.status);
  }
  return payload;
}

async function post<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch {
    // Abort por timeout y caída de red se ven igual desde acá, y para el chofer
    // significan lo mismo: no llegó.
    throw new ApiError(SIN_RED, 0);
  } finally {
    clearTimeout(timer);
  }

  const payload = (await response.json().catch(() => ({}))) as { message?: string };
  if (!response.ok) {
    throw new ApiError(payload.message || 'No se pudo completar. Intenta de nuevo.', response.status);
  }
  return payload as T;
}

/** Paso 1: el código dice a qué empresa pertenece este teléfono. */
export const resolveCompany = (code: string) =>
  post<{ company: OnboardingCompany }>('/api/public/app/company', { code });

/** Paso 3: pide el código de 6 dígitos por WhatsApp. */
export const requestOtp = (params: { code: string; phone: string }) =>
  post<{ message: string }>('/api/public/app/otp?action=request', params);

/**
 * Paso 4: canjea el código y da de alta el equipo.
 *
 * El `secret` lo genera el teléfono y **no vuelve** en la respuesta: el server
 * solo guarda su hash. Es lo que hace que un log del servidor no contenga la
 * llave de nadie.
 */
export const verifyOtp = (params: {
  code: string;
  phone: string;
  otp: string;
  device: { id: string; secret: string; name: string };
}) =>
  post<{
    verified: boolean;
    company: OnboardingCompany;
    driver: { name: string } | null;
    credential: { deviceId: string; status: string } | null;
  }>('/api/public/app/otp?action=verify', params);

/**
 * Registra una vuelta o manda un reporte del chofer.
 *
 * Los dos van por el MISMO endpoint del portal: el server distingue por la
 * forma del cuerpo. Se reusa `advanceTrip` como base para no tener tres
 * clientes distintos que enviar y mantener.
 */
export async function postDriverAction(
  credential: StoredCredential,
  body: Record<string, unknown>
): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(`${BASE_URL}/api/public/fleet/driver`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...credentialHeaders(credential) },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch {
    throw new ApiError(SIN_RED, 0);
  } finally {
    clearTimeout(timer);
  }
  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { message?: string };
    throw new ApiError(payload.message || 'No se pudo enviar.', response.status);
  }
}

/** «¿Sigo siendo yo?» — al abrir la app. */
export const checkSession = (params: {
  companyId: string;
  deviceId: string;
  deviceSecret: string;
}) =>
  post<{
    company: OnboardingCompany;
    driver: { id: string; name: string };
    capabilities: { trips: boolean; attendance: boolean };
  }>('/api/public/app/session', params);

/**
 * Sube un lote del rastro (Timón · A5 · S3).
 *
 * Devuelve cuántos puntos aceptó el server. Un lote rechazado entero NO se
 * reintenta a ciegas: los motivos vienen en `rejected` y el cliente los usa para
 * descartar lo que nunca va a entrar (impreciso, viejo, duplicado).
 */
export async function postPositions(
  credential: StoredCredential,
  body: { tripId: string; points: unknown[] }
): Promise<{ accepted: number }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(`${BASE_URL}/api/public/app/positions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...credentialHeaders(credential) },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch {
    throw new ApiError(SIN_RED, 0);
  } finally {
    clearTimeout(timer);
  }
  const payload = (await response.json().catch(() => ({}))) as {
    accepted?: number;
    message?: string;
  };
  if (!response.ok) throw new ApiError(payload.message || 'No se pudo subir el rastro.', response.status);
  return { accepted: Number(payload.accepted ?? 0) };
}

export interface AttendanceToday {
  linked: boolean;
  message?: string;
  nextAction?: 'entry' | 'lunch-start' | 'lunch-end' | 'exit' | 'closed';
  actionLabel?: string | null;
  statusLabel?: string;
  employeeName?: string;
  startTime?: string;
  endTime?: string;
}

export async function fetchAttendanceToday(
  credential: StoredCredential
): Promise<AttendanceToday> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(`${BASE_URL}/api/public/app/attendance`, {
      headers: credentialHeaders(credential),
      signal: controller.signal,
    });
  } catch {
    throw new ApiError(SIN_RED, 0);
  } finally {
    clearTimeout(timer);
  }
  const payload = (await response.json().catch(() => ({}))) as AttendanceToday & { message?: string };
  if (!response.ok) throw new ApiError(payload.message || 'No se pudo cargar tu asistencia.', response.status);
  return payload;
}

/**
 * Registra una marca. El **409 es ÉXITO** para la cola: significa que el hecho
 * ya estaba registrado, que es exactamente lo que se buscaba.
 */
export async function postAttendanceMark(
  credential: StoredCredential,
  body: Record<string, unknown>
): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(`${BASE_URL}/api/public/app/attendance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...credentialHeaders(credential) },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch {
    throw new ApiError(SIN_RED, 0);
  } finally {
    clearTimeout(timer);
  }
  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { message?: string };
    throw new ApiError(payload.message || 'No se pudo registrar tu marca.', response.status);
  }
}

/**
 * Versión mínima soportada (A7). Sin autenticar: el bloqueo tiene que poder
 * mostrarse ANTES del alta. Si falla, devuelve vacío — no saber no bloquea.
 *
 * **Desde el 19/08/2026 pregunta a LilaStore, no a Portal.** Era la otra mitad
 * del camino del Google Drive: el APK se subía al Drive y el mínimo se escribía
 * en `systemSettings` de Portal con un script. Ahora las dos cosas las hace
 * `lila apk publish --obligar`, en un solo acto y contra el mismo server que
 * guarda el binario — el estado intermedio (APK nuevo, mínimo viejo) deja de
 * poder existir.
 *
 * `downloadUrl` viene **vacía si Timón está marcada como privada** en LilaStore:
 * `/d/<release>` solo sirve sin credencial a las apps públicas. Con la URL
 * vacía la pantalla de bloqueo sigue avisando, pero sin el botón que baja el APK
 * ahí mismo — hay que actualizar desde LilaStore.
 */
export async function fetchMinVersion(): Promise<{ minVersion: string; downloadUrl: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(`${STORE_URL}/api/v1/apps/${SLUG}/min-version`, {
      signal: controller.signal,
    });
    const payload = (await response.json().catch(() => ({}))) as {
      minVersion?: string;
      downloadUrl?: string;
    };
    return {
      minVersion: String(payload.minVersion ?? ''),
      downloadUrl: String(payload.downloadUrl ?? ''),
    };
  } catch {
    return { minVersion: '', downloadUrl: '' };
  } finally {
    clearTimeout(timer);
  }
}
