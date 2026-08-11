export type TripStatus = 'programado' | 'en_curso' | 'completado' | 'cancelado';

export interface PortalTrip {
  _id: string;
  date: string;
  origin: string;
  destination: string;
  cargo?: string;
  plate?: string;
  status: TripStatus;
  nextAction?: { label: string; toStatus: TripStatus };
  pod?: { receiverName: string; at: string };
  stops?: { name: string; signed: boolean; receiverName?: string }[];
  stopProgress?: { signed: number; total: number };
  /** Jornada por vueltas (F6.1): `cycles` = se paga por vuelta, no por viaje. */
  mode?: 'trip' | 'cycles';
  cycleCount?: number;
  m3PerCycle?: number;
}

/**
 * Qué viaje mira el chofer AHORA (Timón · A2).
 *
 * Es **la misma regla que el portal web**, a propósito: si la app ordenara los
 * viajes distinto, el chofer que usa las dos superficies vería dos «viajes de
 * hoy» diferentes y no sabría a cuál creerle.
 *
 * 1. el que está `en_curso` (si hubiera dos, el de fecha más reciente);
 * 2. si no, el `programado` MÁS ANTIGUO — el de ayer sin iniciar es el que
 *    arrastra, no el de mañana;
 * 3. si no hay ninguno, no se inventa protagonista.
 */

/**
 * Clave de orden por corte de string. **No se construye un `Date`**: la fecha
 * del viaje es de negocio (date-only) y `new Date('2026-08-07')` es medianoche
 * UTC, o sea las 19:00 del día ANTERIOR en Lima — suficiente para que «el más
 * antiguo» sea otro.
 */
const dateKey = (trip: PortalTrip): string => String(trip.date ?? '').slice(0, 10);

export interface TripFocus {
  active: PortalTrip | null;
  rest: PortalTrip[];
}

export function resolveTripFocus(trips: PortalTrip[] | null | undefined): TripFocus {
  const rows = Array.isArray(trips) ? trips : [];
  if (rows.length === 0) return { active: null, rest: [] };

  const running = rows.filter((trip) => trip.status === 'en_curso');
  const scheduled = rows.filter((trip) => trip.status === 'programado');

  const active =
    running.length > 0
      ? running.reduce((latest, trip) => (dateKey(trip) >= dateKey(latest) ? trip : latest))
      : scheduled.length > 0
        ? scheduled.reduce((oldest, trip) => (dateKey(trip) <= dateKey(oldest) ? trip : oldest))
        : null;

  return {
    active,
    rest: active ? rows.filter((trip) => trip._id !== active._id) : rows,
  };
}

export const STATUS_LABEL: Record<TripStatus, string> = {
  programado: 'Programado',
  en_curso: 'En curso',
  completado: 'Entregado',
  cancelado: 'Cancelado',
};

/** Fecha de negocio para mostrar: se corta el string, nunca se instancia un `Date`. */
export function formatTripDate(date: string): string {
  const [year, month, day] = String(date ?? '').slice(0, 10).split('-');
  return year && month && day ? `${day}/${month}/${year}` : '';
}
