import { normalizePortalTrip, normalizePortalTrips, type RawPortalTrip } from './portalTrip';

/**
 * El server ENUMERA los campos del viaje que le manda al chofer, y manda
 * `cycles` + `cycleRate` — no `cycleCount` ni `m3PerCycle`. Estos tests fijan
 * que la app los DERIVE: sin eso el contador de vueltas se queda en 0 para
 * siempre y el m³ nunca se pre-llena, que fue el bug de la jornada por ciclos.
 */

const raw = (over: Partial<RawPortalTrip> = {}): RawPortalTrip => ({
  _id: '6a79271f4051e7d56deff1a8',
  date: '2026-08-08',
  origin: 'Cantera Jicamarca',
  destination: 'Obra San Juan de Lurigancho',
  status: 'en_curso',
  mode: 'cycles',
  ...over,
});

describe('normalizePortalTrip', () => {
  it('cuenta las vueltas que ya trae el viaje', () => {
    expect(normalizePortalTrip(raw({ cycles: [{}, {}, {}] })).cycleCount).toBe(3);
  });

  it('sin vueltas todavía cuenta cero, no undefined', () => {
    expect(normalizePortalTrip(raw()).cycleCount).toBe(0);
  });

  /** La tolva de la unidad: en el 90% de las vueltas el chofer no teclea nada. */
  it('pre-llena el m³ con la tarifa de la jornada', () => {
    expect(normalizePortalTrip(raw({ cycleRate: { m3PerCycle: 8 } })).m3PerCycle).toBe(8);
  });

  it('sin tarifa el m³ queda vacío para que lo escriba', () => {
    expect(normalizePortalTrip(raw()).m3PerCycle).toBeUndefined();
    expect(normalizePortalTrip(raw({ cycleRate: {} })).m3PerCycle).toBeUndefined();
  });

  it('no pisa el resto del viaje', () => {
    const trip = normalizePortalTrip(raw({ plate: 'V2K-841' }));
    expect(trip.plate).toBe('V2K-841');
    expect(trip.destination).toBe('Obra San Juan de Lurigancho');
    expect(trip.status).toBe('en_curso');
  });

  it('un viaje normal no inventa datos de jornada', () => {
    const trip = normalizePortalTrip(raw({ mode: 'trip' }));
    expect(trip.cycleCount).toBe(0);
    expect(trip.m3PerCycle).toBeUndefined();
  });
});

describe('normalizePortalTrips', () => {
  it('mapea la lista entera', () => {
    const trips = normalizePortalTrips([raw({ cycles: [{}] }), raw({ cycles: [{}, {}] })]);
    expect(trips.map((trip) => trip.cycleCount)).toEqual([1, 2]);
  });

  /** Un payload sin viajes no puede reventar la pantalla del chofer. */
  it('aguanta que no venga nada', () => {
    expect(normalizePortalTrips(undefined)).toEqual([]);
    expect(normalizePortalTrips(null)).toEqual([]);
  });
});
