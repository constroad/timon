import type { PortalTrip } from './focus';

/**
 * Traducción del viaje que manda el server al viaje que dibuja la app.
 *
 * Existe por una asimetría deliberada: el endpoint del conductor **enumera** los
 * campos del viaje (`cycles`, `cycleRate`), y la pantalla necesita otras dos
 * cosas — cuántas vueltas van y cuánto m³ pre-llenar. Derivarlas acá, en un
 * módulo puro, es lo que evita que la pantalla lea campos que nunca llegan: sin
 * esto el contador se queda en 0 aunque la jornada tenga diez vueltas.
 */

export interface RawPortalTrip extends Omit<PortalTrip, 'cycleCount' | 'm3PerCycle'> {
  /** Las vueltas ya registradas de la jornada, tal como las guarda el viaje. */
  cycles?: unknown[];
  /** Tarifa de la jornada; `m3PerCycle` es la tolva pactada de la unidad. */
  cycleRate?: { m3PerCycle?: number };
}

export function normalizePortalTrip(raw: RawPortalTrip): PortalTrip {
  const { cycles, cycleRate, ...trip } = raw;
  const m3PerCycle = cycleRate?.m3PerCycle;
  return {
    ...trip,
    cycleCount: Array.isArray(cycles) ? cycles.length : 0,
    ...(typeof m3PerCycle === 'number' ? { m3PerCycle } : {}),
  };
}

export function normalizePortalTrips(raw: RawPortalTrip[] | null | undefined): PortalTrip[] {
  return Array.isArray(raw) ? raw.map(normalizePortalTrip) : [];
}
