import { formatEta, trackingStatusLabel } from './tracking';

/**
 * Lo que el chofer lee sobre su propio rastreo. La regla: cuando algo está mal,
 * el texto tiene que nombrar lo que él PUEDE hacer.
 */

describe('formatEta', () => {
  it('muestra la hora de llegada en horario de Lima', () => {
    expect(formatEta('2026-08-10T20:30:00.000Z')).toBe('15:30');
  });

  it('sin ETA no muestra nada', () => {
    expect(formatEta(undefined)).toBeNull();
    expect(formatEta('no es una fecha')).toBeNull();
  });
});

describe('trackingStatusLabel', () => {
  it('en vivo, se lo dice', () => {
    expect(trackingStatusLabel({ live: true, progressPct: 40 })).toBe('La oficina te está viendo');
  });

  /** «Sin señal» a secas lo deja mirando el teléfono sin saber qué tocar. */
  it('caído, nombra lo que él puede hacer', () => {
    const texto = trackingStatusLabel({
      live: false,
      progressPct: 40,
      lastPositionAt: '2026-08-10T18:00:00.000Z',
    });
    expect(texto).toContain('prendida');
  });

  it('si nunca llegó ninguna posición, lo dice distinto', () => {
    expect(trackingStatusLabel({ live: false, progressPct: 0 })).toContain('todavía no llega');
  });

  it('sin seguimiento no dice nada', () => {
    expect(trackingStatusLabel(null)).toBeNull();
  });
});
