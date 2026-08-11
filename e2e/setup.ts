/**
 * Setup del E2E de Timón.
 *
 * **Qué es y qué NO es.** Esto monta los componentes REALES de la app y los deja
 * hablar con el servidor REAL de Portal (`localhost:3000`) contra la base REAL:
 * el recorrido cruza pantalla → HTTP → API → Mongo y vuelve. Lo que NO cubre es
 * el render nativo ni el comportamiento del equipo (teclado, permisos, batería):
 * para eso hace falta un build de desarrollo en un teléfono o simulador, y esta
 * Mac hoy no tiene Xcode completo ni SDK de Android.
 *
 * Solo se sustituyen los módulos nativos que NO pueden correr en Node, y con
 * implementaciones **fieles**, no con espías vacíos: el llavero guarda y
 * devuelve de verdad, y el aleatorio es aleatorio de verdad. Si el doble
 * mintiera, el E2E dejaría de probar lo que dice probar.
 *
 * Los dobles usan variables con prefijo `mock` porque `jest.mock` se eleva por
 * encima de todo el archivo: una variable normal todavía no existiría cuando la
 * fábrica corre.
 */

/** El llavero del sistema no existe en Node: se reemplaza por uno en memoria. */
jest.mock('expo-secure-store', () => {
  const mockKeychain = new Map<string, string>();
  return {
    setItemAsync: async (key: string, value: string) => {
      mockKeychain.set(key, value);
    },
    getItemAsync: async (key: string) => mockKeychain.get(key) ?? null,
    deleteItemAsync: async (key: string) => {
      mockKeychain.delete(key);
    },
    WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'whenUnlockedThisDeviceOnly',
    /** Solo para el E2E: cada caso arranca sin alta previa. */
    __reset: () => mockKeychain.clear(),
  };
});

jest.mock('expo-crypto', () => {
  // Aleatoriedad REAL: el secreto del equipo es lo único que separa a cualquiera
  // de entrar como el chofer, y un doble que devuelva ceros probaría otra cosa.
  const mockCrypto = require('crypto');
  return {
    getRandomBytesAsync: async (size: number) => new Uint8Array(mockCrypto.randomBytes(size)),
    randomUUID: () => mockCrypto.randomUUID(),
  };
});

/**
 * `fetch` REAL.
 *
 * El preset de Expo/RN instala su propio `fetch` (whatwg-fetch), que se apoya en
 * `XMLHttpRequest` — y en el entorno de test ese objeto no existe. El resultado
 * era peor que un error: las llamadas «funcionaban» y devolvían una respuesta
 * **sin `status`**, así que un E2E podía dar verde sin haber hablado con nadie.
 * Se reemplaza por el cliente HTTP de Node.
 */
import { act, configure, render } from '@testing-library/react-native';

const { fetch: realFetch } = require('undici');
globalThis.fetch = realFetch as unknown as typeof globalThis.fetch;

/**
 * El arranque de la app hace una lectura del llavero y una llamada de red antes
 * de pintar la primera pantalla. Con el 1 s por defecto de RNTL, las esperas
 * expiraban con la app todavía en el indicador de carga — un fallo que parecía
 * de la app y era del test.
 */
configure({ asyncUtilTimeout: 12000 });

export const resetKeychain = () => {
  (require('expo-secure-store') as { __reset: () => void }).__reset();
};

export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

/** Comprueba que el Portal esté arriba: un E2E sin server no se salta, falla. */
export async function requirePortal(): Promise<boolean> {
  try {
    const response = await fetch(`${API_URL}/api/public/app/company`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: 'PING' }),
    });
    return response.status === 404 || response.ok;
  } catch {
    return false;
  }
}

/**
 * Monta la app y **espera a que termine de arrancar**.
 *
 * `App` hace dos cosas asíncronas antes de pintar la primera pantalla: lee el
 * llavero y consulta la sesión. Sin envolver eso en `act`, las esperas de RNTL
 * expiran con la app todavía en el indicador de carga — un fallo que parece de
 * la app y es del test. Se encapsula acá para que ningún caso pueda olvidarlo.
 */
export async function renderApp(element: React.ReactElement) {
  const utils = await act(async () => render(element));
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 1500));
  });
  return utils;
}
