/**
 * Constancia de entrega (Timón · A3). Motor PURO.
 *
 * La firma **no es un adorno del formulario: es la prueba de que la carga se
 * entregó**. De ella cuelgan el cierre del viaje, la facturación y cualquier
 * reclamo posterior, así que las reglas de acá son de negocio, no de UI.
 */

export interface PodDraft {
  receiverName: string;
  receiverDni: string;
  /** PNG en dataURL, capturado del trazo. Vacío = todavía no firmó. */
  signatureDataUrl: string;
}

/** Tope del server (400 KB). Un trazo normal pesa ~20 KB; esto es la red. */
export const MAX_SIGNATURE_BYTES = 400_000;

export const emptyPod: PodDraft = { receiverName: '', receiverDni: '', signatureDataUrl: '' };

export type PodProblem = 'sin-nombre' | 'sin-firma' | 'firma-pesada';

/**
 * Qué le falta a la constancia para poder enviarse.
 *
 * El DNI **no** es obligatorio: hay obras donde el que recibe es un ayudante sin
 * documento a mano, y exigirlo dejaría al chofer sin poder cerrar una entrega
 * que ya ocurrió. El nombre y la firma sí: sin ellos no hay constancia de nada.
 */
export function podProblems(draft: PodDraft): PodProblem[] {
  const problems: PodProblem[] = [];
  if (draft.receiverName.trim().length < 3) problems.push('sin-nombre');
  if (!draft.signatureDataUrl) problems.push('sin-firma');
  else if (draft.signatureDataUrl.length > MAX_SIGNATURE_BYTES) problems.push('firma-pesada');
  return problems;
}

export const canSubmitPod = (draft: PodDraft): boolean => podProblems(draft).length === 0;

export const POD_PROBLEM_TEXT: Record<PodProblem, string> = {
  'sin-nombre': 'Escribe el nombre de quien recibe',
  'sin-firma': 'Falta la firma de quien recibe',
  'firma-pesada': 'La firma quedó muy pesada. Bórrala y vuelve a firmar.',
};

/**
 * Draft → cuerpo del request.
 *
 * El DNI vacío viaja **ausente**, no como cadena vacía: en la constancia
 * guardada, `''` se leería como «se le pidió el documento y no lo tenía», y lo
 * que pasó es que no se le pidió.
 */
export function toPodPayload(draft: PodDraft) {
  const receiverDni = draft.receiverDni.trim();
  return {
    receiverName: draft.receiverName.trim(),
    signatureDataUrl: draft.signatureDataUrl,
    ...(receiverDni ? { receiverDni } : {}),
  };
}

/** Trazos del dedo → un solo `path` de SVG. */
export type Stroke = { x: number; y: number }[];

export function strokesToPath(strokes: Stroke[]): string {
  return strokes
    .filter((stroke) => stroke.length > 0)
    .map((stroke) =>
      stroke
        .map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x.toFixed(1)} ${point.y.toFixed(1)}`)
        .join(' ')
    )
    .join(' ');
}

/**
 * ¿Hay algo firmado, o solo un toque suelto?
 *
 * Un punto no es una firma: si se aceptara, el chofer cerraría la entrega
 * tocando la pantalla sin querer y la constancia quedaría vacía de contenido
 * pero llena de consecuencias.
 */
export function hasRealSignature(strokes: Stroke[]): boolean {
  return strokes.reduce((total, stroke) => total + stroke.length, 0) >= 8;
}
