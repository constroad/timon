import {
  MAX_SIGNATURE_BYTES,
  canSubmitPod,
  emptyPod,
  hasRealSignature,
  podProblems,
  strokesToPath,
  toPodPayload,
  type PodDraft,
  type Stroke,
} from './pod';

/**
 * La constancia es la prueba de que la carga se entregó: de ella cuelgan el
 * cierre del viaje, la facturación y cualquier reclamo. Lo que estos tests
 * protegen es que no se pueda cerrar una entrega sin prueba.
 */

const draft = (over: Partial<PodDraft> = {}): PodDraft => ({
  receiverName: 'Luis Camacho',
  receiverDni: '',
  signatureDataUrl: 'data:image/png;base64,AAAA',
  ...over,
});

const trazo = (puntos: number): Stroke =>
  Array.from({ length: puntos }, (_unused, index) => ({ x: index, y: index * 2 }));

describe('podProblems', () => {
  it('una constancia completa no tiene problemas', () => {
    expect(podProblems(draft())).toEqual([]);
    expect(canSubmitPod(draft())).toBe(true);
  });

  it('sin nombre de quien recibe no se puede cerrar', () => {
    expect(podProblems(draft({ receiverName: '' }))).toContain('sin-nombre');
    expect(podProblems(draft({ receiverName: '  a ' }))).toContain('sin-nombre');
  });

  it('sin firma no hay constancia', () => {
    expect(podProblems(draft({ signatureDataUrl: '' }))).toContain('sin-firma');
  });

  /**
   * El DNI NO es obligatorio: hay obras donde recibe un ayudante sin documento a
   * mano, y exigirlo dejaría al chofer sin poder cerrar una entrega que YA
   * ocurrió.
   */
  it('el DNI es opcional', () => {
    expect(canSubmitPod(draft({ receiverDni: '' }))).toBe(true);
  });

  it('una firma que excede el tope del server se avisa antes de enviarla', () => {
    const enorme = 'data:image/png;base64,' + 'A'.repeat(MAX_SIGNATURE_BYTES);

    expect(podProblems(draft({ signatureDataUrl: enorme }))).toEqual(['firma-pesada']);
  });

  it('la constancia vacía reclama nombre y firma', () => {
    expect(podProblems(emptyPod).sort()).toEqual(['sin-firma', 'sin-nombre']);
  });
});

describe('toPodPayload', () => {
  it('recorta los espacios del nombre', () => {
    expect(toPodPayload(draft({ receiverName: '  Luis Camacho  ' })).receiverName).toBe(
      'Luis Camacho'
    );
  });

  it('lleva el DNI cuando lo hay', () => {
    expect(toPodPayload(draft({ receiverDni: '44556677' })).receiverDni).toBe('44556677');
  });

  /**
   * Un DNI vacío se leería en la constancia como «se le pidió y no lo tenía», y
   * lo que pasó es que no se le pidió. Viaja AUSENTE.
   */
  it('el DNI vacío viaja ausente, no como cadena vacía', () => {
    expect(toPodPayload(draft({ receiverDni: '   ' }))).not.toHaveProperty('receiverDni');
  });
});

describe('strokesToPath', () => {
  it('cada trazo arranca con M y sigue con L', () => {
    expect(strokesToPath([[{ x: 1, y: 2 }, { x: 3, y: 4 }]])).toBe('M1.0 2.0 L3.0 4.0');
  });

  it('varios trazos conviven en un solo path', () => {
    const path = strokesToPath([[{ x: 0, y: 0 }], [{ x: 5, y: 5 }]]);

    expect(path.match(/M/g)).toHaveLength(2);
  });

  it('los trazos vacíos no ensucian el path', () => {
    expect(strokesToPath([[], [{ x: 1, y: 1 }]])).toBe('M1.0 1.0');
  });

  it('sin trazos el path queda vacío', () => {
    expect(strokesToPath([])).toBe('');
  });
});

describe('hasRealSignature', () => {
  /**
   * Un punto no es una firma. Si se aceptara, el chofer cerraría la entrega
   * tocando la pantalla sin querer: constancia vacía de contenido y llena de
   * consecuencias.
   */
  it('un toque suelto no cuenta como firma', () => {
    expect(hasRealSignature([trazo(1)])).toBe(false);
    expect(hasRealSignature([trazo(3), trazo(2)])).toBe(false);
  });

  it('un trazo de verdad sí cuenta', () => {
    expect(hasRealSignature([trazo(20)])).toBe(true);
  });

  it('varios trazos cortos suman', () => {
    expect(hasRealSignature([trazo(4), trazo(4)])).toBe(true);
  });

  it('sin trazos no hay firma', () => {
    expect(hasRealSignature([])).toBe(false);
  });
});
