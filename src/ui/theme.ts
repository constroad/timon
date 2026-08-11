import { Appearance } from 'react-native';

/**
 * Tokens visuales (Timón · A1).
 *
 * Dos reglas del brief que NO son estéticas:
 *
 * 1. **Contraste alto de verdad.** Se usa en una cabina con sol directo, donde
 *    el gris claro sobre blanco desaparece.
 * 2. **El acento es de la EMPRESA, no del producto.** Cada empresa tiene el
 *    suyo, así que la base es neutra y el acento entra por `applyAccent` cuando
 *    el alta resuelve la empresa. Nunca fondos enteros de color de marca: con un
 *    naranja y un azul la misma pantalla tiene que verse bien.
 */

const isDark = Appearance.getColorScheme() === 'dark';

/** Verde neutro hasta que se conozca la empresa. */
const DEFAULT_ACCENT = '#10B981';

export const theme = {
  background: isDark ? '#0B0F14' : '#F4F6F8',
  surface: isDark ? '#131A22' : '#FFFFFF',
  text: isDark ? '#F5F7FA' : '#101418',
  textSecondary: isDark ? '#A8B3BF' : '#4A5560',
  textMuted: isDark ? '#6B7683' : '#8A939C',
  border: isDark ? '#243040' : '#D6DCE2',
  danger: isDark ? '#FF6B6B' : '#C62828',
  // Semáforo, aparte del acento de la empresa: entregado en verde no puede
  // depender de que la marca del cliente sea verde.
  success: isDark ? '#4ADE80' : '#15803D',
  accent: DEFAULT_ACCENT,
  onAccent: '#FFFFFF',
};

/**
 * Pinta el acento de la empresa una vez resuelta.
 *
 * Se muta el objeto a propósito: el acento cambia UNA vez por sesión (al saber
 * de qué empresa es el equipo) y meterlo en un contexto de React obligaría a
 * cablear un provider en cada pantalla para un valor que no vuelve a cambiar.
 */
export const applyAccent = (hex?: string | null): void => {
  if (typeof hex === 'string' && /^#[0-9A-Fa-f]{6}$/.test(hex)) {
    theme.accent = hex;
  }
};
