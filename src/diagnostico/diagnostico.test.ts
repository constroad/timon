import {
  agregar,
  cuerpoDeReporte,
  entradaDeError,
  entradaDePerf,
  esEntrada,
  parsearBuffer,
  MAX_ENTRADAS,
  type EntradaDiagnostico,
} from './diagnostico';

const perf = (op: string, cuando = 1): EntradaDiagnostico => ({ tipo: 'perf', cuando, op, ms: 10 });

describe('agregar (buffer rotativo)', () => {
  it('agrega al final', () => {
    const resultado = agregar([perf('a')], perf('b'));
    expect(resultado.map((entrada) => (entrada.tipo === 'perf' ? entrada.op : ''))).toEqual(['a', 'b']);
  });

  it('recorta a las últimas `max`, tirando lo más viejo', () => {
    const base = Array.from({ length: 5 }, (_, i) => perf(`op${i}`, i));
    const resultado = agregar(base, perf('nuevo', 99), 3);
    expect(resultado).toHaveLength(3);
    expect(resultado.map((e) => (e.tipo === 'perf' ? e.op : ''))).toEqual(['op3', 'op4', 'nuevo']);
  });

  it('no muta el buffer original', () => {
    const base = [perf('a')];
    agregar(base, perf('b'));
    expect(base).toHaveLength(1);
  });
});

describe('entradaDeError (acota y no filtra datos de más)', () => {
  it('toma message y stack de un Error, con el origen', () => {
    const entrada = entradaDeError(new Error('boom'), 'global', 123);
    expect(entrada).toMatchObject({ tipo: 'error', cuando: 123, mensaje: 'boom', origen: 'global' });
    expect(entrada.stack).toContain('boom');
  });

  it('un string suelto queda como mensaje, sin stack', () => {
    const entrada = entradaDeError('se cayó', undefined, 1);
    expect(entrada).toEqual({ tipo: 'error', cuando: 1, mensaje: 'se cayó' });
  });

  it('recorta un mensaje larguísimo a 500', () => {
    const entrada = entradaDeError('x'.repeat(5000), undefined, 1);
    expect(entrada.mensaje).toHaveLength(500);
  });

  it('null/undefined no explotan', () => {
    expect(entradaDeError(null, undefined, 1).mensaje).toBe('null');
    expect(entradaDeError(undefined, undefined, 1).mensaje).toBe('undefined');
  });
});

describe('entradaDePerf (redondeo)', () => {
  it('redondea los ms y conserva el extra', () => {
    const entrada = entradaDePerf('resume', 12.7, { n: 3 }, 9);
    expect(entrada).toEqual({ tipo: 'perf', cuando: 9, op: 'resume', ms: 13, extra: { n: 3 } });
  });

  it('sin extra no agrega la clave', () => {
    expect(entradaDePerf('x', 5, undefined, 1)).toEqual({ tipo: 'perf', cuando: 1, op: 'x', ms: 5 });
  });
});

describe('parsearBuffer / esEntrada (archivo corrupto)', () => {
  it('descarta lo que no es entrada y acota', () => {
    const crudo = [perf('a'), { tipo: 'basura' }, null, 42, entradaDeError('e', undefined, 1)];
    const resultado = parsearBuffer(crudo, MAX_ENTRADAS);
    expect(resultado).toHaveLength(2);
  });

  it('algo que no es arreglo da vacío', () => {
    expect(parsearBuffer({ cualquier: 'cosa' })).toEqual([]);
    expect(parsearBuffer('[]')).toEqual([]);
  });

  it('esEntrada reconoce error y perf, nada más', () => {
    expect(esEntrada(perf('a'))).toBe(true);
    expect(esEntrada({ tipo: 'error', cuando: 1, mensaje: 'x' })).toBe(true);
    expect(esEntrada({ tipo: 'otra' })).toBe(false);
    expect(esEntrada(null)).toBe(false);
  });
});

describe('cuerpoDeReporte (lo que viaja a LilaStore)', () => {
  it('arma el cuerpo con plataforma android y el meta', () => {
    const entradas = [perf('a')];
    const cuerpo = cuerpoDeReporte(entradas, {
      slug: 'timon',
      installId: 'anon-123',
      version: '0.4.2',
      versionCode: 13,
    });
    expect(cuerpo).toEqual({
      slug: 'timon',
      installId: 'anon-123',
      version: '0.4.2',
      versionCode: 13,
      plataforma: 'android',
      entradas,
    });
  });
});
