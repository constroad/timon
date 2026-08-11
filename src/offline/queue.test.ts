import {
  MAX_PENDING,
  backoffMs,
  classifyStatus,
  applyOutcome,
  enqueue,
  nextReady,
  parseQueue,
  pendingLabel,
  reviveAll,
  type QueuedAction,
} from './queue';

/**
 * La cola guarda cosas que ya PASARON: una vuelta que el chofer dio, una
 * entrega que firmó. Perderlas es plata; duplicarlas también. Estos tests fijan
 * las dos cosas y, sobre todo, que la cola **nunca se trabe**: una sola acción
 * atorada al frente dejaría al chofer sin poder registrar nada más en el día.
 */

const AHORA = 1_800_000_000_000;

const accion = (over: Partial<QueuedAction> = {}): QueuedAction => ({
  id: 'k1',
  stream: 'viaje-1',
  body: { tripId: 'viaje-1', cycle: { clientKey: 'k1' } },
  label: 'Vuelta registrada',
  createdAt: AHORA,
  attempts: 0,
  nextAttemptAt: AHORA,
  ...over,
});

describe('enqueue', () => {
  it('acepta la acción y la deja pendiente', () => {
    const { queue, accepted } = enqueue([], accion());
    expect(accepted).toBe(true);
    expect(queue).toHaveLength(1);
  });

  /** Sin red el botón no da feedback inmediato y el dedo insiste. */
  it('el mismo tap encolado dos veces es UNA acción', () => {
    const primera = enqueue([], accion()).queue;
    const { queue, accepted } = enqueue(primera, accion());
    expect(queue).toHaveLength(1);
    expect(accepted).toBe(true);
  });

  it('dos acciones distintas conviven', () => {
    const primera = enqueue([], accion()).queue;
    expect(enqueue(primera, accion({ id: 'k2' })).queue).toHaveLength(2);
  });

  /**
   * Llena, se RECHAZA lo nuevo y no se descarta lo viejo: lo guardado es una
   * firma o una vuelta que ya ocurrió, y lo nuevo el chofer todavía lo tiene
   * en pantalla para reintentar.
   */
  it('llena, rechaza lo nuevo sin perder lo guardado', () => {
    const llena = Array.from({ length: MAX_PENDING }, (_, i) => accion({ id: `k${i}` }));
    const { queue, accepted } = enqueue(llena, accion({ id: 'nueva' }));
    expect(accepted).toBe(false);
    expect(queue).toHaveLength(MAX_PENDING);
  });
});

describe('nextReady', () => {
  it('sin nada pendiente no devuelve nada', () => {
    expect(nextReady([], AHORA)).toBeNull();
  });

  /** Entregar antes de iniciar no existe: dentro de un viaje manda el orden. */
  it('respeta el orden dentro del mismo viaje', () => {
    const cola = [accion({ id: 'k1' }), accion({ id: 'k2' })];
    expect(nextReady(cola, AHORA)?.id).toBe('k1');
  });

  it('la acción esperando su reintento no se toma antes de tiempo', () => {
    const cola = [accion({ id: 'k1', attempts: 1, nextAttemptAt: AHORA + 5_000 })];
    expect(nextReady(cola, AHORA)).toBeNull();
    expect(nextReady(cola, AHORA + 5_000)?.id).toBe('k1');
  });

  /**
   * ESTA es la regla anti-traba: un viaje con su acción esperando no puede
   * frenar las vueltas de OTRO viaje.
   */
  it('un viaje esperando no bloquea a otro viaje', () => {
    const cola = [
      accion({ id: 'k1', stream: 'viaje-1', attempts: 3, nextAttemptAt: AHORA + 60_000 }),
      accion({ id: 'k2', stream: 'viaje-2' }),
    ];
    expect(nextReady(cola, AHORA)?.id).toBe('k2');
  });
});

describe('classifyStatus', () => {
  it('200 y 201 son éxito', () => {
    expect(classifyStatus(200)).toBe('ok');
    expect(classifyStatus(201)).toBe('ok');
  });

  /** El server ya lo tenía registrado: el reintento hizo su trabajo. */
  it('409 es ÉXITO, no un error', () => {
    expect(classifyStatus(409)).toBe('ok');
  });

  /**
   * En un avance de estado el 409 es el bloqueo (documento vencido, hallazgo
   * crítico): tratarlo como éxito le escondería al chofer por qué no salió.
   */
  it('para un avance de estado el 409 NO es éxito', () => {
    expect(classifyStatus(409, false)).toBe('drop');
  });

  it('la credencial revocada corta todo', () => {
    expect(classifyStatus(401)).toBe('revoked');
  });

  /** Reintentar esto mil veces trabaría la cola para siempre. */
  it('lo que el server rechaza para siempre se descarta', () => {
    [400, 403, 404, 410, 422].forEach((status) => expect(classifyStatus(status)).toBe('drop'));
  });

  it('sin red, saturado o caído se reintenta', () => {
    [0, 429, 500, 502, 503].forEach((status) => expect(classifyStatus(status)).toBe('retry'));
  });
});

describe('applyOutcome', () => {
  it('el éxito saca la acción de la cola', () => {
    expect(applyOutcome([accion()], 'k1', 'ok', AHORA)).toHaveLength(0);
  });

  it('lo descartado también sale', () => {
    expect(applyOutcome([accion()], 'k1', 'drop', AHORA)).toHaveLength(0);
  });

  it('el reintento cuenta el intento y espera', () => {
    const [pendiente] = applyOutcome([accion()], 'k1', 'retry', AHORA);
    expect(pendiente.attempts).toBe(1);
    expect(pendiente.nextAttemptAt).toBeGreaterThan(AHORA);
  });

  /** Un chofer dado de baja no sincroniza lo que tenía pendiente. */
  it('la credencial revocada vacía la cola entera', () => {
    const cola = [accion({ id: 'k1' }), accion({ id: 'k2', stream: 'viaje-2' })];
    expect(applyOutcome(cola, 'k1', 'revoked', AHORA)).toHaveLength(0);
  });

  it('no toca a las demás', () => {
    const cola = [accion({ id: 'k1' }), accion({ id: 'k2', stream: 'viaje-2' })];
    expect(applyOutcome(cola, 'k1', 'ok', AHORA).map((a) => a.id)).toEqual(['k2']);
  });
});

describe('backoffMs', () => {
  it('crece con los intentos', () => {
    expect(backoffMs(2)).toBeGreaterThan(backoffMs(1));
  });

  /** Sin tope, tras una noche sin señal el reintento caería en horas. */
  it('tiene techo de 5 minutos', () => {
    expect(backoffMs(50)).toBe(300_000);
  });
});

describe('reviveAll', () => {
  /** Volvió la señal: no tiene sentido seguir esperando el backoff. */
  it('vuelve a poner todo listo cuando reaparece la red', () => {
    const cola = [accion({ attempts: 4, nextAttemptAt: AHORA + 300_000 })];
    expect(nextReady(reviveAll(cola, AHORA), AHORA)?.id).toBe('k1');
  });

  it('no borra el historial de intentos', () => {
    expect(reviveAll([accion({ attempts: 4 })], AHORA)[0].attempts).toBe(4);
  });
});

describe('pendingLabel', () => {
  it('lo dice en singular y en plural', () => {
    expect(pendingLabel(1)).toBe('1 acción sin enviar');
    expect(pendingLabel(3)).toBe('3 acciones sin enviar');
  });

  it('sin pendientes no dice nada', () => {
    expect(pendingLabel(0)).toBeNull();
  });
});

describe('parseQueue', () => {
  it('recupera lo guardado', () => {
    expect(parseQueue(JSON.stringify([accion()]))).toHaveLength(1);
  });

  /** La app murió escribiendo: tiene que arrancar igual, no reventar. */
  it('un archivo corrupto no rompe el arranque', () => {
    expect(parseQueue('{no es json')).toEqual([]);
    expect(parseQueue('{"no":"es una lista"}')).toEqual([]);
    expect(parseQueue(null)).toEqual([]);
  });

  it('descarta las entradas incompletas y conserva las buenas', () => {
    const raw = JSON.stringify([{ id: 'roto' }, accion({ id: 'buena' })]);
    expect(parseQueue(raw).map((a) => a.id)).toEqual(['buena']);
  });
});
