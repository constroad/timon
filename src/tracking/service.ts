import { Platform } from 'react-native';
import * as Battery from 'expo-battery';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { addPoint, type BufferedPoint } from './buffer';
import { resolveSampling, type SamplingConfig } from './policy';
import { type PermissionState, type TrackingPlatform } from './permission';
import { readBufferFromDisk, writeBufferToDisk } from './store';

/**
 * El servicio de ubicación en segundo plano (Timón · A5 §4).
 *
 * **Es la razón por la que esta app existe.** En una PWA no se puede tomar la
 * ubicación con la app en segundo plano (probado; memoria
 * `pwa-background-gps-impossible`), y sin eso el cliente no ve dónde va su carga
 * en cuanto el chofer bloquea la pantalla.
 *
 * Dos decisiones que ordenan todo el archivo:
 *
 * 1. **Se rastrea solo entre «iniciar viaje» y «entregado».** Nunca fuera. Un
 *    chofer que ve la app tomando GPS un domingo la desinstala, y tiene razón.
 * 2. **El servicio escribe a DISCO, no a la interfaz.** La tarea corre fuera de
 *    la app y puede seguir viva con el proceso de la UI muerto; mandarle los
 *    puntos por estado de React perdería el tramo en cada muerte del proceso.
 */

export const LOCATION_TASK = 'timon-rastro-viaje';

/**
 * La notificación NO es decorativa: sin ella Android mata el servicio a los
 * minutos (§4.4-1) y el rastro se corta sin que nadie se entere. Y de paso es
 * lo que hace honesto el rastreo — el chofer ve siempre que está compartiendo.
 */
const FOREGROUND_SERVICE = {
  notificationTitle: 'Timón · viaje en curso',
  // No nombra a la oficina: esta notificación es lo que el chofer tiene en la
  // barra TODO el viaje, y ahí «te estamos viendo» se lee como una amenaza.
  notificationBody: 'Registrando el recorrido del viaje',
  notificationColor: '#16A97A',
};

TaskManager.defineTask(LOCATION_TASK, async ({ data, error }) => {
  if (error || !data) return;
  const { locations } = data as { locations?: Location.LocationObject[] };
  if (!Array.isArray(locations) || locations.length === 0) return;

  // Se lee y se escribe el disco en cada entrega: el proceso de esta tarea
  // puede morir entre una y otra, así que no hay estado que conservar.
  let buffer = readBufferFromDisk();
  for (const fix of locations) {
    buffer = addPoint(buffer, toBufferedPoint(fix));
  }
  writeBufferToDisk(buffer);
});

/**
 * Pide los permisos y responde si alcanzan para rastrear con la pantalla
 * apagada.
 *
 * **En Android alcanza con «mientras uso la app»**: el servicio en primer plano
 * de arriba hace que el sistema considere la app en uso mientras corre. Pedir
 * «todo el tiempo» igual vale la pena —es un permiso más—, pero **negarlo no
 * puede bloquear el arranque**: así estaba y el resultado era que el chofer
 * elegía la opción normal del diálogo y la app no rastreaba absolutamente nada.
 *
 * iOS sí necesita «Siempre»: ahí no hay servicio en primer plano que lo supla.
 */
export async function ensureTrackingPermission(): Promise<PermissionState> {
  const enUso = await Location.requestForegroundPermissionsAsync();
  const platform: TrackingPlatform = Platform.OS === 'ios' ? 'ios' : 'android';
  if (!enUso.granted) {
    return { platform, foregroundGranted: false, backgroundGranted: false };
  }
  // iOS concede «Siempre» recién después, y a veces días más tarde (§4.7-2).
  const siempre = await Location.requestBackgroundPermissionsAsync().catch(() => null);
  return { platform, foregroundGranted: true, backgroundGranted: siempre?.granted === true };
}

/**
 * Cuánto se espera un fix antes de darlo por imposible.
 *
 * **Existe porque `getCurrentPositionAsync` puede no resolver NUNCA** (visto en
 * el emulador con la ubicación prendida y sin proveedor que responda): sin tope,
 * el botón de iniciar se queda en «Guardando…» para siempre y el chofer no tiene
 * forma de salir de ahí. Un bloqueo que no responde es peor que un bloqueo.
 */
const FIX_TIMEOUT_MS = 15_000;

/**
 * Un fix AHORA, para el bloqueo de arranque (§4.6-2).
 *
 * No alcanza con el permiso concedido: un teléfono con el GPS del sistema
 * apagado tiene el permiso dado y no da posición. Lo que habilita la salida es
 * un fix real.
 *
 * Si el fix fresco no llega a tiempo se usa el ÚLTIMO CONOCIDO. No es una
 * concesión: el server igual le exige frescura (10 minutos), así que un
 * último-conocido de hace horas no habilita nada — pero uno de hace dos minutos
 * prueba lo mismo que el fresco, que el GPS está funcionando, y evita que un
 * camión se quede sin salir bajo el techo de la cochera.
 */
export async function getCurrentFix(): Promise<BufferedPoint | null> {
  try {
    const enUso = await Location.getForegroundPermissionsAsync();
    if (!enUso.granted) {
      const pedido = await Location.requestForegroundPermissionsAsync();
      if (!pedido.granted) return null;
    }
    const fresco = await conTope(
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High })
    );
    if (fresco) return toBufferedPoint(fresco);

    const ultimo = await conTope(Location.getLastKnownPositionAsync());
    return ultimo ? toBufferedPoint(ultimo) : null;
  } catch {
    // GPS del sistema apagado, sin satélites bajo techo: no hay posición, y eso
    // es exactamente lo que el bloqueo tiene que ver.
    return null;
  }
}

/** `null` si tardó de más. Nunca rechaza: acá «sin posición» no es un error. */
function conTope(
  promesa: Promise<Location.LocationObject | null>
): Promise<Location.LocationObject | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), FIX_TIMEOUT_MS);
    promesa
      .then((valor) => {
        clearTimeout(timer);
        resolve(valor);
      })
      .catch(() => {
        clearTimeout(timer);
        resolve(null);
      });
  });
}

/**
 * Arranca el rastreo. Devuelve `false` SOLO si de verdad no se puede rastrear
 * (sin permiso de ubicación), no si falta el permiso «todo el tiempo».
 */
export async function startTracking(config?: SamplingConfig): Promise<boolean> {
  const permisos = await ensureTrackingPermission();
  if (!permisos.foregroundGranted) return false;
  if (await isTracking()) return true;

  const bateria = await batteryLevelSafe();
  const { intervalMs, distanceM } = resolveSampling({
    stoppedMinutes: 0,
    batteryLevel: bateria,
    config,
  });

  // iOS sin «Siempre» rechaza el arranque en segundo plano. No puede tumbar la
  // pantalla: se reporta que no arrancó y el aviso de permisos explica por qué.
  try {
    await Location.startLocationUpdatesAsync(LOCATION_TASK, {
      // `High` se alimenta del GPS. `Balanced` usa wifi y antenas de celular, que
      // en la carretera no existen: ahí su «precisión» son kilómetros. Para un
      // camión entre ciudades el GPS no es un lujo, es la única fuente real.
      accuracy: Location.Accuracy.High,
      timeInterval: intervalMs,
      distanceInterval: distanceM,
      // Doze agrupa despertares (§4.4-2): esto pide que los entregue igual, aun
      // en ráfagas, en vez de perderlos.
      deferredUpdatesInterval: intervalMs,
      pausesUpdatesAutomatically: false,
      showsBackgroundLocationIndicator: true,
      foregroundService: FOREGROUND_SERVICE,
    });
  } catch {
    return false;
  }
  return true;
}

export async function stopTracking(): Promise<void> {
  if (!(await isTracking())) return;
  await Location.stopLocationUpdatesAsync(LOCATION_TASK);
}

export async function isTracking(): Promise<boolean> {
  try {
    return await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK);
  } catch {
    return false;
  }
}

async function batteryLevelSafe(): Promise<number | undefined> {
  try {
    const nivel = await Battery.getBatteryLevelAsync();
    return nivel >= 0 ? nivel : undefined;
  } catch {
    return undefined;
  }
}

function toBufferedPoint(fix: Location.LocationObject): BufferedPoint {
  const at = new Date(fix.timestamp).toISOString();
  return {
    // El id local es lo que hace idempotente al reintento del lote: mismo
    // instante y mismo punto = el mismo fix, aunque se reenvíe tres veces.
    id: `${fix.timestamp}-${fix.coords.latitude.toFixed(5)}-${fix.coords.longitude.toFixed(5)}`,
    lat: fix.coords.latitude,
    lng: fix.coords.longitude,
    at,
    ...(typeof fix.coords.accuracy === 'number' ? { accuracyM: fix.coords.accuracy } : {}),
    ...(typeof fix.coords.speed === 'number' && fix.coords.speed >= 0
      ? { speedKph: fix.coords.speed * 3.6 }
      : {}),
    ...(typeof fix.coords.heading === 'number' && fix.coords.heading >= 0
      ? { headingDeg: fix.coords.heading }
      : {}),
    // No se descarta: un rastro falseado es un problema de personas y el dato
    // tiene que quedar para poder mostrarlo (§4.3-4).
    ...(fix.mocked ? { isMocked: true } : {}),
  };
}
