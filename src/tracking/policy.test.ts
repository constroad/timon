import { DEFAULT_SAMPLING, resolveSampling, shouldKeepFix, type SamplingConfig } from './policy';

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
