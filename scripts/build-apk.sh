#!/usr/bin/env bash
# APK firmado de Timón (A7 §6-4).
#
# La keystore la genera y la guarda JOSÉ: lleva contraseña y **perderla obliga a
# desinstalar y reinstalar en todos los teléfonos**. Por eso no vive en el repo
# ni la crea este script — solo comprueba que esté declarada y falla diciendo
# qué falta, en vez de construir un APK de debug que después nadie puede
# actualizar encima.
#
# Dónde se declara: ~/.gradle/gradle.properties, FUERA del repo, porque
# `android/` se regenera con `expo prebuild` y lo que se ponga ahí se pierde.
#
#   TIMON_UPLOAD_STORE_FILE=/ruta/absoluta/timon-release.keystore
#   TIMON_UPLOAD_KEY_ALIAS=timon
#   TIMON_UPLOAD_STORE_PASSWORD=…
#   TIMON_UPLOAD_KEY_PASSWORD=…
#
# Con la firma declarada, `--publicar` encadena todo: compila, sube al Drive de
# la empresa y deja la URL en la pantalla de actualización.
set -euo pipefail

PUBLICAR=0
COMPANY=constroad
for arg in "$@"; do
  case "$arg" in
    --publicar) PUBLICAR=1 ;;
    --company=*) COMPANY="${arg#*=}" ;;
  esac
done

PROPS="$HOME/.gradle/gradle.properties"
FALTAN=()
for clave in TIMON_UPLOAD_STORE_FILE TIMON_UPLOAD_KEY_ALIAS TIMON_UPLOAD_STORE_PASSWORD TIMON_UPLOAD_KEY_PASSWORD; do
  grep -q "^${clave}=" "$PROPS" 2>/dev/null || FALTAN+=("$clave")
done

if [ ${#FALTAN[@]} -gt 0 ]; then
  echo "Falta la firma. Agregá en $PROPS:"
  printf '  %s=…\n' "${FALTAN[@]}"
  echo
  echo "Si todavía no existe la keystore, la generás vos (lleva contraseña):"
  echo "  keytool -genkeypair -v -keystore timon-release.keystore -alias timon \\"
  echo "    -keyalg RSA -keysize 2048 -validity 10000"
  echo "Guardala fuera del repo y respaldala en DOS lugares."
  exit 1
fi

# La firma se verifica DESPUÉS de compilar, no antes: gradle podría tomar una
# config vieja y firmar con la de debug sin decir nada.
npx expo prebuild --platform android
./android/gradlew -p android assembleRelease

APK=android/app/build/outputs/apk/release/app-release.apk
VERSION=$(node -p "require('./app.json').expo.version")
CODE=$(node -p "require('./app.json').expo.android.versionCode")
DESTINO="dist/timon-${VERSION}-${CODE}.apk"

mkdir -p dist
cp "$APK" "$DESTINO"

# Comprobación que evita el error más caro: repartir un APK firmado con la
# keystore de DEBUG. Se instala igual, así que no se nota hasta que el primer
# release de verdad exige desinstalar en TODOS los teléfonos.
# `apksigner` lee la firma v2/v3, que es la que usa Android moderno; el .RSA de
# META-INF puede no existir. Se busca en el SDK porque no suele estar en el PATH.
APKSIGNER=$(ls "$ANDROID_HOME"/build-tools/*/apksigner 2>/dev/null | tail -1)
FIRMANTE=$("${APKSIGNER:-apksigner}" verify --print-certs "$DESTINO" 2>/dev/null | grep -i "Signer #1 certificate DN" | head -1 || true)
if [ -z "$FIRMANTE" ] || echo "$FIRMANTE" | grep -qi "Android Debug"; then
  echo "PARÁ: este APK NO quedó firmado con la keystore de producción."
  echo "Firmante leído: ${FIRMANTE:-(ninguno)}"
  echo "Repartirlo obliga a desinstalar en todos los teléfonos cuando salga el real."
  exit 1
fi
echo "Firmado por: ${FIRMANTE:-(no se pudo leer el certificado)}"
echo "Listo: $DESTINO"

if [ "$PUBLICAR" = "1" ]; then
  : "${NEXT_PUBLIC_LILA_SERVER_URL:?Falta NEXT_PUBLIC_LILA_SERVER_URL (el host de lila donde se publica)}"
  ( cd /Users/josezamora/projects/Portal \
    && npx tsx --env-file=.env scripts/publish-timon-apk.ts "/Users/josezamora/projects/timon/$DESTINO" "$COMPANY" )
else
  echo "Para publicarlo en el Drive y dejar la URL lista:"
  echo "  NEXT_PUBLIC_LILA_SERVER_URL=https://cloud-constroad-s3.tail46a1b0.ts.net/api npm run apk -- --publicar"
fi
