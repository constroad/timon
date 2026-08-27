import { armarReporte, MAX_LINEAS_STACK, MAX_MENSAJE } from './reporteDeError';

/**
 * Qué viaja —y sobre todo qué NO— cuando la app se rompe.
 *
 * El reporte de errores es la vía más fácil para que datos de alguien terminen
 * en un log: un mensaje de error puede arrastrar el contenido de una pantalla, y
 * un stack de Hermes trae cientos de líneas. Por eso los topes son duros y no
 * dependen de que quien lanzó el error se haya portado bien.
 */
describe('armarReporte', () => {
  const base = {
    app: 'timon',
    version: '0.4.2',
    plataforma: 'android',
    pantalla: 'TripsScreen',
    enviadoEn: '2026-08-27T18:00:00.000Z',
  };

  it('saca el mensaje de un Error', () => {
    expect(armarReporte({ ...base, error: new Error('no se pudo registrar la vuelta') })).toMatchObject(
      { app: 'timon', pantalla: 'TripsScreen', mensaje: 'no se pudo registrar la vuelta' }
    );
  });

  /** Un `throw 'texto'` es válido en JS y pasa: no puede volverse «[object Object]». */
  it('acepta lo que no es un Error', () => {
    expect(armarReporte({ ...base, error: 'se cayó la red' }).mensaje).toBe('se cayó la red');
    expect(armarReporte({ ...base, error: { codigo: 409 } }).mensaje).not.toContain('undefined');
  });

  it('sin stack no inventa uno', () => {
    expect(armarReporte({ ...base, error: 'texto suelto' }).stack).toBe('');
  });

  /**
   * El stack completo de Hermes son cientos de líneas de `node_modules`. Lo
   * único que sirve son las primeras, y mandar el resto llena el log de ruido.
   */
  it('recorta el stack a las primeras líneas', () => {
    const error = new Error('x');
    error.stack = Array.from({ length: 200 }, (_, i) => `  at cuadro${i}`).join('\n');

    expect(armarReporte({ ...base, error }).stack.split('\n')).toHaveLength(MAX_LINEAS_STACK);
  });

  /**
   * Un mensaje enorme suele ser una respuesta del server volcada entera — el
   * lugar más probable donde aparecen datos de un viaje o de un chofer.
   */
  it('recorta el mensaje larguísimo', () => {
    const largo = 'a'.repeat(5_000);

    expect(armarReporte({ ...base, error: new Error(largo) }).mensaje).toHaveLength(MAX_MENSAJE);
  });

  /** El server exige `app` y `version` no vacíos; sin versión el reporte se descarta. */
  it('conserva app, versión y plataforma tal cual', () => {
    const reporte = armarReporte({ ...base, error: new Error('x') });

    expect(reporte.app).toBe('timon');
    expect(reporte.version).toBe('0.4.2');
    expect(reporte.plataforma).toBe('android');
    expect(reporte.enviadoEn).toBe('2026-08-27T18:00:00.000Z');
  });

  /**
   * **La pantalla es un NOMBRE, no una ruta con datos adentro.** Si alguien
   * pasara `viaje/68f3…/vuelta`, el id del viaje quedaría en el log de
   * producción. Se recorta a lo que hay antes de la primera barra.
   */
  it('la pantalla no arrastra identificadores', () => {
    expect(armarReporte({ ...base, pantalla: 'viaje/68f3ab/vuelta', error: 'x' }).pantalla).toBe(
      'viaje'
    );
  });
});
