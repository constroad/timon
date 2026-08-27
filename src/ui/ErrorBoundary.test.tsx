import type React from 'react';
import { Text } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';
import { ErrorBoundary } from './ErrorBoundary';

jest.mock('./reportarError', () => ({ reportarError: jest.fn() }));
import { reportarError } from './reportarError';

/**
 * Que el boundary ATRAPE de verdad.
 *
 * Sin este test lo único verificado sería que compila, y un boundary que
 * compila pero no atrapa es exactamente igual a no tener boundary — el chofer
 * ve la misma pantalla en blanco. `componentDidCatch` es la clase de cosa que
 * se da por hecha y falla en silencio.
 */
/**
 * `render` va envuelto en `act` — sin eso, con React 19 devuelve un objeto sin
 * las queries y el test falla con «getByText is not a function», que parece un
 * problema de la librería y es del entorno. Es el mismo patrón que ya usa
 * `e2e/setup.ts` de este repo.
 */
const montar = (elemento: React.ReactElement) =>
  act(async () => render(elemento)) as unknown as Promise<ReturnType<typeof render>>;

function Explota(): never {
  throw new Error('reventó al renderizar');
}

describe('ErrorBoundary', () => {
  /**
   * React escribe el error en la consola aunque el boundary lo maneje. Se
   * silencia para que la salida de los tests no parezca rota.
   */
  let consolaError: jest.SpyInstance;
  beforeEach(() => {
    consolaError = jest.spyOn(console, 'error').mockImplementation(() => {});
    (reportarError as jest.Mock).mockClear();
  });
  afterEach(() => consolaError.mockRestore());

  it('sin error, dibuja lo de adentro', async () => {
    const pantalla = await montar(
      <ErrorBoundary pantalla="viajes">
        <Text>contenido normal</Text>
      </ErrorBoundary>
    );

    expect(pantalla.getByText('contenido normal')).toBeTruthy();
  });

  it('con error, muestra la pantalla de disculpa en vez de nada', async () => {
    const pantalla = await montar(
      <ErrorBoundary pantalla="viajes">
        <Explota />
      </ErrorBoundary>
    );

    expect(pantalla.getByTestId('pantalla-rota')).toBeTruthy();
    expect(pantalla.getByTestId('btn-reintentar-pantalla')).toBeTruthy();
  });

  it('reporta el error con el nombre de la pantalla', async () => {
    const pantalla = await montar(
      <ErrorBoundary pantalla="viajes">
        <Explota />
      </ErrorBoundary>
    );

    expect(reportarError).toHaveBeenCalledTimes(1);
    expect((reportarError as jest.Mock).mock.calls[0][0]).toBe('viajes');
    expect(((reportarError as jest.Mock).mock.calls[0][1] as Error).message).toBe(
      'reventó al renderizar'
    );
  });

  /**
   * **El error crudo NO se le muestra al chofer.** No le dice nada y puede
   * arrastrar datos del viaje que venían en el mensaje.
   */
  it('no filtra el mensaje del error a la pantalla', async () => {
    const pantalla = await montar(
      <ErrorBoundary pantalla="viajes">
        <Explota />
      </ErrorBoundary>
    );

    expect(pantalla.queryByText(/reventó al renderizar/)).toBeNull();
  });

  /** «Reintentar» vuelve a montar: si el fallo era transitorio, se sale con un toque. */
  it('reintentar vuelve a intentar el render', async () => {
    let debeFallar = true;
    const Inestable = () => {
      if (debeFallar) throw new Error('la primera vez falla');
      return <Text>ya anda</Text>;
    };

    const pantalla = await montar(
      <ErrorBoundary pantalla="viajes">
        <Inestable />
      </ErrorBoundary>
    );
    expect(pantalla.getByTestId('pantalla-rota')).toBeTruthy();

    debeFallar = false;
    // El press dispara un re-render: fuera de `act`, la aserción de abajo lee el
    // árbol viejo y parece que «Reintentar» no hizo nada.
    await act(async () => {
      fireEvent.press(pantalla.getByTestId('btn-reintentar-pantalla'));
    });

    expect(pantalla.getByText('ya anda')).toBeTruthy();
  });
});
