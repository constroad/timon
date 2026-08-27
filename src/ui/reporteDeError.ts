/**
 * Qué viaja cuando la app se rompe. Motor PURO: sin React Native, sin red.
 *
 * Está separado del envío a propósito (regla de la skill `rn-app-loop`): así el
 * test corre en Jest en milisegundos en vez de necesitar el entorno de RN. El
 * primer intento tenía todo junto y el test ni siquiera arrancaba.
 *
 * Lo que este motor cuida es qué **NO** viaja. Un reporte de error es la vía más
 * fácil para que datos de alguien terminen en un log: un mensaje puede arrastrar
 * la respuesta entera del server, y un stack de Hermes trae cientos de líneas.
 * Los topes son duros y no dependen de que quien lanzó el error se haya portado
 * bien.
 */

/** Un mensaje enorme suele ser una respuesta del server volcada entera. */
export const MAX_MENSAJE = 500;
/** El stack de Hermes son cientos de líneas de `node_modules`; sirven las primeras. */
export const MAX_LINEAS_STACK = 20;

export type ReporteDeError = {
  app: string;
  version: string;
  plataforma: string;
  pantalla: string;
  mensaje: string;
  stack: string;
  enviadoEn: string;
};

/**
 * Arma el reporte. PURO y con test propio: lo que se cuida acá es qué NO viaja.
 */
export function armarReporte(params: {
  app: string;
  version: string;
  plataforma: string;
  pantalla: string;
  error: unknown;
  enviadoEn: string;
}): ReporteDeError {
  const { error } = params;

  const mensaje =
    error instanceof Error ? error.message : typeof error === 'string' ? error : String(error);

  const stack =
    error instanceof Error && error.stack
      ? error.stack.split('\n').slice(0, MAX_LINEAS_STACK).join('\n')
      : '';

  return {
    app: params.app,
    version: params.version,
    plataforma: params.plataforma,
    // **La pantalla es un NOMBRE, no una ruta.** Si acá entrara
    // `viaje/68f3ab/vuelta`, el id del viaje quedaría escrito en el log de
    // producción. Se corta en la primera barra.
    pantalla: params.pantalla.split('/')[0] ?? params.pantalla,
    mensaje: mensaje.slice(0, MAX_MENSAJE),
    stack,
    enviadoEn: params.enviadoEn,
  };
}
