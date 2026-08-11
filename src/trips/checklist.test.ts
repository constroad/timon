import {
  checklistProgress,
  failedItems,
  isChecklistComplete,
  toChecklistPayload,
  type AnswerMap,
  type ChecklistItem,
} from './checklist';

/**
 * El checklist es evidencia: dice que alguien miró las luces y los frenos antes
 * de salir. Lo que estos tests protegen es que no se pueda firmar en blanco.
 */

const ITEMS: ChecklistItem[] = [
  { key: 'luces', label: 'Luces' },
  { key: 'frenos', label: 'Frenos', critical: true },
  { key: 'llantas', label: 'Llantas' },
];

const respuestas = (map: AnswerMap): AnswerMap => map;

describe('isChecklistComplete', () => {
  /** Un checklist a medias no es un checklist: es una firma en blanco. */
  it('exige responder TODOS los ítems', () => {
    expect(isChecklistComplete(ITEMS, respuestas({ luces: { ok: true } }))).toBe(false);
    expect(
      isChecklistComplete(
        ITEMS,
        respuestas({ luces: { ok: true }, frenos: { ok: true }, llantas: { ok: true } })
      )
    ).toBe(true);
  });

  /** Responder «mal» ES responder: lo que no vale es dejarlo en blanco. */
  it('un ítem en mal estado cuenta como respondido', () => {
    expect(
      isChecklistComplete(
        ITEMS,
        respuestas({ luces: { ok: false }, frenos: { ok: true }, llantas: { ok: true } })
      )
    ).toBe(true);
  });

  it('sin catálogo no hay checklist que completar', () => {
    expect(isChecklistComplete([], {})).toBe(false);
  });
});

describe('checklistProgress', () => {
  it('cuenta lo respondido y lo que falta', () => {
    expect(checklistProgress(ITEMS, respuestas({ luces: { ok: true }, frenos: { ok: false } })))
      .toEqual({ answered: 2, total: 3, pending: 1 });
  });
});

describe('failedItems', () => {
  /**
   * Se le muestran al chofer ANTES de enviar: si el server rechaza la salida por
   * un crítico, que no sea una sorpresa.
   */
  it('devuelve solo lo marcado en mal estado', () => {
    const malos = failedItems(
      ITEMS,
      respuestas({ luces: { ok: true }, frenos: { ok: false }, llantas: { ok: false } })
    );

    expect(malos.map((item) => item.key)).toEqual(['frenos', 'llantas']);
  });

  it('sin fallas devuelve vacío', () => {
    expect(failedItems(ITEMS, respuestas({ luces: { ok: true } }))).toEqual([]);
  });
});

describe('toChecklistPayload', () => {
  it('arma el cuerpo en el orden del catálogo', () => {
    const payload = toChecklistPayload(
      ITEMS,
      respuestas({ llantas: { ok: true }, luces: { ok: true }, frenos: { ok: false } })
    );

    expect(payload.map((row) => row.key)).toEqual(['luces', 'frenos', 'llantas']);
  });

  it('lleva la nota cuando la hay', () => {
    const payload = toChecklistPayload(
      ITEMS,
      respuestas({ frenos: { ok: false, note: 'Pedal esponjoso' } })
    );

    expect(payload).toEqual([{ key: 'frenos', ok: false, note: 'Pedal esponjoso' }]);
  });

  /** Una nota vacía es ruido en la evidencia, no un dato. */
  it('descarta notas en blanco', () => {
    const payload = toChecklistPayload(ITEMS, respuestas({ luces: { ok: true, note: '   ' } }));

    expect(payload[0]).not.toHaveProperty('note');
  });

  it('ignora ítems sin responder', () => {
    expect(toChecklistPayload(ITEMS, respuestas({ luces: { ok: true } }))).toHaveLength(1);
  });
});
