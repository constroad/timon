import { Image, Platform, Pressable, StatusBar, StyleSheet, Text, View } from 'react-native';
import { SvgUri } from 'react-native-svg';
import { isSvgUrl } from './about';
import { theme } from './theme';

/**
 * Cabecera de la app: dónde trabaja el chofer y por dónde salir a lo demás.
 *
 * La app arrancaba directamente en la lista de viajes, sin nada arriba: no
 * había forma de saber la versión instalada ni de desvincular el equipo, y el
 * logo de la empresa —que es lo que le dice al chofer que abrió la app
 * correcta— no aparecía en ningún lado.
 */
export type AppHeaderProps = {
  companyName?: string;
  companyLogoUrl?: string;
  onOpenMenu: () => void;
};

export const AppHeader = ({ companyName, companyLogoUrl, onOpenMenu }: AppHeaderProps) => (
  // El alto de la barra de estado se reserva acá: sin esto el nombre de la
  // empresa queda pegado al reloj y los íconos del sistema.
  <View style={[styles.header, { paddingTop: statusBarInset() + 10 }]}>
    <View style={styles.marca}>
      {/* El logo de la company suele ser SVG y `<Image>` NO lo renderiza: no
          falla, simplemente no dibuja nada — por eso el header salía sin logo
          y sin ningún error que lo delatara. */}
      {companyLogoUrl ? (
        isSvgUrl(companyLogoUrl) ? (
          <SvgUri uri={companyLogoUrl} width={30} height={30} />
        ) : (
          <Image
            source={{ uri: companyLogoUrl }}
            style={styles.logo}
            resizeMode="contain"
            accessibilityLabel={companyName ?? 'Empresa'}
          />
        )
      ) : null}
      <Text style={styles.nombre} numberOfLines={1}>
        {companyName ?? 'Timón'}
      </Text>
    </View>

    {/* 48 px: se toca con una mano, sin mirar. */}
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Abrir menú"
      onPress={onOpenMenu}
      style={styles.hamburguesa}
      testID="btn-menu"
    >
      <View style={styles.linea} />
      <View style={styles.linea} />
      <View style={styles.linea} />
    </Pressable>
  </View>
);

/** Alto de la barra de estado: en Android lo da el sistema; en iOS, el notch. */
const statusBarInset = () => (Platform.OS === 'android' ? (StatusBar.currentHeight ?? 24) : 44);

const styles = StyleSheet.create({
  header: {
    alignItems: 'center',
    backgroundColor: theme.surface,
    borderBottomColor: theme.border,
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  marca: { alignItems: 'center', flexDirection: 'row', flex: 1, gap: 10, minWidth: 0 },
  logo: { height: 30, width: 30 },
  nombre: { color: theme.text, flexShrink: 1, fontSize: 16, fontWeight: '700' },
  hamburguesa: {
    alignItems: 'center',
    height: 48,
    justifyContent: 'center',
    gap: 5,
    width: 48,
  },
  linea: { backgroundColor: theme.text, borderRadius: 2, height: 2.5, width: 22 },
});
