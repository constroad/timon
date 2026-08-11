import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { fetchMinVersion } from '../api/client';
import { resolveVersionGate, shouldRecheckVersion, type VersionGate } from './gate';

/**
 * La compuerta de versión, viva (Timón · S6).
 *
 * A7 la dejó corriendo **al abrir la app**, y eso no alcanza: el chofer la deja
 * abierta todo el turno. Si el contrato de API cambia a media mañana, sigue
 * registrando vueltas y entregas que ya no llegan a ningún lado — y se entera
 * recién al día siguiente.
 *
 * Se vuelve a preguntar al volver la app al frente, con un piso de diez minutos
 * entre consultas. Es barato: la respuesta la sirve el Edge cacheada.
 */
export function useVersionGate(currentVersion: string) {
  const [gate, setGate] = useState<VersionGate | null>(null);
  const lastCheckAt = useRef<number | null>(null);

  const check = useCallback(async () => {
    const ahora = Date.now();
    if (!shouldRecheckVersion(lastCheckAt.current, ahora)) return;
    lastCheckAt.current = ahora;
    const { minVersion, downloadUrl } = await fetchMinVersion();
    const resultado = resolveVersionGate({ current: currentVersion, minimum: minVersion, downloadUrl });
    // Solo se ESCALA: una vez bloqueado no se desbloquea solo por una respuesta
    // que no llegó. Salir del bloqueo exige reabrir la app ya actualizada.
    setGate((previo) => (previo?.blocked && !resultado.blocked ? previo : resultado));
  }, [currentVersion]);

  useEffect(() => {
    void check();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void check();
    });
    return () => sub.remove();
  }, [check]);

  return gate;
}
