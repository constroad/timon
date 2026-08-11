import { API_URL, renderApp, requirePortal, resetKeychain } from './setup';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import App from '../App';
import { loadCredential } from '../src/auth/credential';

/**
 * E2E de Timón: alta completa y «mis viajes», contra el servidor y la base
 * REALES.
 *
 * Recorre lo mismo que haría el chofer —teclea el código, confirma la empresa,
 * pone su celular, escribe los 6 dígitos— y comprueba **lo que él vería**. Nada
 * de la API se simula: cada paso cruza HTTP → Portal → Mongo.
 *
 * Antes de correrlo hay que sembrar el tenant:
 *   (Portal) npx tsx --env-file=.env scripts/qa-timon-e2e.ts
 * y al terminar, limpiarlo con `--limpiar`.
 */

const SEED = {
  code: process.env.E2E_CODE ?? 'X7G2-DP4E-Z8',
  phone: process.env.E2E_PHONE ?? '987654321',
  otp: process.env.E2E_OTP ?? '123456',
};

/**
 * Escribir y tocar van SIEMPRE dentro de `act`.
 *
 * Sin eso, el cambio de texto queda encolado y el toque siguiente lee el estado
 * viejo: el botón todavía está deshabilitado, el press no hace nada y el test
 * falla dos pantallas más adelante, donde no está la causa. Costó una vuelta
 * entera de diagnóstico.
 */
const escribir = async (label: string, value: string) => {
  await act(async () => {
    fireEvent.changeText(screen.getByLabelText(label), value);
  });
};

const tocar = async (text: string) => {
  await act(async () => {
    fireEvent.press(screen.getByText(text));
  });
};

describe('E2E · alta y mis viajes', () => {
  beforeAll(async () => {
    if (!(await requirePortal())) {
      throw new Error(
        `El servidor de Portal no responde en ${API_URL}. Levantá :3000 antes de correr el E2E.`
      );
    }
  });

  beforeEach(() => resetKeychain());

  it('el chofer se da de alta y termina viendo su viaje', async () => {
    await renderApp(<App />);

    // 1. Código de empresa → el server resuelve el tenant.
    await screen.findByText('¿De qué empresa eres?');
    await escribir('Código de empresa', SEED.code);
    await tocar('Continuar');

    // 2. La empresa que devolvió el server, para que la confirme.
    await screen.findByText('¿Es tu empresa?');
    expect(screen.getByText('TEST COMPANY')).toBeTruthy();
    await tocar('Sí, continuar');

    // 3. Su celular → pide el código de 6 dígitos.
    await screen.findByText('¿Cuál es tu número?');
    await escribir('Tu número de celular', SEED.phone);
    await tocar('Continuar');

    // 4. El código de verificación.
    await screen.findByText('Escribe el código');
    await escribir('Código de verificación', SEED.otp);
    await tocar('Continuar');

    // 5. Adentro: el saludo con su nombre REAL, traído de su ficha.
    await waitFor(() => expect(screen.getByText(/Hola, Pedro Ramirez/)).toBeTruthy(), {
      timeout: 15000,
    });

    // Y su viaje en curso, que es lo que vino a ver.
    await waitFor(() => expect(screen.getByText('TU VIAJE AHORA')).toBeTruthy());
    expect(screen.getByText('Lima → Ica')).toBeTruthy();

    // La credencial quedó guardada: la próxima vez no vuelve a darse de alta.
    const credential = await loadCredential();
    expect(credential?.companyId).toBe('test');
    expect(credential?.deviceSecret).toHaveLength(64);
  }, 60000);

  it('un código de empresa que no existe no deja avanzar', async () => {
    await renderApp(<App />);

    await screen.findByText('¿De qué empresa eres?');
    await escribir('Código de empresa', 'AAAA-BBBB-22');
    await tocar('Continuar');

    await waitFor(() => expect(screen.getByText(/no existe/i)).toBeTruthy());
    // Sigue en la primera pantalla: no hay forma de colarse al paso siguiente.
    expect(screen.getByText('¿De qué empresa eres?')).toBeTruthy();
  }, 30000);

  /**
   * El caso que encontró el E2E de S1b: el server responde «no es correcto»
   * tanto al dígito mal tecleado como al código quemado, así que la PANTALLA
   * tiene que llevar la cuenta y ofrecer uno nuevo.
   */
  it('a los tres intentos fallidos ofrece pedir otro código', async () => {
    await renderApp(<App />);

    await screen.findByText('¿De qué empresa eres?');
    await escribir('Código de empresa', SEED.code);
    await tocar('Continuar');
    await screen.findByText('¿Es tu empresa?');
    await tocar('Sí, continuar');
    await screen.findByText('¿Cuál es tu número?');
    await escribir('Tu número de celular', SEED.phone);
    await tocar('Continuar');
    await screen.findByText('Escribe el código');

    for (let attempt = 0; attempt < 3; attempt++) {
      await escribir('Código de verificación', '000000');
      await tocar('Continuar');
      await waitFor(() => expect(screen.getByText(/no es correcto/i)).toBeTruthy());
    }

    await waitFor(() => expect(screen.getByText('Enviar otro código')).toBeTruthy());
  }, 60000);
});
