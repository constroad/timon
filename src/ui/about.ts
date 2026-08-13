import { compareVersions } from '../version/gate';

/**
 * Datos de «Acerca de». Motor puro: lo que se muestra es una decisión de
 * producto (qué preguntas tiene que responder esa pantalla), no pintura.
 *
 * La pregunta que responde: **qué versión tiene ESE teléfono**. Sin eso, «no me
 * funciona» es indistinguible de «tenés una app de hace tres meses» — y el
 * servidor al que apunta, que fue justo lo primero que hubo que averiguar el
 * día que un APK salió apuntando al emulador.
 */
export type AboutRow = { label: string; value: string };

export const buildAboutRows = (params: {
  version: string;
  buildNumber: number | string;
  companyName?: string;
  driverName?: string;
  serverUrl: string;
}): AboutRow[] =>
  [
    { label: 'Versión', value: `${params.version} (build ${params.buildNumber})` },
    { label: 'Empresa', value: params.companyName ?? '' },
    { label: 'Conductor', value: params.driverName ?? '' },
    { label: 'Servidor', value: params.serverUrl },
  ].filter((fila) => fila.value.trim() !== '');

export type UpdateState = { outdated: boolean; message: string };

/**
 * ¿Esta app quedó vieja? Se compara contra la versión MÍNIMA que exige el
 * server, que es el único número que conoce (no hay un «última disponible»).
 *
 * Sin mínima —el server no contestó— **no se afirma nada**: no saber no es lo
 * mismo que estar desactualizado, y asustar al chofer con un cartel falso es
 * peor que no decir nada.
 */
export const resolveUpdateState = (params: {
  current: string;
  minimum?: string;
}): UpdateState => {
  const minima = String(params.minimum ?? '').trim();
  if (!minima) return { outdated: false, message: 'No se pudo consultar al servidor.' };
  if (compareVersions(params.current, minima) >= 0) {
    return { outdated: false, message: 'Tu app está al día.' };
  }
  return {
    outdated: true,
    message: `Hay una versión nueva (${minima}). Descárgala para seguir usando la app.`,
  };
};

/**
 * ¿La URL es un SVG? `<Image>` de React Native **no** renderiza SVG y no avisa:
 * simplemente no dibuja. El logo de la empresa suele venir en SVG, así que hay
 * que mandarlo por `SvgUri` (react-native-svg) en vez del `<Image>` normal.
 */
export const isSvgUrl = (url: string | null | undefined): boolean =>
  /\.svg($|\?|#)/i.test(String(url ?? '').trim());
