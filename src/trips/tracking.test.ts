import { formatEta, resolveLocationWarning, trackingStatusLabel } from './tracking';

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

describe('trackingStatusLabel — con lo que la app ya envió', () => {
  /**
   * El caso real (13/08/2026): la app mandó la primera posición y el cartel
   * seguía diciendo «todavía no llega a la oficina», porque el payload en
   * pantalla era anterior al envío y nadie lo refresca. La app SABE que envió:
   * decir lo contrario es mentirle al chofer sobre su propio rastreo.
   */
  it('si la app acaba de enviar, la oficina lo está viendo', () => {
    expect(trackingStatusLabel({ live: false, progressPct: 0 }, true)).toBe(
      'La oficina te está viendo'
    );
  });

  it('sin envío propio, manda lo que dice el server', () => {
    expect(trackingStatusLabel({ live: false, progressPct: 0 }, false)).toBe(
      'Tu ubicación todavía no llega a la oficina.'
    );
  });
});

describe('resolveLocationWarning', () => {
  /**
   * Lo grave: con «solo mientras uso la app», el rastreo se corta al bloquear
   * la pantalla y el chofer no se entera hasta que la oficina lo llama.
   */
  it('viaje en curso sin permiso de fondo: se avisa y se dice qué hacer', () => {
    const aviso = resolveLocationWarning({ tripEnCurso: true, backgroundGranted: false });

    expect(aviso).toContain('Ajustes');
    expect(aviso).toContain('todo el tiempo');
  });

  it('con el permiso correcto, no molesta', () => {
    expect(resolveLocationWarning({ tripEnCurso: true, backgroundGranted: true })).toBeNull();
  });

  it('sin viaje en curso tampoco molesta: todavía no hace falta', () => {
    expect(resolveLocationWarning({ tripEnCurso: false, backgroundGranted: false })).toBeNull();
  });
});
