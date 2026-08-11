export interface ChecklistItem {
  key: string;
  label: string;
  /** Un ítem crítico en mal estado bloquea la salida (lo decide el server). */
  critical?: boolean;
}

export interface ChecklistAnswer {
  key: string;
  ok: boolean;
  note?: string;
}

/**
 * Checklist de pre-viaje (Timón · A3). Motor PURO.
 *
 * El catálogo lo manda el server —cada empresa arma el suyo— y acá solo se
 * lleva la cuenta de lo respondido. Dos reglas que no son de UI:
 *
 * 1. **No se puede enviar a medias.** Un checklist con ítems sin responder no
 *    es un checklist: es una firma en blanco. El chofer responde todo o no sale.
 * 2. **Marcar «mal» NO bloquea acá.** Quien decide si un desperfecto impide la
 *    salida es el servidor (`CHECKLIST_CRITICAL_CODE`), que conoce la
 *    configuración de la empresa. La app que se adelante a decir «no puedes
 *    salir» acabaría contradiciéndolo el día que la empresa cambie sus reglas.
 */

export type AnswerMap = Record<string, { ok: boolean; note?: string }>;

/** Cuántos van y cuántos faltan, para el contador de la pantalla. */
export function checklistProgress(items: ChecklistItem[], answers: AnswerMap) {
  const answered = items.filter((item) => answers[item.key] !== undefined).length;
  return { answered, total: items.length, pending: items.length - answered };
}

export function isChecklistComplete(items: ChecklistItem[], answers: AnswerMap): boolean {
  return items.length > 0 && items.every((item) => answers[item.key] !== undefined);
}

/**
 * Ítems marcados en mal estado. Se muestran al chofer ANTES de enviar, para que
 * sepa qué está declarando: si el server lo rechaza por un crítico, que no sea
 * una sorpresa.
 */
export function failedItems(items: ChecklistItem[], answers: AnswerMap): ChecklistItem[] {
  return items.filter((item) => answers[item.key]?.ok === false);
}

/** Respuestas → cuerpo del request. Sin notas vacías: ruido en la evidencia. */
export function toChecklistPayload(
  items: ChecklistItem[],
  answers: AnswerMap
): ChecklistAnswer[] {
  return items
    .filter((item) => answers[item.key] !== undefined)
    .map((item) => {
      const answer = answers[item.key];
      const note = String(answer.note ?? '').trim();
      return { key: item.key, ok: answer.ok, ...(note ? { note } : {}) };
    });
}
