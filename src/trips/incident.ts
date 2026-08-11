/**
 * Reporte de siniestro del conductor (Timón · A3). Motor PURO.
 *
 * Lo escribe alguien que acaba de chocar, o al que le acaban de robar la carga.
 * Todo lo que este archivo decide sale de ahí: **el menor número de campos
 * posible y ninguno que se pueda completar después**.
 */

export const INCIDENT_KINDS = [
  'choque',
  'volcadura',
  'robo-carga',
  'robo-unidad',
  'incendio',
  'otro',
] as const;

export type IncidentKind = (typeof INCIDENT_KINDS)[number];

/** Las etiquetas las lee alguien alterado: sustantivos cortos, sin rodeos. */
export const INCIDENT_LABELS: Record<IncidentKind, string> = {
  choque: 'Choque',
  volcadura: 'Volcadura',
  'robo-carga': 'Robo de carga',
  'robo-unidad': 'Robo de unidad',
  incendio: 'Incendio',
  otro: 'Otro',
};

export interface IncidentDraft {
  kind: IncidentKind | null;
  description: string;
  place: string;
}

export const emptyIncident: IncidentDraft = { kind: null, description: '', place: '' };

/**
 * Solo el tipo y la descripción son obligatorios.
 *
 * El lugar es opcional a propósito: quien acaba de volcar no sabe el kilómetro
 * exacto, y exigírselo lo dejaría sin poder avisar. Que el aviso salga vale más
 * que un dato de ubicación bien puesto — la oficina lo llama en cuanto lo ve.
 */
export function canSubmitIncident(draft: IncidentDraft): boolean {
  return draft.kind !== null && draft.description.trim().length >= 3;
}

export function toIncidentPayload(draft: IncidentDraft) {
  const place = draft.place.trim();
  return {
    kind: 'incident' as const,
    incidentKind: draft.kind as IncidentKind,
    description: draft.description.trim(),
    ...(place ? { place } : {}),
  };
}
