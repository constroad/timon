import { registerRootComponent } from 'expo';

import App from './App';
import { instalarCapturaGlobal } from './src/diagnostico/registro';

// Lo que no se atrapa queda en el diagnóstico local antes de nada más (se sube a
// LilaStore solo si el chofer toca «Enviar problema»).
instalarCapturaGlobal();

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
