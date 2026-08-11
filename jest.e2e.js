/**
 * Config del E2E: corre SOLO los tests de `e2e/`, contra el Portal real.
 *
 * `runInBand` y sin paralelismo a propósito: los casos comparten el mismo tenant
 * sembrado y una corrida en paralelo se pisaría el OTP entre sí.
 */
module.exports = {
  preset: 'jest-expo',
  /**
   * Entorno de Node, no el de React Native.
   *
   * El preset de RN inyecta su propio `fetch` (whatwg-fetch), que necesita
   * `XMLHttpRequest` — y ahí no existe: las llamadas «funcionaban» pero
   * devolvían una respuesta sin `status`, o sea un E2E que no prueba nada. Con
   * el entorno de Node se usa el `fetch` nativo y las respuestas son reales.
   * React Native se renderiza igual: RNTL no necesita DOM.
   */
  testEnvironment: 'node',
  testMatch: ['**/e2e/**/*.e2e.test.tsx'],
  setupFilesAfterEnv: ['<rootDir>/e2e/setup.ts'],
  testTimeout: 60000,
};
