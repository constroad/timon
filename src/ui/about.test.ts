import { buildAboutRows, isSvgUrl, resolveUpdateState } from './about';

/**
 * La pantalla «Acerca de» existe para responder una pregunta muy concreta
 * cuando algo falla: **qué versión tiene ESE teléfono**. Sin eso, «no me
 * funciona» es indistinguible de «tenés una app de hace tres meses».
 */
describe('buildAboutRows', () => {
  it('lo primero es la versión, con el build al lado', () => {
    const filas = buildAboutRows({
      version: '0.2.4',
      buildNumber: 6,
      companyName: 'TEST COMPANY',
      driverName: 'José Zamora',
      serverUrl: 'https://www.constroad.com',
    });

    expect(filas[0]).toEqual({ label: 'Versión', value: '0.2.4 (build 6)' });
    expect(filas.map((fila) => fila.value)).toContain('TEST COMPANY');
    expect(filas.map((fila) => fila.value)).toContain('José Zamora');
    // El server importa cuando alguien reparte un APK apuntando a otro lado:
    // es la primera pregunta que hicimos el día que la app decía «sin conexión».
    expect(filas.map((fila) => fila.value)).toContain('https://www.constroad.com');
  });

  it('sin chofer ni empresa no muestra filas vacías', () => {
    const filas = buildAboutRows({ version: '0.2.4', buildNumber: 6, serverUrl: 'https://x' });

    expect(filas.some((fila) => fila.value === '')).toBe(false);
  });
});

describe('resolveUpdateState', () => {
  it('al día cuando la instalada alcanza la mínima', () => {
    expect(resolveUpdateState({ current: '0.2.4', minimum: '0.2.4' }).outdated).toBe(false);
    expect(resolveUpdateState({ current: '0.3.0', minimum: '0.2.4' }).outdated).toBe(false);
  });

  it('desactualizada cuando el server pide más', () => {
    const estado = resolveUpdateState({ current: '0.2.3', minimum: '0.2.4' });

    expect(estado.outdated).toBe(true);
    expect(estado.message).toContain('0.2.4');
  });

  /** Sin respuesta del server no se afirma nada: no saber ≠ estar desactualizado. */
  it('sin mínima conocida, no dice que esté desactualizada', () => {
    expect(resolveUpdateState({ current: '0.2.4', minimum: '' }).outdated).toBe(false);
    expect(resolveUpdateState({ current: '0.2.4', minimum: undefined }).outdated).toBe(false);
  });
});

describe('isSvgUrl', () => {
  /**
   * El logo de la empresa suele venir en SVG y `<Image>` de React Native **no
   * lo renderiza**: no falla, simplemente no dibuja nada. El header quedó sin
   * logo por esto y no había ningún error que lo delatara.
   */
  it('reconoce el SVG aunque traiga query', () => {
    expect(isSvgUrl('https://host/logos/light_test_123.svg')).toBe(true);
    expect(isSvgUrl('https://host/logos/light.svg?v=2')).toBe(true);
    expect(isSvgUrl('https://host/logos/LIGHT.SVG')).toBe(true);
  });

  it('un PNG/JPG va por el camino normal', () => {
    expect(isSvgUrl('https://host/logo.png')).toBe(false);
    expect(isSvgUrl('')).toBe(false);
    expect(isSvgUrl(undefined)).toBe(false);
  });
});
