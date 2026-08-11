import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import { Platform } from 'react-native';

/**
 * Credencial del equipo (Timón · A1).
 *
 * Vive en el **almacenamiento seguro del sistema** —Keystore en Android,
 * Keychain en iOS—, no en un archivo de la app. Es la diferencia con el portal
 * web, donde el token vivía en `localStorage` y se perdía al limpiar el
 * navegador… y donde cualquier otra cosa del navegador podía leerlo.
 *
 * El **secreto lo genera este teléfono** y no sale de acá salvo para el alta: el
 * server guarda solo su hash. Un volcado del servidor no contiene la llave de
 * nadie.
 */

const KEY = 'timon.credential.v1';

export interface StoredCredential {
  companyId: string;
  deviceId: string;
  deviceSecret: string;
}

/** Nombre del equipo tal como lo va a ver el admin en su lista de accesos. */
export const deviceLabel = (driverName?: string | null): string => {
  const model = Platform.OS === 'ios' ? 'iPhone' : 'Android';
  const person = String(driverName ?? '').trim();
  return person ? `${model} · ${person}` : model;
};

/**
 * Identidad nueva para este equipo.
 *
 * 32 bytes de aleatoriedad del sistema para el secreto: es lo que separa a
 * cualquiera de entrar como este chofer, y `Math.random` no sirve para eso.
 */
export async function generateDeviceIdentity(): Promise<{ id: string; secret: string }> {
  const bytes = await Crypto.getRandomBytesAsync(32);
  const secret = Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
  return { id: Crypto.randomUUID(), secret };
}

export async function saveCredential(credential: StoredCredential): Promise<void> {
  await SecureStore.setItemAsync(KEY, JSON.stringify(credential), {
    // Sin esto, iOS sincroniza el llavero a otros equipos del mismo Apple ID y
    // la credencial de ESTE teléfono aparecería en otro.
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

/** `null` si no hay alta, o si lo guardado quedó ilegible (versión vieja). */
export async function loadCredential(): Promise<StoredCredential | null> {
  const raw = await SecureStore.getItemAsync(KEY).catch(() => null);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<StoredCredential>;
    if (!parsed.companyId || !parsed.deviceId || !parsed.deviceSecret) return null;
    return parsed as StoredCredential;
  } catch {
    return null;
  }
}

/**
 * Borra el alta de este equipo.
 *
 * Se usa cuando el server responde que el acceso ya no está activo: quedarse con
 * una credencial muerta deja al chofer mirando una pantalla que falla sin
 * explicar por qué.
 */
export async function clearCredential(): Promise<void> {
  await SecureStore.deleteItemAsync(KEY).catch(() => undefined);
}
