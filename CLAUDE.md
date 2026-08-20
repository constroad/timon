# Timón — App del conductor (React Native)

> Calidad y estilo de respuesta: `/projects/QUALITY-CODE-SHORT.SPEC.md` y
> `/projects/.claude/CLAUDE.md`.
> **Specs canónicos (viven en Portal, se leen antes de tocar nada):**
> - `Portal/specs/modules/FLOTA-APP-RN.spec.md` — técnico: identidad, GPS en
>   background, contrato con el server, edge cases, orden de construcción.
> - `Portal/specs/modules/FLOTA-APP-RN.stitch-brief.md` — diseño: sistema visual
>   y prompt por pantalla.
> - `Portal/specs/modules/FLOTA-TRANSPORTE.spec.md` — el módulo de flota entero.

## Qué es

App móvil **del conductor** de una empresa de transporte de carga. Dos menús:
**registro de asistencia** y **mis viajes**. Android primero (APK), **iOS también
está en alcance** — hay iPhones en la operación.

**Es genérica del rubro:** el mismo binario lo instalan choferes de cualquier
empresa de transporte. Al abrirla por primera vez no sabe de qué empresa es.

**Existe por UNA razón:** en una PWA no se puede tomar la ubicación con la app en
segundo plano (probado; memoria `pwa-background-gps-impossible`). Todo lo demás
que hace ya lo hacía bien el portal web, que **no se retira**.

## Con qué habla

Backend = **Portal** (`/projects/Portal`), los endpoints públicos de flota. No
hay backend propio. Los archivos (fotos, PDFs) viven en **lila-app**.

- El portal del conductor ya existe y se reusa: `/api/public/fleet/driver`.
- Todo request se re-scopea por `companyId` **en el server**, nunca por lo que
  mande el cliente.

**Se reparte por LilaStore, no por el Google Drive (19/08/2026).** Antes el APK
se subía al Drive de la empresa con un script de Portal y la versión mínima se
escribía en `systemSettings` con otro. Dos caminos con dos formas de fallar por
separado, y el hueco entre ellos —APK nuevo arriba, mínimo apuntando a la
anterior— dejaba a los choferes sin enterarse. Hoy:

- `npm run release` es un **envoltorio del CLI**: `lila apk build` +
  `lila apk publish --enforce`. Pasó de 294 líneas a 108 el 20/08/2026 — todo lo
  que duplicaba (JDK 17, Gradle, verificar la firma real, buscar las URLs en el
  bundle) vive en el CLI y se arregla en un solo lugar. Acá queda lo de este
  repo: `--bump`, el canal, y si se obliga.
- Subir y fijar la mínima son **un solo acto**, con el mismo token y contra el
  mismo server que guarda el binario.
- `fetchMinVersion()` pregunta a `GET /api/v1/apps/timon/min-version` de
  LilaStore. `/api/public/app/version` de Portal quedó **solo para los APK ya
  instalados** que todavía apuntan ahí, y ya no se actualiza.
- Las dos URLs se **declaran** en `lila.json` (`EXPO_PUBLIC_API_URL` y
  `EXPO_PUBLIC_STORE_URL`), nunca se heredan del entorno. El CLI comprueba
  **las dos** —hasta el 20/08 miraba solo la primera— y que le sirvan a un
  teléfono ajeno: la Tailnet es la trampa, porque el build sale verde y el APK
  no funciona en la mano de otro.
- **`downloadUrl` viene vacía mientras Timón esté marcada privada** en LilaStore:
  `/d/:releaseId` solo sirve sin credencial a las apps públicas. Con la URL vacía
  la pantalla de bloqueo avisa igual, pero pierde el botón que baja el APK ahí
  mismo; hay que actualizar desde LilaStore. El enlace del Drive daba esa misma
  exposición pública, así que marcarla pública no es un paso atrás — pero es una
  decisión de José, no un default.

## Invariantes que NO se negocian

1. **La empresa la declara la persona.** El alta empieza por el código de
   empresa; no se infiere del teléfono ni de nada. Un APK único para el rubro no
   puede adivinar de quién es.
2. **El código de empresa no autentica.** Selecciona el tenant. Quien lo tenga no
   ve un dato hasta verificar su teléfono.
3. **Se rastrea solo entre «iniciar viaje» y «entregado».** Nunca fuera. Sin
   viaje en curso, cero permisos de ubicación en uso.
4. **Sin ubicación no arranca el viaje** (decisión de José, 07/08/2026), y el
   bloqueo lo aplica **el server**, no solo la pantalla.
5. **La foto nunca bloquea una marca de asistencia.** Primero se registra el
   hecho, la foto va a cola. Costó dos días de fichaje perdido aprenderlo.
6. **El PIN de asistencia jamás se persiste.**
7. **Cola de mutación, no de formulario**: se encola el hecho («entró 07:12»), y
   un **409 del server es ÉXITO** (ya estaba registrado).
8. **Nada bloquea la operación por un derivado.** Si falla el GPS, la foto o un
   aviso, el viaje sigue y se degrada honesto.
9. **Fechas de negocio en horario de Lima.** Nunca `new Date('YYYY-MM-DD')`.
10. **La credencial vive en Keystore / Keychain**, nunca en texto plano.

## Identificadores (irreversibles — no tocar)

```
Nombre visible   Timón
Bundle id        com.constroad.timon
Repo             git@github.com:constroad/timon.git
```

Cambiar el bundle id obliga a **desinstalar y reinstalar en todos los teléfonos**
y a rehacer el alta de cada chofer. La keystore de firma se respalda: perderla
tiene el mismo costo.

## Stack (A0, decidido el 07/08/2026)

**Expo con development builds** (SDK 57, RN 0.86, React 19, TypeScript).

Se eligió por una razón concreta y verificable, no por gusto: `expo-location`
resuelve **de forma declarativa** lo único que justifica que esta app exista —
ubicación en segundo plano con servicio en primer plano en Android y permiso
«Siempre» en iOS—. Verificado con `expo prebuild`: el manifiesto generado trae
`ACCESS_BACKGROUND_LOCATION`, `FOREGROUND_SERVICE_LOCATION` y el servicio con
`foregroundServiceType="location"`, y el `applicationId` correcto.

**No se usa Expo Go**: la ubicación en background necesita un development build.

### CNG: `android/` e `ios/` NO se commitean

Se generan con `npm run prebuild` desde `app.json`. Tenerlos versionados **y**
generarlos es cómo la config declarada y la nativa se separan sin que nadie lo
note. Todo lo nativo se declara en `app.json`.

### Costos (decisión de José, no se asumen solos)

| | |
| --- | --- |
| Compilar Android | **Gratis** en local (`npm run android`). EAS Build es opcional |
| Compilar iOS | Requiere **cuenta de Apple, 99 USD/año**. No hay forma de evitarlo |
| EAS Build / Update | Tiene capa gratis; **no es obligatorio** — se puede construir todo localmente |

### Keystore — la genera José, no Claude

Firma las releases de Android y **perderla obliga a desinstalar y reinstalar en
todos los teléfonos**. Lleva contraseña, así que no se genera desde acá ni se
guarda en el repo (el `.gitignore` ya la excluye):

```bash
keytool -genkeypair -v -keystore timon-release.keystore -alias timon \
  -keyalg RSA -keysize 2048 -validity 10000
```

Guardarla fuera del repo y respaldarla en dos lugares.

## Ciclo de trabajo

Canónico: skill **`rn-app-loop`** (`/projects/.claude/skills/rn-app-loop`, genérica para toda app RN del workspace) —
Stitch como referencia → test unitario primero sobre motores PUROS →
implementación simple → **E2E real en el emulador Android con Maestro** → spec
actualizado en el mismo cambio. Es de workspace porque el loop cruza los dos
repos: la app acá, sus endpoints en Portal. Hereda `portal-dev-loop`,
`portal-security` y `portal-scalability`.

El emulador es el piso, no el techo: **falta el teléfono real** (deuda de A7).
Un emulador no reproduce Doze, ni los matadores de apps de Xiaomi, ni perder
señal en la carretera.

José commitea y pushea él mismo.
