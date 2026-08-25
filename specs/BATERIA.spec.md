# Consumo de batería del rastreo — diagnóstico y plan

> **Estado: reportado, sin medir.** Un chofer reportó consumo excesivo
> (20/08/2026). Este documento separa lo que ya se puede afirmar leyendo el
> código de lo que hace falta medir, porque diagnosticar batería a ojo es como
> diagnosticar performance a ojo: se termina optimizando lo que no era.

## 0. La regla que ordena todo lo de abajo

**La batería no se arregla bajando la precisión, se arregla dejando dormir la
radio.** Un GPS que entrega un punto por minuto y nunca se apaga gasta más que
uno que entrega tres seguidos y duerme diez minutos. Antes de tocar
`Accuracy.High` —que está argumentado y probablemente sea correcto— hay que
agotar lo que permite dormir.

Y el corolario que importa para el producto: **un rastro con menos puntos es
recuperable; un teléfono muerto a mitad de viaje no.** Ante la duda, gastar
menos.

---

## 1. Lo que ya se sabe SIN medir

### 1.1 La política de muestreo tiene tres ramas y en producción corre una sola

`src/tracking/policy.ts` decide el intervalo según tres casos:

| Caso | Intervalo | Distancia |
| --- | --- | --- |
| En movimiento | 60 s | 150 m |
| **Detenido** (≥10 min) | **300 s** | 150 m |
| **Batería < 15 %** | **600 s** | 300 m |

Tiene tests y el server puede pisar los valores. **Y aun así, hoy solo se aplica
la primera.** Dos defectos, los dos en `src/tracking/service.ts`:

```ts
// service.ts:152 — el único sitio que llama a la política
const { intervalMs, distanceM } = resolveSampling({
  stoppedMinutes: 0,   // ← constante, nadie la calcula nunca
  batteryLevel: bateria,
  config,
});
```

1. **`stoppedMinutes` está fijo en `0`.** Nadie mide cuánto lleva quieto el
   camión, así que la rama «detenido» es **código muerto en producción**. Un
   camión tres horas en la balanza sigue pidiendo GPS de alta precisión cada
   minuto.
2. **El muestreo se calcula UNA vez, al arrancar el viaje**, y se pasa a
   `startLocationUpdatesAsync`. Nunca se recalcula. Si la batería estaba al 80 %
   al salir y cae al 10 % en la carretera, **el intervalo no cambia**: la rama de
   batería baja solo aplica a viajes que ya empezaron con el teléfono casi
   descargado, que es cuando menos sirve.

Esto es «un cero creíble» (`constroad-pitfalls`): la función existe, los tests
pasan, la configuración remota funciona, y el comportamiento que describen **no
ocurre**. No hace falta medir para saber que está mal.

### 1.2 Tres opciones que impiden dormir

En `startLocationUpdatesAsync`:

- **`pausesUpdatesAutomatically: false`** — apaga la pausa que el sistema aplica
  cuando detecta que el dispositivo no se mueve. Junto con 1.1, el GPS no
  descansa nunca en una parada.
- **`deferredUpdatesInterval: intervalMs`** (60 s) — el «deferred» existe para
  **agrupar** entregas y dejar dormir el proceso entre ráfagas. Igualado al
  intervalo de muestreo no agrupa nada: es equivalente a no usarlo.
- **`accuracy: Accuracy.High`** — mantiene el chip GPS alimentado. Está
  argumentado en el código y en carretera el argumento es bueno (`Balanced` usa
  wifi y antenas, que entre ciudades no existen). **No se toca hasta haber
  medido**, pero es el mayor consumidor conocido y entra en el plan.

### 1.3 Lo que NO es el problema

Vale escribirlo para no perder tiempo ahí:

- **El ciclo de vida está bien.** `useTripTracking` arranca y para según el
  estado del viaje, y relevanta el servicio si un matador de OEM se lo llevó. No
  hay rastreo huérfano por diseño.
- **La subida es cada 5 minutos** (`UPLOAD_MS`), con un empujón al volver al
  frente. Es razonable y no es el sospechoso principal.
- **El foreground service es obligatorio**, no opcional: sin él Android corta el
  rastreo con la pantalla apagada, y sin rastreo la app no sirve. El costo del
  servicio en sí es la notificación persistente; lo que gasta es el GPS.

---

## 2. Lo que hace falta medir

Sin esto, cualquier arreglo es una apuesta.

```bash
adb shell dumpsys batterystats --reset
# … un viaje real, o al menos una hora con la pantalla apagada …
adb shell dumpsys batterystats > stats.txt
```

Lo que hay que sacar de ahí, por orden de interés:

1. **`com.constroad.timon` en el ranking de consumo**, y cuánto de eso es GPS
   frente a red frente a CPU. Si el GPS no domina, todo lo de arriba es ruido y
   el problema está en otro lado.
2. **Wakelocks**: cuántos, de qué duración. Un wakelock que no se suelta es un
   consumo plano que no se parece a nada de lo de arriba.
3. **Comparación entre viaje en marcha y camión detenido.** Si el consumo con el
   camión parado es parecido al de en marcha, eso confirma 1.1 y basta para
   priorizar el arreglo.

**El teléfono importa.** Los OEM (Samsung, Xiaomi) aplican políticas propias de
ahorro; medir en el emulador no dice nada. Hay que medir en un teléfono de la
flota, o al menos en el mismo modelo.

---

## 3. Plan de arreglo, en orden

Los dos primeros no dependen de la medición: son defectos demostrables.

1. **Calcular `stoppedMinutes` de verdad** y **reevaluar el muestreo mientras el
   viaje corre**, no solo al arrancar. Es lo que hace que las tres ramas de la
   política existan de verdad. Implica reiniciar las actualizaciones con los
   valores nuevos cuando la rama cambia — cambio de estado real, no un
   parámetro que se ajusta en caliente.
2. **Subir `deferredUpdatesInterval`** muy por encima del intervalo de muestreo,
   para que el sistema pueda agrupar y dormir entre ráfagas.
3. **Revisar `pausesUpdatesAutomatically`** con datos: si el sistema pausa en una
   parada larga, es exactamente lo que queremos. El motivo por el que está en
   `false` no está escrito; hay que recuperarlo antes de cambiarlo.
4. **Recién entonces, la precisión**: evaluar `Balanced` en tramos urbanos y
   `High` en carretera, si la medición dice que el GPS domina.

Y una regla de producto que sale de esto: **el chofer tiene que poder ver qué
está pasando.** Hoy la app no dice cuánta batería lleva gastada ni con qué
frecuencia está muestreando. Si el reporte hubiera venido con «lo tenía en modo
detenido y seguía cada minuto», el diagnóstico habría durado cinco minutos.

---

## 4. Lo que esto le enseña a la app de fotos

El backup de fotos y videos al servidor propio es **el mismo problema mirado al
revés**, y por eso conviene resolver éste primero.

Timón rastrea **mientras** pasa algo: hay un viaje en curso y la posición de
dentro de diez minutos no sirve. No puede esperar, y de ahí el foreground
service.

Un backup de fotos **sí puede esperar**. Una foto sacada al mediodía puede
subirse a las 2 de la mañana sin que cambie nada. Eso permite `WorkManager` con
condiciones —cargando, wifi, pantalla apagada— que es lo que hace Google Photos
y por eso no se nota.

> **La regla: si el trabajo puede esperar, no va en un foreground service.**

Aplicada al revés, es la pregunta que hay que hacerle a Timón: **cuánto de este
rastreo de verdad no podía esperar.** Un punto cada minuto en una balanza no
podía esperar… ¿por qué?
