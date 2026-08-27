import { Platform } from 'react-native';
import appConfig from '../../app.json';
import { armarReporte } from './reporteDeError';

/**
 * Contarle a alguien que la app se rompió.
 *
 * Hasta el 27/08/2026 un fallo en el teléfono de un chofer era **invisible**: la
 * pantalla quedaba en blanco o la app se cerraba, y la única forma de enterarse
 * era que esa persona se acordara de contarlo. En una app que se usa manejando,
 * eso significa que no nos enterábamos nunca.
 *
 * **Adónde va, y por qué no a Portal.** El endpoint vive en el server de
 * lilachat (`/api/crash`), que es el sumidero de errores de las tres apps —su
 * lista blanca ya nombraba a `timon`—. Ahí está lo que vuelve útil a un reporte:
 * el log queda en Torre con su hora y además dispara un aviso a Telegram. Portal
 * corre en Vercel, cuyos logs no llegan a Torre, así que un endpoint propio allá
 * sería un segundo lugar donde mirar — y el problema que esto resuelve es
 * justamente que nadie mira.
 *
 * La contrapartida, asumida: con el server de lilachat caído estos reportes se
 * pierden. Como el envío es fire-and-forget, eso **no puede afectar a Timón**,
 * que es la propiedad que de verdad importa acá.
 *
 * La versión sale de `app.json`, igual que el gate de versión: Timón no usa
 * `expo-constants`.
 */
const BASE_URL = 'https://lilachat.constroad.com';
const TIMEOUT_MS = 5_000;

/**
 * Manda el reporte. **Nunca lanza y nunca bloquea.**
 *
 * Un reporte que rompe la app al fallar es peor que no tener reportes; y esperar
 * a que viaje antes de dibujar la pantalla de error deja al chofer mirando el
 * vacío justo cuando la red está mala — que es cuando más se rompe.
 */
export function reportarError(pantalla: string, error: unknown): void {
  const reporte = armarReporte({
    app: 'timon',
    version: appConfig.expo.version,
    plataforma: Platform.OS,
    pantalla,
    error,
    enviadoEn: new Date().toISOString(),
  });

  // El `catch` es obligatorio: sin él un rechazo acá se vuelve un
  // `unhandledRejection` y el reporte de errores pasa a ser fuente de errores.
  void fetch(`${BASE_URL}/api/crash`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(reporte),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  }).catch(() => {
    // Sin red no hay nada que hacer. Encolarlo sería lo correcto y es la
    // siguiente vuelta; hoy se pierde y se sabe que se pierde.
  });

  // También al log local: con `adb logcat` se ve al instante, sin depender del
  // server ni de que haya red.
  console.error(`[crash] ${reporte.pantalla} — ${reporte.mensaje}`);
}
