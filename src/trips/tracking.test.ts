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
  /**
   * NUNCA se nombra a quién lo mira. El texto viejo decía «La oficina te está
   * viendo» y, en boca de un chofer de 60 años que no entiende de permisos ni
   * de GPS, eso no informa: asusta. Lo que le sirve saber es si la app está
   * registrando el viaje — un dato sobre SU teléfono, no sobre quién lo vigila.
   */
  it('en vivo, habla del registro del viaje y NO de la oficina', () => {
    const texto = trackingStatusLabel({ live: true, progressPct: 40 });

    expect(texto).toBe('Viaje registrándose');
    expect(texto).not.toMatch(/oficina|viendo|vigil|control/i);
  });

  /** «Sin señal» a secas lo deja mirando el teléfono sin saber qué tocar. */
  it('caído, nombra lo que él puede hacer', () => {
    const texto = trackingStatusLabel({
      live: false,
      progressPct: 40,
      lastPositionAt: '2026-08-10T18:00:00.000Z',
    });

    expect(texto).toContain('prendida');
    expect(texto).not.toMatch(/oficina|viendo|vigil|control/i);
  });

  it('si nunca llegó ninguna posición, lo dice sin nombrar a la oficina', () => {
    const texto = trackingStatusLabel({ live: false, progressPct: 0 });

    expect(texto).toContain('ubicación');
    expect(texto).not.toMatch(/oficina|viendo|vigil|control/i);
  });

  it('sin seguimiento no dice nada', () => {
    expect(trackingStatusLabel(null)).toBeNull();
  });
});

describe('trackingStatusLabel — con lo que la app ya envió', () => {
  /**
   * El caso real (13/08/2026): la app mandó la primera posición y el cartel
   * seguía diciendo que no llegaba nada, porque el payload en pantalla era
   * anterior al envío y nadie lo refresca. La app SABE que envió: decir lo
   * contrario es mentirle al chofer sobre su propio rastreo.
   */
  it('si la app acaba de enviar, el viaje se está registrando', () => {
    expect(trackingStatusLabel({ live: false, progressPct: 0 }, true)).toBe('Viaje registrándose');
  });

  it('sin envío propio, manda lo que dice el server', () => {
    expect(trackingStatusLabel({ live: false, progressPct: 0 }, false)).toContain('ubicación');
  });
});
