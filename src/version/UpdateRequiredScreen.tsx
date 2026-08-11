import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { theme } from '../ui/theme';
import type { VersionGate } from './gate';

/**
 * La pantalla que **no se puede saltear** (A7 §6-1).
 *
 * No tiene botón de «después» a propósito: si la versión que corre ya no habla
 * el mismo idioma que el server, dejarla entrar es dejar que el chofer registre
 * cosas que no van a llegar — que es peor que no dejarlo entrar.
 *
 * El enlace de descarga puede faltar (el server todavía no lo publicó): en ese
 * caso se le dice a quién preguntar, en vez de dejar un botón muerto.
 */
export const UpdateRequiredScreen = ({ gate }: { gate: VersionGate }) => (
  <View style={styles.page}>
    <Text style={styles.title}>Actualiza Timón</Text>
    <Text style={styles.body}>{gate.message}</Text>

    {gate.downloadUrl ? (
      <>
        <Pressable
          testID="actualizar-descargar"
          style={styles.primary}
          onPress={() => void Linking.openURL(gate.downloadUrl as string)}
        >
          <Text style={styles.primaryText}>Descargar la nueva versión</Text>
        </Pressable>
        {/* La URL a la vista y seleccionable: el botón puede no abrir nada si
            el teléfono no tiene navegador por defecto o el enlace se abre en
            una app que no descarga. Poder copiarla o teclearla en otro equipo
            es la salida cuando el botón no alcanza. */}
        <Text style={styles.url} selectable testID="actualizar-url">
          {gate.downloadUrl}
        </Text>
        <Text style={styles.help}>
          Si el botón no abre nada, copia ese enlace y ábrelo en el navegador.
        </Text>
      </>
    ) : (
      <Text style={styles.help} testID="actualizar-sin-enlace">
        Pídele la nueva versión a tu supervisor.
      </Text>
    )}
  </View>
);

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: theme.background,
    padding: 24,
    gap: 16,
    justifyContent: 'center',
  },
  title: { fontSize: 30, fontWeight: '700', color: theme.text },
  body: { fontSize: 18, color: theme.textSecondary, lineHeight: 26 },
  help: { fontSize: 16, color: theme.textSecondary },
  // Monoespaciada y seleccionable: está para leerla y copiarla, no para lucir.
  url: {
    fontSize: 14,
    color: theme.text,
    backgroundColor: theme.surface,
    borderRadius: 10,
    padding: 12,
    fontFamily: 'monospace',
  },
  primary: {
    minHeight: 64,
    borderRadius: 14,
    backgroundColor: theme.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: { fontSize: 18, fontWeight: '700', color: theme.onAccent },
});
