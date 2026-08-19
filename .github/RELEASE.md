# Cómo se publica Timón

El release lo hace **GitHub Actions**, no una laptop. Que corra en una sola
máquina —con rutas absolutas a `/Users/josezamora/…`— era el argumento fuerte
para moverlo, más que la memoria de la mini.

## Publicar una versión

```bash
# 1. subir la versión en app.json y commitear
npm run release -- --bump=minor --solo-compilar   # o editar app.json a mano
git commit -am "0.5.0"

# 2. etiquetar: eso dispara el workflow
git tag v0.5.0 && git push origin main --tags
```

Un tag publica en **stable**. Para probar sin tocar a nadie: *Actions → Release →
Run workflow*, eligiendo **beta**.

**Un push a `main` no publica nada.** Mandarle una versión nueva a treinta
teléfonos es una decisión, no una consecuencia de mergear.

## Qué tiene que estar configurado

Tres secrets en *Settings → Secrets and variables → Actions*:

| Secret | De dónde sale |
| --- | --- |
| `LILASTORE_TOKEN` | consola de LilaStore → Tokens de publicación (se muestra una vez) |
| `TIMON_KEYSTORE_B64` | `base64 -i ~/.gradle/keystores/timon-release.jks \| pbcopy` |
| `TIMON_KEYSTORE_PASSWORD` | `grep TIMON_UPLOAD_STORE_PASSWORD ~/.gradle/gradle.properties` |

**El token ES la app**: el server saca de él a qué app subir y no acepta que se
lo digan. Un repo, un secret, una app — si se filtra el de Timón, se compromete
Timón y nada más. Y ni siquiera eso alcanza para publicar algo: la firma se
compara contra la que quedó fijada al dar de alta la app.

## Lo que el workflow no te deja hacer

- **Firmar con debug.** Un APK de debug se instala encima del de debug y parece
  que todo anda; el día que se pase a la firma real hay que desinstalar en cada
  teléfono.
- **Publicar sin la URL de release adentro del binario.** `EXPO_PUBLIC_*` se
  hornea al compilar, y un APK con la URL del `.env` se instala perfecto y falla
  en la mano del chofer con «sin conexión» y el wifi funcionando. La de release
  se declara en [`lila.json`](../lila.json).
- **Republicar un `versionCode` ya publicado.** LilaStore responde `409
  version_no_avanza`. Es la guarda funcionando, no un error del CI: significa que
  faltó subir la versión en `app.json` antes del tag.

## Lo que sigue estando en el Drive

La publicación al Drive de la empresa **sigue viva** en `scripts/build-apk.sh` y
no se apagó. Los teléfonos de hoy tienen Timón firmado con **debug**, y la
primera versión firmada de verdad no se puede instalar encima: hay que
desinstalar y reinstalar. Hasta que esa migración esté planeada, el Drive es el
camino que funciona y LilaStore va en `beta`.
