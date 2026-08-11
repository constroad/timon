import { formatTripDate, resolveTripFocus, type PortalTrip } from './focus';

/**
 * La app y el portal web tienen que elegir EL MISMO viaje protagonista. Si no,
 * el chofer que usa las dos superficies ve dos «viajes de hoy» distintos y no
 * sabe a cuál creerle.
 */

const trip = (over: Partial<PortalTrip> & { _id: string }): PortalTrip => ({
  date: '2026-08-07',
  origin: 'Lima',
  destination: 'Ica',
  status: 'programado',
  ...over,
});

describe('resolveTripFocus', () => {
  it('sin viajes no inventa protagonista', () => {
    expect(resolveTripFocus([])).toEqual({ active: null, rest: [] });
    expect(resolveTripFocus(undefined)).toEqual({ active: null, rest: [] });
  });

  it('el que está manejando gana sobre lo programado', () => {
    const focus = resolveTripFocus([
      trip({ _id: 'prog', date: '2026-08-06' }),
      trip({ _id: 'curso', status: 'en_curso', date: '2026-08-07' }),
    ]);

    expect(focus.active?._id).toBe('curso');
    expect(focus.rest.map((row) => row._id)).toEqual(['prog']);
  });

  /** El de ayer sin iniciar es el que arrastra, no el de mañana. */
  it('sin viaje en curso toma el programado más antiguo', () => {
    const focus = resolveTripFocus([
      trip({ _id: 'manana', date: '2026-08-09' }),
      trip({ _id: 'ayer', date: '2026-08-06' }),
    ]);

    expect(focus.active?._id).toBe('ayer');
  });

  it('todo entregado: sin protagonista y todos a la lista', () => {
    const focus = resolveTripFocus([
      trip({ _id: 'a', status: 'completado' }),
      trip({ _id: 'b', status: 'cancelado' }),
    ]);

    expect(focus.active).toBeNull();
    expect(focus.rest).toHaveLength(2);
  });

  it('el activo no se repite en la lista', () => {
    const focus = resolveTripFocus([
      trip({ _id: 'curso', status: 'en_curso' }),
      trip({ _id: 'otro', status: 'completado' }),
    ]);

    expect(focus.rest.some((row) => row._id === focus.active?._id)).toBe(false);
  });

  /**
   * La fecha del viaje es date-only. Con `new Date()` de por medio, «2026-08-07»
   * sería el 6 a las 19:00 en Lima y el orden podría dar vuelta.
   */
  it('ordena igual con date-only que con ISO completo', () => {
    const focus = resolveTripFocus([
      trip({ _id: 'iso', date: '2026-08-08T05:00:00.000Z' }),
      trip({ _id: 'plano', date: '2026-08-07' }),
    ]);

    expect(focus.active?._id).toBe('plano');
  });
});

describe('formatTripDate', () => {
  it('muestra la fecha de negocio sin correrla de día', () => {
    expect(formatTripDate('2026-08-07')).toBe('07/08/2026');
    expect(formatTripDate('2026-08-07T05:00:00.000Z')).toBe('07/08/2026');
  });

  it('una fecha vacía no rompe', () => {
    expect(formatTripDate('')).toBe('');
  });
});
