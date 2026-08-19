#!/usr/bin/env bash
# APK de Timón: generar, firmar y publicar en el Drive de la empresa (A7 §6-4).
#
#   npm run release                       # compila y publica en el Drive
#   npm run release -- --bump=minor       # sube la versión antes de compilar
#   npm run release -- --solo-compilar    # sin publicar
#   npm run release -- --abi=all          # las 4 arquitecturas (teléfonos viejos)
#   npm run release -- --firma=release    # exige la keystore propia
#   npm run release -- --sin-obligar      # publica SIN pedirles que actualicen
#
# «Publicar» acá es **subir el APK al Drive de la empresa** y dejar la URL lista
# para la pantalla de actualización de la app. Nada que ver con Play Store.
#
# La keystore la genera y la guarda JOSÉ: lleva contraseña y perderla obliga a
# desinstalar y reinstalar en TODOS los teléfonos. Por eso no vive en el repo ni
# la crea este script. Se declara en ~/.gradle/gradle.properties (fuera del repo,
# porque `android/` se regenera con `expo prebuild`):
#
#   TIMON_UPLOAD_STORE_FILE=/ruta/absoluta/timon-release.keystore
#   TIMON_UPLOAD_KEY_ALIAS=timon
#   TIMON_UPLOAD_STORE_PASSWORD=…
#   TIMON_UPLOAD_KEY_PASSWORD=…
set -euo pipefail

cd "$(dirname "$0")/.."

PUBLICAR=1
COMPANY=constroad
CARPETA="App Timón"
BUMP=""
# `debug` por defecto porque es la firma con la que ya están los teléfonos: pasar
# a `release` sin migrar obliga a desinstalar en cada uno (Android no deja
# cambiar de firma sobre una app instalada).
FIRMA=debug
# arm64 cubre prácticamente todo teléfono Android en uso; incluir las 4 ABIs
# multiplicaba el peso del APK que el chofer se baja por datos móviles.
ABI=arm64-v8a
# A qué Portal le habla el APK. **Se fija acá y no se hereda del `.env`**: ese
# archivo apunta al emulador (`10.0.2.2`) para desarrollo, y un release que se
# lleve esa URL se instala igual y falla en la mano del chofer con «sin
# conexión» — con el wifi perfecto. Pasó con la 0.2.2.
API_URL=https://www.constroad.com
# A qué lila se SUBE el APK. Se fija acá por lo mismo que `API_URL`, y con un
# riesgo peor: el `.env` de Portal apunta a `localhost:3001` en desarrollo, y el
# host de Tailscale —que sigue vivo y sirve el mismo lila— publica sin fallar.
# En los dos casos la subida sale bien y lo que queda mal es la URL guardada:
# el chofer ve la pantalla de «actualizá» con un enlace que su teléfono no
# resuelve. Por eso se ASIGNA, no se hereda del entorno.
LILA_URL=https://lila.constroad.com/api
# Fijar la versión mínima al publicar es lo que hace que la app AVISE al chofer
# que tiene que actualizar: es el único mecanismo que hay (no existe un «hay una
# nueva» opcional). Deja fuera a los teléfonos por debajo, pero la pantalla de
# bloqueo trae el enlace para bajarla, así que la salida es de un toque.
OBLIGAR=1

for arg in "$@"; do
  case "$arg" in
    --solo-compilar) PUBLICAR=0 ;;
    --publicar) PUBLICAR=1 ;;
    --company=*) COMPANY="${arg#*=}" ;;
    --carpeta=*) CARPETA="${arg#*=}" ;;
    --bump=*) BUMP="${arg#*=}" ;;
    --firma=*) FIRMA="${arg#*=}" ;;
    --abi=*) ABI="${arg#*=}" ;;
    --api=*) API_URL="${arg#*=}" ;;
    --lila=*) LILA_URL="${arg#*=}" ;;
    --sin-obligar) OBLIGAR=0 ;;
    *) echo "Opción desconocida: $arg"; exit 1 ;;
  esac
done
[ "$ABI" = "all" ] && ABI="armeabi-v7a,arm64-v8a,x86,x86_64"

# ── Presentación ────────────────────────────────────────────────────────────
# Cada paso se anuncia ANTES de tardar, no después: un `assembleRelease` son dos
# minutos de silencio y sin esto parece colgado.
TOTAL=6
INICIO_PASO=0
paso() {
  INICIO_PASO=$(date +%s)
  printf '\033[1m%s/%s\033[0m %-13s ' "$1" "$TOTAL" "$2"
}
ok() { printf '\033[32m✓\033[0m %s \033[2m(%ss)\033[0m\n' "$1" "$(( $(date +%s) - INICIO_PASO ))"; }
aviso() { printf '  \033[33m!\033[0m %s\n' "$1"; }
mb() { echo "$(( $1 / 1048576 )).$(( ($1 % 1048576) * 10 / 1048576 )) MB"; }

# ¿Esta URL le sirve al teléfono de un chofer? El paso 6 deja fuera a toda la
# flota, así que una URL que solo existe en la Tailnet o en esta Mac convierte
# ese bloqueo en camiones parados sin salida. Se comprueba lo que de verdad
# quedó guardado, igual que la URL embebida en el bundle: no se asume.
url_publica() {
  local url="$1" host
  [[ "$url" =~ ^https:// ]] || return 1
  host=$(printf '%s' "$url" | sed -E 's#^https://([^/:]+).*#\1#' | tr '[:upper:]' '[:lower:]')
  case "$host" in
    *.ts.net|localhost|*.local|*.internal) return 1 ;;
    127.*|10.*|192.168.*|169.254.*) return 1 ;;
    172.1[6-9].*|172.2[0-9].*|172.3[01].*) return 1 ;;
  esac
  return 0
}

# ── JDK ─────────────────────────────────────────────────────────────────────
# **Gradle va con JDK 17. Con el 21+ el build muere en CMake**, con un mensaje
# que no nombra a Java:
#
#   Execution failed for task ':app:configureCMakeRelWithDebInfo[arm64-v8a]'
#   > WARNING: A restricted method in java.lang.System has been called
#
# Es la restricción de acceso nativo que trajo JDK 24 (JEP 472) y que dispara la
# tarea del NDK. Pasó el 18/08/2026 sin que nadie tocara el build: Android Studio
# actualizó su JBR a 25, y quien tuviera `JAVA_HOME` apuntando ahí se quedó sin
# compilar. Por eso se ELIGE el JDK acá y no se hereda del entorno — mismo
# criterio que `API_URL` y `LILA_URL`.
JDK17=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home
version_jdk() { "$1/bin/java" -version 2>&1 | head -1 | sed -E 's/.*"([0-9]+).*/\1/'; }

if [ -x "$JDK17/bin/java" ]; then
  export JAVA_HOME="$JDK17"
elif [ -n "${JAVA_HOME:-}" ] && [ -x "$JAVA_HOME/bin/java" ] && [ "$(version_jdk "$JAVA_HOME")" = "17" ]; then
  : # el del entorno ya es 17
else
  printf '\033[31m✗\033[0m Falta el JDK 17, que es con el que compila Gradle.\n\n'
  printf 'Instalalo:\n  brew install openjdk@17\n\n'
  printf 'El JDK que trae Android Studio (hoy 25) NO sirve: el build muere en\n'
  printf 'CMake con «A restricted method in java.lang.System has been called».\n'
  exit 1
fi
export PATH="$JAVA_HOME/bin:$PATH"

printf '\n\033[1mTimón · release\033[0m  \033[2m(%s · %s · %s)\033[0m\n' "$COMPANY" "$ABI" "$API_URL"
printf '─────────────────────────────────────────────\n'
printf '\033[2mJDK %s · %s\033[0m\n' "$(version_jdk "$JAVA_HOME")" "$JAVA_HOME"

# ── 1. Firma ────────────────────────────────────────────────────────────────
paso 1 "Firma"
PROPS="$HOME/.gradle/gradle.properties"
FALTAN=()
for clave in TIMON_UPLOAD_STORE_FILE TIMON_UPLOAD_KEY_ALIAS TIMON_UPLOAD_STORE_PASSWORD TIMON_UPLOAD_KEY_PASSWORD; do
  grep -q "^${clave}=" "$PROPS" 2>/dev/null || FALTAN+=("$clave")
done
if [ ${#FALTAN[@]} -gt 0 ]; then
  if [ "$FIRMA" = "release" ]; then
    printf '\033[31m✗\033[0m falta la keystore\n\n'
    echo "Declarala en $PROPS:"
    printf '  %s=…\n' "${FALTAN[@]}"
    echo
    echo "Si todavía no existe (la contraseña la elegís vos; respaldala en DOS lugares):"
    echo "  keytool -genkeypair -v -keystore ~/timon-release.keystore -alias timon \\"
    echo "    -keyalg RSA -keysize 2048 -validity 10000"
    exit 1
  fi
  ok "debug (la que ya tienen los teléfonos)"
else
  ok "keystore propia declarada"
fi

# ── 2. Versión ──────────────────────────────────────────────────────────────
paso 2 "Versión"
if [ -n "$BUMP" ]; then
  # Después de comprobar la firma: si el script aborta antes, `app.json` no puede
  # quedar una versión más arriba de lo que se compiló.
  node -e '
    const fs = require("fs");
    const app = JSON.parse(fs.readFileSync("app.json", "utf8"));
    const [major, minor, patch] = app.expo.version.split(".").map(Number);
    const salto = process.argv[1];
    app.expo.version =
      salto === "major" ? `${major + 1}.0.0`
      : salto === "minor" ? `${major}.${minor + 1}.0`
      : `${major}.${minor}.${patch + 1}`;
    app.expo.android.versionCode = Number(app.expo.android.versionCode) + 1;
    fs.writeFileSync("app.json", JSON.stringify(app, null, 2) + "\n");
  ' "$BUMP"
fi
VERSION=$(node -p "require('./app.json').expo.version")
CODE=$(node -p "require('./app.json').expo.android.versionCode")
ok "$VERSION (build $CODE)"

# ── 3. Compilar ─────────────────────────────────────────────────────────────
paso 3 "Compilando"
printf '\033[2m… prebuild + gradle con R8, tarda ~3 min\033[0m\n'
LOG=$(mktemp)
export EXPO_PUBLIC_API_URL="$API_URL"
if ! ( npx expo prebuild --platform android >"$LOG" 2>&1 \
    && ./android/gradlew -p android assembleRelease -PreactNativeArchitectures="$ABI" >>"$LOG" 2>&1 ); then
  printf '\033[31m✗ falló la compilación\033[0m\n'
  tail -25 "$LOG"
  exit 1
fi
printf '                '
ok "R8 + recursos podados"

# ── 4. Empaquetar y verificar la firma REAL ────────────────────────────────
paso 4 "Paquete"
APK=android/app/build/outputs/apk/release/app-release.apk
DESTINO="dist/timon-${VERSION}-${CODE}.apk"
mkdir -p dist
cp "$APK" "$DESTINO"
PESO=$(stat -f%z "$DESTINO")

# La firma se comprueba DESPUÉS de compilar: gradle puede tomar una config vieja
# y firmar con la de debug sin decir nada.
APKSIGNER=$(ls "${ANDROID_HOME:-$HOME/Library/Android/sdk}"/build-tools/*/apksigner 2>/dev/null | tail -1)
FIRMANTE=$("${APKSIGNER:-apksigner}" verify --print-certs "$DESTINO" 2>/dev/null | grep -i "Signer #1 certificate DN" | head -1 || true)
ok "$DESTINO · $(mb "$PESO")"

# La URL embebida se comprueba en el APK YA construido, no se asume: es el
# único punto donde se ve lo que de verdad quedó adentro.
TMPB=$(mktemp -d)
unzip -o -q "$DESTINO" -d "$TMPB" 'assets/index.android.bundle' 2>/dev/null || true
BUNDLE="$TMPB/assets/index.android.bundle"
if [ -f "$BUNDLE" ]; then
  if grep -aq "10\.0\.2\.2\|http://localhost" "$BUNDLE"; then
    printf '\033[31m✗ el APK apunta al emulador/localhost — no serviría en un teléfono\033[0m\n'
    rm -rf "$TMPB"; exit 1
  fi
  grep -aq "$API_URL" "$BUNDLE" \
    && printf '  \033[32m✓\033[0m apunta a %s\n' "$API_URL" \
    || aviso "no se encontró $API_URL dentro del bundle: revisalo antes de repartir"
fi
rm -rf "$TMPB"
if echo "$FIRMANTE" | grep -qi "Android Debug"; then
  [ "$FIRMA" = "release" ] && { printf '\033[31m✗ quedó firmado con DEBUG pese a pedir release\033[0m\n'; exit 1; }
  aviso "firma de DEBUG: se instala encima de la actual. Al pasar a la keystore propia habrá que desinstalar en cada teléfono."
fi

# ── 5. Publicar en el Drive ────────────────────────────────────────────────
paso 5 "Publicando"
if [ "$PUBLICAR" = "0" ]; then
  printf '\033[2m— omitido (--solo-compilar)\033[0m\n'
  URL=""
else
  export NEXT_PUBLIC_LILA_SERVER_URL="$LILA_URL"
  SALIDA=$( cd /Users/josezamora/projects/Portal \
    && npx tsx --env-file=.env scripts/publish-timon-apk.ts \
         "/Users/josezamora/projects/timon/$DESTINO" "$COMPANY" "$CARPETA" 2>/dev/null | tail -1 )
  URL=$(node -p "JSON.parse(process.argv[1]).downloadUrl" "$SALIDA" 2>/dev/null || echo '')
  [ -z "$URL" ] && { printf '\033[31m✗ no se pudo publicar\033[0m\n%s\n' "$SALIDA"; exit 1; }
  # Antes del paso 6: si la URL no sirve, se corta acá y NADIE queda bloqueado.
  if ! url_publica "$URL"; then
    printf '\033[31m✗ la URL publicada no le sirve a un teléfono:\033[0m %s\n' "$URL"
    printf '  Revisá LILA_URL (--lila=%s).\n' "$LILA_URL"
    printf '  No se fijó la versión mínima: la flota sigue trabajando con la anterior.\n'
    exit 1
  fi
  ok "Drive › $CARPETA"
fi

# ── 6. Marcarla como obligatoria ───────────────────────────────────────────
paso 6 "Versión mínima"
if [ "$PUBLICAR" = "0" ] || [ "$OBLIGAR" = "0" ]; then
  printf '\033[2m— omitido\033[0m\n'
else
  ( cd /Users/josezamora/projects/Portal \
    && npx tsx --env-file=.env scripts/set-timon-min-version.ts "$VERSION" >/dev/null 2>&1 ) \
    && ok "$VERSION · los teléfonos con menos verán «actualizá»" \
    || aviso "no se pudo fijar la mínima: la app no va a avisar de esta versión"
fi

printf '─────────────────────────────────────────────\n'
printf '\033[1mListo.\033[0m Timón %s (build %s) · %s\n' "$VERSION" "$CODE" "$(mb "$PESO")"
[ -n "$URL" ] && printf 'La app ya ofrece esta versión al abrirse.\n%s\n' "$URL"
printf '\n'
