import { Component, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { theme } from './theme';
import { reportarError } from './reportarError';

/**
 * La red de seguridad de la app.
 *
 * Sin esto, un error al renderizar cualquier pantalla deja **la pantalla en
 * blanco o la app cerrada**, sin explicación para el chofer y sin una línea para
 * nosotros. En Lilachat esto ya pasó y costó una jornada entera de diagnóstico a
 * ciegas; acá el costo sería peor, porque quien lo sufre está manejando y no va
 * a ponerse a escribir un reporte.
 *
 * **«Reintentar» no recarga la app**: solo vuelve a montar el subárbol. Si el
 * error era transitorio —una respuesta rara, un dato a medias— se sale con un
 * toque. Si no lo era, se vuelve a caer acá y el chofer al menos tiene una
 * pantalla que le habla en vez de una en blanco.
 *
 * Tiene que ser una clase: `componentDidCatch` no existe como hook.
 */
type Props = { children: ReactNode; pantalla: string };
type Estado = { rompio: boolean };

export class ErrorBoundary extends Component<Props, Estado> {
  state: Estado = { rompio: false };

  static getDerivedStateFromError(): Estado {
    return { rompio: true };
  }

  componentDidCatch(error: unknown): void {
    reportarError(this.props.pantalla, error);
  }

  render(): ReactNode {
    if (!this.state.rompio) return this.props.children;

    return (
      <View style={estilos.caja} testID="pantalla-rota">
        <Text style={estilos.titulo}>Algo se rompió en esta pantalla</Text>
        {/* No se muestra el error crudo: al chofer no le dice nada y puede
            arrastrar datos del viaje. El detalle ya viajó al log. */}
        <Text style={estilos.detalle}>Ya nos avisó solo. Podés volver a intentarlo.</Text>
        <Pressable
          testID="btn-reintentar-pantalla"
          onPress={() => this.setState({ rompio: false })}
          style={estilos.boton}
        >
          <Text style={estilos.textoBoton}>Reintentar</Text>
        </Pressable>
      </View>
    );
  }
}

const estilos = StyleSheet.create({
  caja: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    backgroundColor: theme.background,
  },
  titulo: { textAlign: 'center', fontSize: 16, fontWeight: '600', color: theme.text },
  detalle: {
    marginTop: 8,
    textAlign: 'center',
    fontSize: 14,
    lineHeight: 20,
    color: theme.textSecondary,
  },
  boton: {
    marginTop: 24,
    // 72 px: se toca manejando o con guantes (regla de la skill `rn-app-loop`).
    minHeight: 72,
    justifyContent: 'center',
    paddingHorizontal: 32,
    borderRadius: 16,
    backgroundColor: theme.accent,
  },
  textoBoton: { fontSize: 16, fontWeight: '700', color: theme.onAccent },
});
