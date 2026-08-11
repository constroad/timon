import { RECHECK_MS, compareVersions, resolveVersionGate, shouldRecheckVersion } from './gate';

/**
 * Un APK fuera de la tienda **no se actualiza solo**: con 30 choferes, en tres
 * meses hay cinco versiones en la calle. Sin esta compuerta, un cambio de
 * contrato de API rompe teléfonos a los que nadie puede llegar.
 *
 * Y por eso mismo el otro riesgo es simétrico: una compuerta que se equivoca
 * deja a toda la flota sin poder trabajar. De ahí que dude a favor de dejar
 * pasar.
 */

describe('compareVersions', () => {
  it('ordena por número, no por texto', () => {
    // '0.10.0' > '0.9.0' aunque como string sea al revés: el bug clásico.
    expect(compareVersions('0.10.0', '0.9.0')).toBeGreaterThan(0);
  });

  it('iguales dan cero', () => {
    expect(compareVersions('1.2.3', '1.2.3')).toBe(0);
  });

  it('completa las partes que faltan', () => {
    expect(compareVersions('1.2', '1.2.0')).toBe(0);
    expect(compareVersions('2', '1.9.9')).toBeGreaterThan(0);
  });
});

describe('resolveVersionGate', () => {
  it('al día, se entra', () => {
    expect(resolveVersionGate({ current: '1.2.0', minimum: '1.2.0' }).blocked).toBe(false);
  });

  it('más nueva que la mínima, se entra', () => {
    expect(resolveVersionGate({ current: '1.3.0', minimum: '1.2.0' }).blocked).toBe(false);
  });

  it('por debajo de la mínima, se bloquea', () => {
    const gate = resolveVersionGate({ current: '1.1.0', minimum: '1.2.0' });
    expect(gate.blocked).toBe(true);
    expect(gate.message).toContain('actualizar');
  });

  /**
   * Si el server no contestó, no se sabe nada — y no saber no puede dejar a la
   * flota parada. Se deja pasar: el riesgo de un contrato viejo es menor que el
   * de 30 camiones sin poder registrar nada.
   */
  it('sin respuesta del server, NO bloquea', () => {
    expect(resolveVersionGate({ current: '1.0.0', minimum: undefined }).blocked).toBe(false);
    expect(resolveVersionGate({ current: '1.0.0', minimum: '' }).blocked).toBe(false);
  });

  /** Una versión mínima con basura adentro tampoco puede parar la flota. */
  it('una mínima ilegible no bloquea', () => {
    expect(resolveVersionGate({ current: '1.0.0', minimum: 'próxima' }).blocked).toBe(false);
  });

  it('lleva el enlace de descarga cuando bloquea', () => {
    const gate = resolveVersionGate({
      current: '1.0.0',
      minimum: '2.0.0',
      downloadUrl: 'https://lila.constroad.com/timon/timon-12.apk',
    });
    expect(gate.downloadUrl).toBe('https://lila.constroad.com/timon/timon-12.apk');
  });

  /**
   * Un enlace que no es http es un enlace que no se puede abrir — o algo peor
   * inyectado en la respuesta. No se muestra.
   */
  it('descarta un enlace que no sea http(s)', () => {
    const gate = resolveVersionGate({
      current: '1.0.0',
      minimum: '2.0.0',
      downloadUrl: 'javascript:alert(1)',
    });
    expect(gate.downloadUrl).toBeNull();
  });
});

describe('shouldRecheckVersion', () => {
  const AHORA = 1_800_000_000_000;

  it('sin haber preguntado nunca, se pregunta', () => {
    expect(shouldRecheckVersion(null, AHORA)).toBe(true);
  });

  /** Volver a la app cada dos minutos no puede disparar una consulta cada vez. */
  it('recién preguntado, no se repite', () => {
    expect(shouldRecheckVersion(AHORA - 60_000, AHORA)).toBe(false);
  });

  it('pasados los diez minutos, se vuelve a preguntar', () => {
    expect(shouldRecheckVersion(AHORA - RECHECK_MS, AHORA)).toBe(true);
  });

  /** Un reloj que saltó hacia atrás dejaría la compuerta congelada para siempre. */
  it('con el reloj hacia atrás, se pregunta igual', () => {
    expect(shouldRecheckVersion(AHORA + 60_000, AHORA)).toBe(true);
  });
});
