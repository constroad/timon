import { canTrackInBackground, resolvePermissionWarning } from './permission';

/**
 * El defecto que estos tests fijan: el chofer concedía «solo mientras uso la
 * app» y la app **no rastreaba nada**, ni siquiera con la pantalla encendida.
 * El permiso «todo el tiempo» nunca fue obligatorio en Android — el servicio en
 * primer plano con notificación lo reemplaza (lo dice el propio expo-location:
 * «this does NOT require the background location permission»).
 */
describe('canTrackInBackground', () => {
  it('en Android, «mientras uso la app» ALCANZA: el servicio hace el resto', () => {
    expect(
      canTrackInBackground({ platform: 'android', foregroundGranted: true, backgroundGranted: false })
    ).toBe(true);
  });

  it('en Android con «todo el tiempo» también rastrea, obviamente', () => {
    expect(
      canTrackInBackground({ platform: 'android', foregroundGranted: true, backgroundGranted: true })
    ).toBe(true);
  });

  /** Sin el permiso base no hay nada que hacer: ni servicio ni fix. */
  it('sin permiso de ubicación no se rastrea en ninguna plataforma', () => {
    expect(
      canTrackInBackground({ platform: 'android', foregroundGranted: false, backgroundGranted: false })
    ).toBe(false);
    expect(
      canTrackInBackground({ platform: 'ios', foregroundGranted: false, backgroundGranted: true })
    ).toBe(false);
  });

  /**
   * iOS es distinto de verdad: sin «Siempre» el sistema corta las entregas al
   * salir de la app, y no hay servicio en primer plano que lo compense.
   */
  it('en iOS sí hace falta «Siempre»', () => {
    expect(
      canTrackInBackground({ platform: 'ios', foregroundGranted: true, backgroundGranted: false })
    ).toBe(false);
    expect(
      canTrackInBackground({ platform: 'ios', foregroundGranted: true, backgroundGranted: true })
    ).toBe(true);
  });
});

describe('resolvePermissionWarning', () => {
  /**
   * El aviso viejo («tu ubicación solo se comparte con la app abierta») era
   * FALSO en Android con el servicio andando, y mandaba al chofer a Ajustes a
   * cambiar algo que ya funcionaba.
   */
  it('en Android con «mientras uso la app» NO avisa nada: funciona', () => {
    expect(
      resolvePermissionWarning({
        platform: 'android',
        tripEnCurso: true,
        foregroundGranted: true,
        backgroundGranted: false,
      })
    ).toBeNull();
  });

  it('sin permiso de ubicación avisa y dice qué tocar', () => {
    const aviso = resolvePermissionWarning({
      platform: 'android',
      tripEnCurso: true,
      foregroundGranted: false,
      backgroundGranted: false,
    });

    expect(aviso).toContain('ubicación');
    expect(aviso).toContain('Ajustes');
  });

  it('sin viaje en curso no molesta con permisos', () => {
    expect(
      resolvePermissionWarning({
        platform: 'android',
        tripEnCurso: false,
        foregroundGranted: false,
        backgroundGranted: false,
      })
    ).toBeNull();
  });

  it('en iOS con «mientras uso la app» sí avisa: ahí el rastro se corta', () => {
    expect(
      resolvePermissionWarning({
        platform: 'ios',
        tripEnCurso: true,
        foregroundGranted: true,
        backgroundGranted: false,
      })
    ).not.toBeNull();
  });

  /** Ningún texto del chofer nombra a quién lo mira: no es una vigilancia. */
  it('el aviso no menciona a la oficina ni a nadie mirándolo', () => {
    const avisos = (['android', 'ios'] as const).flatMap((platform) =>
      [true, false].map((backgroundGranted) =>
        resolvePermissionWarning({
          platform,
          tripEnCurso: true,
          foregroundGranted: true,
          backgroundGranted,
        })
      )
    );

    avisos.forEach((aviso) => {
      expect(String(aviso ?? '')).not.toMatch(/oficina|viendo|vigil|control/i);
    });
  });
});
