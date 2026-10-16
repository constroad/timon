import { useEffect, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { theme } from '../ui/theme';
import {
  enviarDiagnostico,
  leerDiagnostico,
  limpiarDiagnostico,
  type EnvioDiagnostico,
} from './registro';
import type { EntradaDiagnostico } from './diagnostico';

/**
 * El diagnóstico de ESTE teléfono: errores y tiempos de la app.
 *
 * «Enviar problema» los sube a LilaStore para poder mirarlos sin pedirle al
 * chofer que lea un log —que no va a hacer, va manejando—. Nada se manda solo
 * (regla `nada-se-manda-sin-que-lo-enciendan`): lo dispara él desde acá.
 */
export function DiagnosticoScreen({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [entradas, setEntradas] = useState<EntradaDiagnostico[]>([]);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    // Al abrir se relee: lo más nuevo arriba. Al cerrar no hace falta limpiar.
    if (visible) setEntradas([...leerDiagnostico()].reverse());
  }, [visible]);

  const avisar = (salida: EnvioDiagnostico) => {
    if (salida.ok) Alert.alert('Diagnóstico', 'Enviado. Gracias — ya lo podemos mirar.');
    else if (salida.motivo === 'vacio') Alert.alert('Diagnóstico', 'No hay nada para enviar todavía.');
    else if (salida.motivo === 'sin_red') Alert.alert('Diagnóstico', 'Sin conexión. Probá de nuevo con señal.');
    else Alert.alert('Diagnóstico', 'No se pudo enviar. Probá más tarde.');
  };

  const enviar = async () => {
    if (enviando) return;
    setEnviando(true);
    try {
      avisar(await enviarDiagnostico());
    } finally {
      setEnviando(false);
    }
  };

  const limpiar = () =>
    Alert.alert('Diagnóstico', '¿Borrar el registro de este teléfono?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Borrar',
        style: 'destructive',
        onPress: () => {
          limpiarDiagnostico();
          setEntradas([]);
        },
      },
    ]);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.fondo} onPress={onClose} accessibilityLabel="Cerrar diagnóstico" />
      <View style={styles.hoja}>
        <View style={styles.manija} />
        <Text style={styles.titulo}>Diagnóstico</Text>
        <Text style={styles.sub}>Errores y tiempos de la app en este teléfono. Nada personal.</Text>

        <View style={styles.acciones}>
          <Pressable
            accessibilityRole="button"
            style={[styles.botonPrimario, enviando ? styles.deshabilitado : null]}
            onPress={() => void enviar()}
            disabled={enviando}
            testID="diag-enviar"
          >
            <Text style={styles.botonPrimarioTexto}>{enviando ? 'Enviando…' : 'Enviar problema'}</Text>
          </Pressable>
          {entradas.length > 0 ? (
            <Pressable accessibilityRole="button" style={styles.botonBorrar} onPress={limpiar} testID="diag-borrar">
              <Text style={styles.botonBorrarTexto}>Borrar</Text>
            </Pressable>
          ) : null}
        </View>

        <ScrollView contentContainerStyle={styles.lista}>
          {entradas.length === 0 ? (
            <Text style={styles.vacio} testID="diag-vacio">
              Todavía no se registró nada. Si algo falla o va lento, va a aparecer acá.
            </Text>
          ) : (
            entradas.map((entrada, indice) => <Fila key={indice} entrada={entrada} />)
          )}
        </ScrollView>

        <Pressable accessibilityRole="button" style={styles.opcion} onPress={onClose} testID="diag-cerrar">
          <Text style={styles.opcionTexto}>Cerrar</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

function Fila({ entrada }: { entrada: EntradaDiagnostico }) {
  const cuando = new Date(entrada.cuando).toLocaleString('es');
  if (entrada.tipo === 'error') {
    return (
      <View style={styles.tarjeta}>
        <Text style={styles.rotuloError}>ERROR{entrada.origen ? ` · ${entrada.origen}` : ''}</Text>
        <Text style={styles.mensaje}>{entrada.mensaje}</Text>
        <Text style={styles.cuando}>{cuando}</Text>
      </View>
    );
  }
  const lento = entrada.ms >= 1000;
  return (
    <View style={styles.tarjeta}>
      <Text style={styles.rotuloPerf}>PERFORMANCE</Text>
      <Text style={styles.mensaje}>
        {entrada.op}
        <Text style={lento ? styles.lento : styles.ms}> · {entrada.ms} ms</Text>
        {entrada.extra?.n ? <Text style={styles.extra}> ({entrada.extra.n} ítems)</Text> : null}
      </Text>
      <Text style={styles.cuando}>{cuando}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fondo: { backgroundColor: 'rgba(0,0,0,0.5)', flex: 1 },
  hoja: {
    backgroundColor: theme.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '85%',
    paddingBottom: 28,
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  manija: { alignSelf: 'center', backgroundColor: theme.border, borderRadius: 3, height: 5, marginBottom: 12, width: 44 },
  titulo: { color: theme.text, fontSize: 20, fontWeight: '700' },
  sub: { color: theme.textSecondary, fontSize: 14, marginTop: 2 },
  acciones: { flexDirection: 'row', gap: 10, marginTop: 14 },
  botonPrimario: {
    alignItems: 'center',
    backgroundColor: theme.accent,
    borderRadius: 14,
    flex: 1,
    justifyContent: 'center',
    minHeight: 56,
  },
  botonPrimarioTexto: { color: theme.onAccent, fontSize: 16, fontWeight: '700' },
  deshabilitado: { opacity: 0.6 },
  botonBorrar: {
    alignItems: 'center',
    borderColor: theme.border,
    borderRadius: 14,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 56,
    paddingHorizontal: 18,
  },
  botonBorrarTexto: { color: theme.danger, fontSize: 16, fontWeight: '600' },
  lista: { gap: 10, paddingVertical: 14 },
  vacio: { color: theme.textSecondary, fontSize: 14 },
  tarjeta: { backgroundColor: theme.background, borderRadius: 12, gap: 4, padding: 12 },
  rotuloError: { color: theme.danger, fontSize: 11, fontWeight: '700', letterSpacing: 0.6 },
  rotuloPerf: { color: theme.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 0.6 },
  mensaje: { color: theme.text, fontSize: 14, fontWeight: '600' },
  ms: { color: theme.textSecondary, fontWeight: '400' },
  lento: { color: theme.danger, fontWeight: '700' },
  extra: { color: theme.textSecondary, fontWeight: '400' },
  cuando: { color: theme.textMuted, fontSize: 12 },
  opcion: { alignItems: 'center', borderTopColor: theme.border, borderTopWidth: 1, justifyContent: 'center', minHeight: 56 },
  opcionTexto: { color: theme.text, fontSize: 16, fontWeight: '600' },
});
