import {
  MAX_BUFFERED_POINTS,
  addPoint,
  dropSent,
  parseBuffer,
  takeBatch,
  type BufferedPoint,
} from './buffer';

/**
 * El rastro se junta en el teléfono y se sube en lotes. Lo que estos tests
 * protegen es el caso que define el diseño: dos horas sin señal en la sierra y
 * el chofer vuelve con ~120 puntos. No se pueden perder, no se pueden duplicar,
 * y no pueden crecer sin techo hasta llenarle el teléfono.
 */

const AHORA = 1_800_000_000_000;

const punto = (over: Partial<BufferedPoint> = {}): BufferedPoint => ({
  id: 'p1',
  lat: -12.0464,
  lng: -77.0428,
  at: new Date(AHORA).toISOString(),
  accuracyM: 12,
  ...over,
});

describe('addPoint', () => {
  it('guarda el punto', () => {
    expect(addPoint([], punto())).toHaveLength(1);
  });

  /** El servicio puede reentregar el mismo fix; el rastro no puede repetirlo. */
  it('el mismo punto dos veces es uno solo', () => {
    expect(addPoint(addPoint([], punto()), punto())).toHaveLength(1);
  });

  it('un fix impreciso no entra al buffer', () => {
    expect(addPoint([], punto({ accuracyM: 250 }))).toHaveLength(0);
  });

  /**
   * Techo duro: sin él, un viaje con la subida rota le llena el teléfono al
   * chofer. Se tira lo MÁS VIEJO — el rastro reciente es el que la torre usa.
   */
  it('lleno, descarta lo más viejo y conserva lo nuevo', () => {
    const lleno = Array.from({ length: MAX_BUFFERED_POINTS }, (_, i) => punto({ id: `p${i}` }));
    const resultado = addPoint(lleno, punto({ id: 'nuevo' }));
    expect(resultado).toHaveLength(MAX_BUFFERED_POINTS);
    expect(resultado[resultado.length - 1].id).toBe('nuevo');
    expect(resultado.some((p) => p.id === 'p0')).toBe(false);
  });
});

describe('takeBatch', () => {
  it('sin puntos no hay lote', () => {
    expect(takeBatch([])).toEqual([]);
  });

  /** Más que esto no es un lote, es un volcado: el server lo corta igual. */
  it('el lote no pasa de 200 puntos', () => {
    const muchos = Array.from({ length: 500 }, (_, i) => punto({ id: `p${i}` }));
    expect(takeBatch(muchos)).toHaveLength(200);
  });

  it('manda primero lo más viejo', () => {
    const cola = [punto({ id: 'viejo' }), punto({ id: 'nuevo' })];
    expect(takeBatch(cola)[0].id).toBe('viejo');
  });
});

describe('dropSent', () => {
  it('saca lo que el server ya aceptó', () => {
    const cola = [punto({ id: 'a' }), punto({ id: 'b' })];
    expect(dropSent(cola, [punto({ id: 'a' })]).map((p) => p.id)).toEqual(['b']);
  });

  /**
   * Los puntos que llegaron MIENTRAS se subía el lote no se pueden perder: se
   * borra por id, nunca «los primeros N».
   */
  it('no se lleva los que llegaron durante la subida', () => {
    const enviados = [punto({ id: 'a' })];
    const cola = [punto({ id: 'a' }), punto({ id: 'llegó-mientras' })];
    expect(dropSent(cola, enviados).map((p) => p.id)).toEqual(['llegó-mientras']);
  });
});

describe('parseBuffer', () => {
  it('recupera lo guardado en disco', () => {
    expect(parseBuffer(JSON.stringify([punto()]))).toHaveLength(1);
  });

  /** Un archivo a medias no puede impedir que el chofer trabaje. */
  it('un archivo corrupto no rompe el arranque', () => {
    expect(parseBuffer('{roto')).toEqual([]);
    expect(parseBuffer(null)).toEqual([]);
  });

  it('descarta entradas sin coordenadas', () => {
    const raw = JSON.stringify([{ id: 'x' }, punto({ id: 'buena' })]);
    expect(parseBuffer(raw).map((p) => p.id)).toEqual(['buena']);
  });
});
