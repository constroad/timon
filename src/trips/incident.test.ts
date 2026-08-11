import {
  INCIDENT_KINDS,
  INCIDENT_LABELS,
  canSubmitIncident,
  emptyIncident,
  toIncidentPayload,
  type IncidentDraft,
} from './incident';

/**
 * Este formulario lo llena alguien que acaba de chocar. Lo que estos tests
 * protegen es que pueda avisar con lo mínimo, y que nada opcional lo frene.
 */

const draft = (over: Partial<IncidentDraft> = {}): IncidentDraft => ({
  kind: 'choque',
  description: 'Nos chocó una combi por atrás',
  place: '',
  ...over,
});

describe('canSubmitIncident', () => {
  it('con tipo y descripción alcanza', () => {
    expect(canSubmitIncident(draft())).toBe(true);
  });

  it('sin elegir el tipo no se envía', () => {
    expect(canSubmitIncident(draft({ kind: null }))).toBe(false);
  });

  it('sin describir qué pasó no se envía', () => {
    expect(canSubmitIncident(draft({ description: '' }))).toBe(false);
    expect(canSubmitIncident(draft({ description: '  x ' }))).toBe(false);
  });

  /**
   * Quien acaba de volcar no sabe el kilómetro exacto. Exigirlo lo dejaría sin
   * poder avisar, y el aviso vale más que el dato.
   */
  it('el lugar es opcional', () => {
    expect(canSubmitIncident(draft({ place: '' }))).toBe(true);
  });

  it('el borrador vacío no se puede enviar', () => {
    expect(canSubmitIncident(emptyIncident)).toBe(false);
  });
});

describe('toIncidentPayload', () => {
  it('arma el reporte con lo que el server espera', () => {
    expect(toIncidentPayload(draft())).toEqual({
      kind: 'incident',
      incidentKind: 'choque',
      description: 'Nos chocó una combi por atrás',
    });
  });

  it('lleva el lugar cuando lo hay', () => {
    expect(toIncidentPayload(draft({ place: 'Km 48 Panamericana Sur' })).place).toBe(
      'Km 48 Panamericana Sur'
    );
  });

  it('el lugar en blanco viaja ausente', () => {
    expect(toIncidentPayload(draft({ place: '   ' }))).not.toHaveProperty('place');
  });

  it('recorta los espacios de la descripción', () => {
    expect(toIncidentPayload(draft({ description: '  volcamos  ' })).description).toBe('volcamos');
  });
});

describe('catálogo', () => {
  /** Si el server suma un tipo y la app no, el chofer no puede reportarlo. */
  it('todos los tipos tienen etiqueta', () => {
    expect(INCIDENT_KINDS.every((kind) => Boolean(INCIDENT_LABELS[kind]))).toBe(true);
  });

  it('cubre robo de carga y de unidad por separado', () => {
    expect(INCIDENT_KINDS).toContain('robo-carga');
    expect(INCIDENT_KINDS).toContain('robo-unidad');
  });
});
