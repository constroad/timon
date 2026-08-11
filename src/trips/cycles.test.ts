import {
  MIN_MS_BETWEEN_TAPS,
  buildClientKey,
  canRegisterCycle,
  cyclesLabel,
  secondsUntilNextTap,
  toCyclePayload,
} from './cycles';

/**
 * Cada tap es plata: una vuelta de más se cobra al cliente y se paga al chofer.
 * Lo que estos tests protegen es que un dedo torpe o una respuesta perdida no
 * inventen vueltas.
 */

const AHORA = 1_800_000_000_000;

describe('canRegisterCycle', () => {
  it('la primera vuelta siempre se puede', () => {
    expect(canRegisterCycle({ lastTapAt: null, now: AHORA, isBusy: false })).toBe(true);
  });

  /** El botón es enorme, el camión se mueve y el pulgar toca dos veces. */
  it('un doble tap accidental no cuenta', () => {
    expect(canRegisterCycle({ lastTapAt: AHORA - 2000, now: AHORA, isBusy: false })).toBe(false);
  });

  it('pasada la espera, se puede de nuevo', () => {
    expect(
      canRegisterCycle({ lastTapAt: AHORA - MIN_MS_BETWEEN_TAPS, now: AHORA, isBusy: false })
    ).toBe(true);
  });

  /** Con un envío en vuelo tampoco: es la otra forma de duplicar. */
  it('no se puede mientras hay una vuelta enviándose', () => {
    expect(canRegisterCycle({ lastTapAt: null, now: AHORA, isBusy: true })).toBe(false);
  });
});

describe('secondsUntilNextTap', () => {
  it('dice cuánto falta, para poder mostrarlo', () => {
    expect(secondsUntilNextTap(AHORA - 5000, AHORA)).toBe(15);
  });

  it('sin vuelta previa no hay espera', () => {
    expect(secondsUntilNextTap(null, AHORA)).toBe(0);
  });

  it('nunca devuelve negativos', () => {
    expect(secondsUntilNextTap(AHORA - 999_999, AHORA)).toBe(0);
  });
});

describe('buildClientKey', () => {
  /**
   * Sin clave, cada reenvío tras una respuesta perdida —lo normal en
   * carretera— sería una vuelta inventada.
   */
  it('dos taps distintos dan claves distintas', () => {
    expect(buildClientKey('t1', AHORA, 'a')).not.toBe(buildClientKey('t1', AHORA + 1, 'a'));
    expect(buildClientKey('t1', AHORA, 'a')).not.toBe(buildClientKey('t1', AHORA, 'b'));
  });

  it('el MISMO tap reenviado conserva su clave', () => {
    expect(buildClientKey('t1', AHORA, 'a')).toBe(buildClientKey('t1', AHORA, 'a'));
  });

  /**
   * El server corta la clave en 60 caracteres y rechaza la vuelta entera con un
   * 400 mudo: el chofer toca, no pasa nada y nadie le dice por qué. Con un
   * `_id` de Mongo y un UUID de nonce se pasaba sin que nadie lo notara.
   */
  it('nunca pasa de 60 caracteres, ni con un id real y un UUID', () => {
    const clave = buildClientKey(
      '6a79271f4051e7d56deff1a8',
      AHORA,
      '9f8c1d2e-4b6a-4c3d-8e7f-1a2b3c4d5e6f'
    );
    expect(clave.length).toBeLessThanOrEqual(60);
    expect(clave).toContain('6a79271f4051e7d56deff1a8');
  });

  /** Acortar la clave no puede costarle la unicidad al tap. */
  it('sigue distinguiendo dos taps tras el recorte', () => {
    const uno = buildClientKey('6a79271f4051e7d56deff1a8', AHORA, '9f8c1d2e-4b6a-4c3d');
    const otro = buildClientKey('6a79271f4051e7d56deff1a8', AHORA + 20_000, '9f8c1d2e-4b6a-4c3d');
    expect(uno).not.toBe(otro);
  });

  it('lleva el viaje adentro: dos viajes no comparten clave', () => {
    expect(buildClientKey('t1', AHORA, 'a')).not.toBe(buildClientKey('t2', AHORA, 'a'));
  });
});

describe('toCyclePayload', () => {
  it('lleva el m³ medido', () => {
    expect(toCyclePayload({ m3: '8.5', note: '' }, 'k')).toEqual({ m3: 8.5, clientKey: 'k' });
  });

  it('acepta la coma decimal, que es como se teclea acá', () => {
    expect(toCyclePayload({ m3: '8,5', note: '' }, 'k').m3).toBe(8.5);
  });

  /**
   * La liquidación distingue «no se midió» de «midió cero». Un cero inventado
   * es una vuelta que no se cobra.
   */
  it('el m³ vacío viaja AUSENTE, no como cero', () => {
    expect(toCyclePayload({ m3: '', note: '' }, 'k')).not.toHaveProperty('m3');
    expect(toCyclePayload({ m3: '0', note: '' }, 'k')).not.toHaveProperty('m3');
    expect(toCyclePayload({ m3: 'ocho', note: '' }, 'k')).not.toHaveProperty('m3');
  });

  it('la nota en blanco no ensucia el registro', () => {
    expect(toCyclePayload({ m3: '5', note: '   ' }, 'k')).not.toHaveProperty('note');
  });

  it('la clave siempre viaja', () => {
    expect(toCyclePayload({ m3: '', note: '' }, 'k-123').clientKey).toBe('k-123');
  });
});

describe('cyclesLabel', () => {
  it('singular y plural', () => {
    expect(cyclesLabel(1)).toBe('1 vuelta');
    expect(cyclesLabel(7)).toBe('7 vueltas');
    expect(cyclesLabel(0)).toBe('0 vueltas');
  });
});
