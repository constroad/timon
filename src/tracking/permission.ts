/**
 * Qué permiso hace falta DE VERDAD para rastrear (Timón · A5 §4). Motor PURO.
 *
 * **El defecto que corrige.** El arranque exigía `ACCESS_BACKGROUND_LOCATION`
 * («Permitir todo el tiempo») y, si el chofer elegía «solo mientras uso la app»
 * —que es lo que elige cualquiera—, `startTracking` devolvía `false` y la app
 * **no rastreaba nada**: ni en segundo plano ni con la pantalla encendida. El
 * peor resultado posible, porque en pantalla todo se veía normal.
 *
 * **Por qué el permiso extra no hacía falta.** En Android hay dos formas de
 * recibir ubicación con la app cerrada, y solo UNA necesita ese permiso:
 *
 * 1. Servicio de fondo puro → sí exige `ACCESS_BACKGROUND_LOCATION`.
 * 2. **Servicio en primer plano con notificación** (lo que esta app ya usa):
 *    mientras corre, el sistema considera la app «en uso» y la ubicación sigue
 *    llegando con la pantalla apagada. El propio expo-location lo dice en su
 *    código: *«As a user-initiated foreground service with notification, this
 *    does NOT require the background location permission»*.
 *
 * iOS **sí** es distinto: sin «Siempre» el sistema corta las entregas al salir
 * de la app y no hay servicio en primer plano que lo compense. Por eso la
 * decisión depende de la plataforma y no se puede generalizar.
 */

export type TrackingPlatform = 'android' | 'ios';

export type PermissionState = {
  platform: TrackingPlatform;
  foregroundGranted: boolean;
  backgroundGranted: boolean;
};

/** ¿Alcanzan estos permisos para seguir rastreando con la pantalla apagada? */
export const canTrackInBackground = (state: PermissionState): boolean => {
  if (!state.foregroundGranted) return false;
  return state.platform === 'android' ? true : state.backgroundGranted;
};

/**
 * Qué se le dice al chofer cuando el permiso no alcanza.
 *
 * Dos reglas de redacción, las dos aprendidas a la mala:
 * - **Solo se avisa cuando algo está roto de verdad.** Avisar con el rastreo
 *   funcionando manda al chofer a Ajustes a cambiar algo que ya andaba.
 * - **No se nombra a quién mira.** El texto habla de la ubicación del teléfono
 *   y de qué tocar, nunca de la oficina: el chofer no tiene por qué sentirse
 *   vigilado por usar la app de su trabajo.
 */
export const resolvePermissionWarning = (
  state: PermissionState & { tripEnCurso: boolean }
): string | null => {
  if (!state.tripEnCurso) return null;
  if (!state.foregroundGranted) {
    return 'La ubicación está desactivada. Actívala desde Ajustes para registrar el viaje.';
  }
  if (canTrackInBackground(state)) return null;
  return 'Para que el viaje siga registrándose con la pantalla apagada, pon la ubicación en «Siempre» desde Ajustes.';
};
