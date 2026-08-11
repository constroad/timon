const { withAppBuildGradle } = require('expo/config-plugins');

/**
 * Hace que el build de RELEASE use la keystore de producción (Timón · A7 §6-4).
 *
 * Existe por una trampa de CNG: `android/` se regenera con `expo prebuild`, y la
 * plantilla deja `release { signingConfig signingConfigs.debug }`. O sea que sin
 * esto, declarar la keystore en `gradle.properties` **no sirve de nada** — el
 * APK sale firmado con la de debug y no se nota hasta que el primer release de
 * verdad obliga a desinstalar en todos los teléfonos.
 *
 * Las credenciales NO viven acá: se leen de `~/.gradle/gradle.properties`, fuera
 * del repo. Si no están declaradas, el bloque no se agrega y el build sigue
 * usando la de debug — que es lo correcto para desarrollo.
 */
const BLOQUE = `
        release {
            if (project.hasProperty('TIMON_UPLOAD_STORE_FILE')) {
                storeFile file(TIMON_UPLOAD_STORE_FILE)
                storePassword TIMON_UPLOAD_STORE_PASSWORD
                keyAlias TIMON_UPLOAD_KEY_ALIAS
                keyPassword TIMON_UPLOAD_KEY_PASSWORD
            }
        }`;

module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, (gradleConfig) => {
    let contents = gradleConfig.modResults.contents;

    // 1) Declarar el signingConfig `release` junto al `debug` de la plantilla.
    if (!contents.includes('TIMON_UPLOAD_STORE_FILE')) {
      contents = contents.replace(
        /(signingConfigs\s*\{)/,
        `$1${BLOQUE}`
      );
    }

    // 2) Que el buildType release lo use, en vez de la de debug. Solo si la
    //    keystore está declarada: si no, se deja debug para poder compilar.
    contents = contents.replace(
      /(buildTypes\s*\{[\s\S]*?release\s*\{[\s\S]*?)signingConfig signingConfigs\.debug/,
      `$1signingConfig project.hasProperty('TIMON_UPLOAD_STORE_FILE') ? signingConfigs.release : signingConfigs.debug`
    );

    gradleConfig.modResults.contents = contents;
    return gradleConfig;
  });
};
