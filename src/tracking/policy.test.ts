import {
  cambioDeRama,
  DEFAULT_SAMPLING,
  minutosDetenido,
  resolveSampling,
  shouldKeepFix,
  type SamplingConfig,
} from './policy';

/**
 * Cada punto de más es batería y datos de un prepago; cada punto de menos es un
 * tramo que la torre no puede dibujar. Estos tests fijan ese equilibrio y, sobre
 * todo, que la política sea del SERVER: un APK sideloaded se actualiza tarde y
 * mal, así que los números no pueden estar compilados.
 */

describe('resolveSampling', () => {
  it('en ruta y moviéndose, el ritmo normal', () => {
    expect(resolveSampling({ stoppedMinutes: 0, batteryLevel: 0.8 })).toEqual({
      intervalMs: 60_000,
      distanceM: 150,
    });
  });

  /** Un camión parado en la cola de la balanza no necesita un punto por minuto. */
  it('detenido más de 10 minutos, baja el ritmo', () => {
    expect(resolveSampling({ stoppedMinutes: 12, batteryLevel: 0.8 }).intervalMs).toBe(300_000);
  });

  /**
   * Un chofer sin batería al llegar es peor que un rastro con menos puntos: la
   * batería gana sobre todo lo demás.
   */
  it('con batería baja manda la batería, aunque esté en movimiento', () => {
    expect(resolveSampling({ stoppedMinutes: 0, batteryLevel: 0.1 })).toEqual({
      intervalMs: 600_000,
      distanceM: 300,
    });
  });

  it('sin dato de batería no se asume lo peor', () => {
    expect(resolveSampling({ stoppedMinutes: 0 }).intervalMs).toBe(60_000);
  });

  /** El APK se actualiza tarde: los números los manda el server. */
  it('la política del server pisa a la de fábrica', () => {
    const config: SamplingConfig = { movingMs: 30_000, movingDistanceM: 80 };
    expect(resolveSampling({ stoppedMinutes: 0, batteryLevel: 0.9, config })).toEqual({
      intervalMs: 30_000,
      distanceM: 80,
    });
  });

  it('una política a medias usa lo de fábrica para lo que falta', () => {
    const resuelto = resolveSampling({ stoppedMinutes: 0, config: { movingMs: 30_000 } });
    expect(resuelto).toEqual({ intervalMs: 30_000, distanceM: DEFAULT_SAMPLING.movingDistanceM });
  });

  /** Un server con números absurdos no puede dejar el teléfono muestreando sin parar. */
  it('un intervalo absurdo del server se acota', () => {
    expect(resolveSampling({ stoppedMinutes: 0, config: { movingMs: 100 } }).intervalMs).toBe(15_000);
  });
});

describe('shouldKeepFix', () => {
  it('un fix preciso se guarda', () => {
    expect(shouldKeepFix({ accuracyM: 15 })).toBe(true);
  });

  /** Peor que 100 m son varias cuadras: ensucia el rastro y engaña la ETA. */
  it('un fix impreciso se descarta en el teléfono, no en el server', () => {
    expect(shouldKeepFix({ accuracyM: 250 })).toBe(false);
  });

  it('sin dato de precisión se guarda', () => {
    expect(shouldKeepFix({})).toBe(true);
  });

  /**
   * Un fix simulado NO se descarta: se guarda marcado. Un rastro falseado es un
   * problema de personas, y el dato tiene que quedar para poder mostrarlo.
   */
  it('un fix de una app de GPS falso se guarda igual', () => {
    expect(shouldKeepFix({ accuracyM: 10, isMocked: true })).toBe(true);
  });
});

describe('minutosDetenido — la rama que nunca corría', () => {
  const punto = (lat: number, lng: number, minutosAtras: number) => ({
    lat,
    lng,
    at: new Date(AHORA - minutosAtras * 60_000).toISOString(),
  });
  const AHORA = Date.parse('2026-08-20T12:00:00.000Z');

  it('sin puntos no se asume nada: cero', () => {
    // Ante la duda, la rama de «en movimiento». Un teléfono recién arrancado no
    // lleva quince minutos quieto solo porque no tengamos con qué compararlo.
    expect(minutosDetenido([], AHORA)).toBe(0);
  });

  it('quieto en el mismo lugar: cuenta desde el primer punto de ese radio', () => {
    const puntos = [
      punto(-12.0464, -77.0428, 40),
      punto(-12.0464, -77.0428, 25),
      punto(-12.04641, -77.04281, 12),
      punto(-12.0464, -77.0428, 1),
    ];

    // Los cuatro caen dentro del radio, así que lleva 40 minutos ahí.
    expect(minutosDetenido(puntos, AHORA)).toBe(40);
  });

  it('si se movió, el contador arranca de nuevo desde donde se alejó', () => {
    const puntos = [
      punto(-12.0464, -77.0428, 60), // otro lugar
      punto(-12.0900, -77.0500, 20), // se movió: ~5 km
      punto(-12.0900, -77.0500, 5),
    ];

    // Solo cuentan los 20 minutos desde que llegó al lugar actual.
    expect(minutosDetenido(puntos, AHORA)).toBe(20);
  });

  it('un metro de deriva del GPS NO cuenta como moverse', () => {
    // El GPS oscila parado. Sin tolerancia, un camión en la balanza «se mueve»
    // cada minuto y la rama de detenido no se activa nunca.
    const puntos = [punto(-12.0464, -77.0428, 30), punto(-12.04645, -77.04285, 2)];

    expect(minutosDetenido(puntos, AHORA)).toBe(30);
  });

  it('el último punto manda, aunque llegue desordenado', () => {
    const puntos = [punto(-12.0900, -77.0500, 5), punto(-12.0464, -77.0428, 30)];

    // Android entrega en ráfagas y no siempre en orden. Lo que define «dónde
    // estoy» es el más RECIENTE, no el último del array.
    expect(minutosDetenido(puntos, AHORA)).toBe(5);
  });
});

describe('cambioDeRama — cuándo vale reiniciar el rastreo', () => {
  it('el mismo muestreo no reinicia nada', () => {
    // Reiniciar `startLocationUpdatesAsync` corta y rearma el servicio: hacerlo
    // en cada fix costaría más batería de la que ahorra.
    expect(cambioDeRama({ intervalMs: 60_000, distanceM: 150 }, { intervalMs: 60_000, distanceM: 150 })).toBe(false);
  });

  it('pasar de moverse a estar detenido sí', () => {
    expect(cambioDeRama({ intervalMs: 60_000, distanceM: 150 }, { intervalMs: 300_000, distanceM: 150 })).toBe(true);
  });

  it('volver a moverse también', () => {
    expect(cambioDeRama({ intervalMs: 300_000, distanceM: 150 }, { intervalMs: 60_000, distanceM: 150 })).toBe(true);
  });

  it('un cambio de distancia también cuenta', () => {
    expect(cambioDeRama({ intervalMs: 600_000, distanceM: 150 }, { intervalMs: 600_000, distanceM: 300 })).toBe(true);
  });
});
