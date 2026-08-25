# Migración de firma de la flota

> **Estado: la clave vieja está a salvo (paso 0 hecho). El resto, planificado.**

## 0. El problema

Los teléfonos de la flota tienen Timón firmado con la **keystore de debug**:

```
CN=Android Debug, OU=Android, O=Unknown
SHA-256: FA:C6:17:45:DC:09:03:78:6F:B9:ED:E6:2A:96:2B:39:9F:73:48:F0:BB:6F:89:9B:83:32:66:75:91:03:3B:9C
```

Desde la 0.4.0 se firma con la keystore propia (`CN=timon, O=ConstRoad`,
`7CC13F43…`). **Android no deja actualizar una app cuando cambia la firma**, así
que hoy la flota está congelada: el arreglo de batería está publicado y no puede
llegarles.

Y no se puede volver atrás a la firma de debug. La debug keystore es un archivo
que el SDK genera con contraseña pública conocida: **cualquiera con el APK y esa
clave puede publicar una actualización que el teléfono acepta**. No es una
decisión de estilo, es un agujero.

## 1. Paso 0 — HECHO: la clave vieja está respaldada

Estaba en `android/app/debug.keystore`, y **`android/` está en `.gitignore`**
porque lo regenera `expo prebuild` en cada build. Era una copia única, sin
versionar, en una carpeta que se borra sola.

Copiada a `~/.gradle/keystores-legacy/timon-debug-flota.keystore` (modo 600),
verificada contra la huella de los APK de la flota.

> **Si esa clave se pierde, la única salida es desinstalar y reinstalar en cada
> teléfono, para siempre.** Sacar una copia fuera de esta Mac es lo primero.

Contraseña: la estándar del SDK (`android`, alias `androiddebugkey`). No es un
secreto — es pública y por eso hay que migrar.

## 2. La rotación de firma evita la desinstalación (en la mayoría)

El **APK Signature Scheme v3** permite rotar la clave: se firma con la nueva
adjuntando un *lineage* —una cadena donde la clave vieja atestigua la validez de
la nueva— y el sistema acepta la actualización sobre la instalación existente.

**El detalle que decide el alcance:** por defecto `apksigner` pone las claves
rotadas en el bloque **v3.1, que solo entienden los Android 13 o superiores**.
Para que valga desde **Android 9 (API 28)** hay que pedirlo explícitamente:

```bash
apksigner rotate \
  --in-lineage-out lineage-timon.bin \
  --old-signer  --ks ~/.gradle/keystores-legacy/timon-debug-flota.keystore --ks-key-alias androiddebugkey \
  --new-signer  --ks <la keystore de release> --ks-key-alias timon \
  --min-sdk-version 28
```

Después, cada APK se firma con `--lineage lineage-timon.bin` y **ambas** claves.

| Android del teléfono | Qué pasa |
| --- | --- |
| **9 o superior** | Actualiza normal. No hay que tocar el teléfono. |
| **Menor a 9** | v3 no existe: hay que desinstalar y reinstalar igual. |

Android 9 es de 2018. **Hay que confirmar qué versión tienen los teléfonos de la
flota antes de dar esto por bueno** — si hay alguno por debajo, ese va por el
camino manual del §4.

## 3. Lo que falta implementar

`lila apk build` firma con Gradle, que no adjunta lineage. Hace falta un paso de
re-firma con `apksigner` después de compilar, y por lo tanto:

- **`lila apk build --lineage=<archivo>`** en el CLI: tras compilar, re-firma con
  las dos claves y el lineage. Va en el CLI y no en el script de Timón porque
  cualquier app que rote su clave lo necesita igual (`publicar-apk` §1-bis).
- **La verificación tiene que mirar el lineage**, no solo el firmante: un APK que
  perdió el lineage se instala perfecto en un teléfono limpio y **falla solo en
  los que tienen la versión vieja** — el peor error posible, porque el build sale
  verde y el fallo aparece en la mano del chofer.

## 4. El plan, en orden

1. ~~Respaldar la clave vieja.~~ **Hecho.** Falta la copia fuera de esta Mac.
2. **Averiguar qué Android tiene cada teléfono de la flota.** Decide cuántos van
   por rotación y cuántos a mano.
3. Implementar `--lineage` en el CLI y su verificación.
4. Publicar una versión firmada con lineage **en `beta`**, y probarla en un
   teléfono que **tenga la versión vieja instalada**. Ese es el único test que
   vale: en un teléfono limpio, cualquier APK se instala.
5. Recién con eso verde, pasar a `stable` — y ahí sí `--enforce`.
6. Los teléfonos por debajo de Android 9, uno por uno, con el §5.

## 5. Si hay que desinstalar: qué se pierde

Desinstalar **borra los datos de la app**. Antes de hacerlo en un teléfono:

- **La cola tiene que estar vacía.** Rastro sin subir, marcas de asistencia
  pendientes: todo eso vive en disco y se va con la app. Se comprueba desde el
  server, no preguntándole al chofer.
- **Sin viaje en curso.** Fin de jornada, nunca a mitad de un viaje.
- **El chofer se vuelve a dar de alta**: código de empresa y verificación de
  teléfono. Hay que avisarle antes, no descubrirlo con la app ya desinstalada.
- **De a uno.** El primero es la prueba de que el procedimiento sirve.

## 6. Lo que hay que dejar de hacer

**Ningún APK que llegue a un teléfono se firma con debug otra vez.** El
`--signing=release` del CLI ya aborta si la firma quedó en debug; eso se
mantiene. Este documento existe porque esa guarda llegó después de que la flota
ya estuviera instalada.
