#!/usr/bin/env bash
# Release de Timón: compilar, firmar y publicar en LilaStore.
#
#   npm run release                       # compila y publica en stable
#   npm run release -- --bump=minor       # sube la versión antes de compilar
#   npm run release -- --solo-compilar    # sin publicar
#   npm run release -- --abi=all          # las 4 arquitecturas (teléfonos viejos)
#   npm run release -- --sin-obligar      # publica SIN pedirles que actualicen
#
# **Esto es un envoltorio del CLI, no una segunda forma de compilar.**
#
# Tenía 294 líneas que duplicaban lo que hace `lila apk build`: elegir el JDK 17,
# comprobar la keystore, correr prebuild y Gradle, verificar la firma REAL del
# binario, y buscar las URLs adentro del bundle. Todo eso vive ahora en el CLI y
# se arregla en un solo lugar — que es lo que evita el incidente del 19/08/2026,
# cuando dos implementaciones de publicar divergieron y una salió con código 0
# sin subir nada.
#
# **El 19/08/2026 dejó de publicar en el Google Drive.** Antes subía el APK con
# un script de Portal y después escribía la versión mínima en `systemSettings`
# con otro. Dos pasos con dos formas de fallar por separado, y el hueco entre
# ellos —APK nuevo arriba, mínimo apuntando a la anterior— dejaba a los choferes
# sin enterarse. Hoy `apk publish --enforce` hace las dos en un solo acto.
#
# Lo que queda acá es lo de ESTE repo: subir la versión, y decidir si se obliga.
# Las URLs que se hornean en el APK se declaran en `lila.json`.
#
# Hace falta un token de publicación: `lila login` una vez, o `LILASTORE_TOKEN`.
set -euo pipefail

cd "$(dirname "$0")/.."

# **La versión va FIJA.** Un release tiene que poder repetirse dentro de un año
# y dar el mismo resultado.
CLI_VERSION=0.6.0
CLI=(npx --yes "@constroad/lila-cli@$CLI_VERSION")
if [[ "${CLI_LOCAL:-0}" == "1" ]]; then
  echo "⚠ CLI_LOCAL=1 — usando el repo local, NO @$CLI_VERSION"
  CLI=(node /Users/josezamora/projects/lila-cli/bin/lila.mjs)
fi

PUBLICAR=1
BUMP=""
ABI=arm64-v8a
CANAL=stable
# Fijar la versión mínima al publicar es lo que hace que la app AVISE al chofer
# que tiene que actualizar: es el único mecanismo que hay, no existe un «hay una
# nueva» opcional. Deja fuera a los teléfonos por debajo, pero la pantalla de
# bloqueo trae el enlace, así que la salida es de un toque.
OBLIGAR=1

for arg in "$@"; do
  case "$arg" in
    --solo-compilar) PUBLICAR=0 ;;
    --bump=*) BUMP="${arg#*=}" ;;
    --abi=*) ABI="${arg#*=}" ;;
    --canal=*) CANAL="${arg#*=}" ;;
    --sin-obligar) OBLIGAR=0 ;;
    *) echo "Opción desconocida: $arg" >&2; exit 2 ;;
  esac
done

# ── Versión ─────────────────────────────────────────────────────────────────
# El `versionCode` tiene que subir ANTES de compilar: si ya está publicado, el
# server responde 409 y enterarse después de quince minutos de Gradle duele.
if [ -n "$BUMP" ]; then
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
printf '\n\033[1mTimón · release\033[0m  \033[2m%s (%s) · %s\033[0m\n\n' "$VERSION" "$CODE" "$ABI"

# ── Compilar ────────────────────────────────────────────────────────────────
# El CLI resuelve el JDK 17 y el SDK, verifica que la firma NO sea la de debug,
# y comprueba que cada URL declarada en `lila.json` haya quedado adentro del
# binario Y le sirva a un teléfono ajeno (ni localhost, ni la Tailnet).
"${CLI[@]}" apk build --abi="$ABI"

if [ "$PUBLICAR" = "0" ]; then
  echo
  echo "— no se publicó (--solo-compilar). El APK quedó en dist/."
  exit 0
fi

# ── Publicar ────────────────────────────────────────────────────────────────
ARGS=(--channel="$CANAL")
[ "$OBLIGAR" = "1" ] && ARGS+=(--enforce)

"${CLI[@]}" apk publish "${ARGS[@]}"

echo
if [ "$OBLIGAR" = "1" ]; then
  echo "Los teléfonos con una versión anterior verán «actualizá» al abrir."
else
  echo "Publicada sin obligar: nadie va a ver el aviso de actualizar."
fi
