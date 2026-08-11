/**
 * Compuerta de versión mínima (Timón · A7 §6-1). Motor PURO.
 *
 * Un APK fuera de la tienda **no se actualiza solo**: con 30 choferes, en tres
 * meses hay cinco versiones distintas en la calle. Sin esta compuerta, un cambio
 * de contrato de API rompe teléfonos a los que nadie puede llegar — el chofer no
 * ve un aviso, ve una app que falla.
 *
 * El riesgo simétrico manda el diseño: una compuerta que se equivoca deja a la
 * flota entera sin poder trabajar. Por eso **ante la duda, deja pasar**: si el
 * server no contestó o la versión mínima viene ilegible, no bloquea. Un contrato
 * viejo hace menos daño que 30 camiones sin poder registrar nada.
 */

export interface VersionGate {
  blocked: boolean;
  message: string;
  /** Solo http(s): un enlace que no se puede abrir no se muestra. */
  downloadUrl: string | null;
}

/** `>0` si `a` es más nueva. Compara NÚMEROS: '0.10.0' es mayor que '0.9.0'. */
export function compareVersions(a: string, b: string): number {
  const partesA = toParts(a);
  const partesB = toParts(b);
  const largo = Math.max(partesA.length, partesB.length);
  for (let i = 0; i < largo; i += 1) {
    const diferencia = (partesA[i] ?? 0) - (partesB[i] ?? 0);
    if (diferencia !== 0) return diferencia;
  }
  return 0;
}

export function resolveVersionGate(params: {
  current: string;
  minimum?: string | null;
  downloadUrl?: string | null;
}): VersionGate {
  const libre: VersionGate = { blocked: false, message: '', downloadUrl: null };

  const minima = String(params.minimum ?? '').trim();
  if (!minima || toParts(minima).length === 0) return libre;
  if (compareVersions(params.current, minima) >= 0) return libre;

  return {
    blocked: true,
    message: `Tienes que actualizar Timón para seguir trabajando (necesitas la versión ${minima} o mayor).`,
    downloadUrl: toSafeUrl(params.downloadUrl),
  };
}

/** `'1.2'` → `[1, 2]`. Lo que no sea número se descarta entero. */
function toParts(version: string): number[] {
  const partes = String(version ?? '')
    .trim()
    .split('.')
    .map((parte) => Number(parte.replace(/[^0-9]/g, '')));
  return partes.some((parte) => !Number.isFinite(parte)) || partes.length === 0 ? [] : partes;
}

function toSafeUrl(url?: string | null): string | null {
  const limpio = String(url ?? '').trim();
  return /^https?:\/\//i.test(limpio) ? limpio : null;
}

/**
 * Cada cuánto se vuelve a preguntar la versión mínima con la app abierta.
 *
 * La compuerta corriendo solo al abrir no alcanza: el chofer deja la app abierta
 * todo el turno, y si el contrato cambia a media mañana sigue registrando cosas
 * que ya no llegan. Diez minutos es barato —la respuesta la sirve el Edge
 * cacheada— y suficiente para que nadie trabaje media jornada contra un
 * contrato viejo.
 */
export const RECHECK_MS = 10 * 60_000;

export function shouldRecheckVersion(lastCheckAt: number | null, now: number): boolean {
  if (lastCheckAt === null) return true;
  // Un reloj que saltó hacia atrás no puede dejar la compuerta congelada.
  if (now < lastCheckAt) return true;
  return now - lastCheckAt >= RECHECK_MS;
}
