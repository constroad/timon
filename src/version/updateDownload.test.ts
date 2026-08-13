import { apkFileName, downloadRatio, resolveInstallHint } from './updateDownload';

/**
 * Bajar la actualización DENTRO de la app.
 *
 * Antes el botón abría la URL en el navegador: el chofer salía de la app, veía
 * una URL cruda de un host raro y tenía que encontrar la descarga en el gestor
 * del sistema. Acá se baja con barra y se instala desde la misma pantalla.
 */
describe('apkFileName', () => {
  it('usa el nombre real del archivo', () => {
    expect(apkFileName('https://host/files/drive/timon-0_2_6-8_1a93.apk')).toBe(
      'timon-0_2_6-8_1a93.apk'
    );
  });

  it('ignora query y fragmento', () => {
    expect(apkFileName('https://host/timon.apk?v=3#x')).toBe('timon.apk');
  });

  it('sin nombre usable inventa uno con .apk: el instalador lo exige', () => {
    expect(apkFileName('https://host/')).toBe('timon-update.apk');
    expect(apkFileName('')).toBe('timon-update.apk');
  });
});

describe('downloadRatio', () => {
  it('progreso normal', () => {
    expect(downloadRatio({ totalBytesWritten: 25, totalBytesExpectedToWrite: 100 })).toBe(0.25);
  });

  /** Sin tamaño esperado no se inventa un porcentaje. */
  it('sin total, null', () => {
    expect(downloadRatio({ totalBytesWritten: 25, totalBytesExpectedToWrite: 0 })).toBeNull();
    expect(downloadRatio({ totalBytesWritten: 25, totalBytesExpectedToWrite: -1 })).toBeNull();
  });

  it('nunca pasa de 1', () => {
    expect(downloadRatio({ totalBytesWritten: 120, totalBytesExpectedToWrite: 100 })).toBe(1);
  });
});

describe('resolveInstallHint', () => {
  it('cuando el sistema bloquea la instalación, dice QUÉ hacer', () => {
    const hint = resolveInstallHint(new Error('INSTALL_PACKAGES permission denied'));

    expect(hint).toContain('Ajustes');
  });

  it('otro error no inventa una explicación', () => {
    expect(resolveInstallHint(new Error('boom'))).toContain('No se pudo abrir');
  });
});
