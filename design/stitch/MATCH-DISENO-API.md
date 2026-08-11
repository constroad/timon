# Diseño de Stitch ↔ lo que ya existe en Portal

> Qué hay acá: las 26 pantallas que devolvió Stitch (`html/`, `capturas/`,
> `indice.json`) cruzadas contra el **modelo de datos** y los **endpoints** que
> Portal ya tiene.
> Objetivo: separar lo que es cablear de lo que es construir.
> Fecha: 07/08/2026. Specs: `Portal/specs/modules/FLOTA-APP-RN*.md`.

---

## 1. Resumen

| | Pantallas |
| --- | --- |
| **Se cablean contra API existente** | 13 |
| **Necesitan API nueva** | 6 (todo el alta) |
| **Solo cliente, sin API** | 4 (permisos, estados de sistema) |
| **Tienen datos pero les falta una pieza** | 3 |

**La conclusión que importa:** toda la operación —viajes, checklist, entrega,
vueltas, documentos, incidentes— **ya está servida por
`/api/public/fleet/driver`**. Lo que no existe es **el alta**: el código de
empresa, el OTP y la credencial de dispositivo. Ese es el bloque nuevo de
verdad, y es exactamente el que va primero (§A2 del plan).

---

## 2. Pantalla por pantalla

### 2.1 Alta — nada de esto existe todavía

| Pantalla de Stitch | Qué necesita | Estado |
| --- | --- | --- |
| Código de empresa | Código → `companyId` + branding | **API nueva.** Resolver código con rate limit |
| Confirmar empresa | `company.name`, logo, colores de marca | Existe el dato (`companies`), falta el endpoint público |
| Mi número | Buscar `driver.phoneNumber` dentro del tenant | **API nueva.** El campo ya existe (hoy se usa para mandarle el link) |
| Código de verificación | Generar, enviar por WhatsApp y validar OTP | **API nueva.** El canal de WhatsApp de la empresa ya existe |
| Bienvenida | Nombre del chofer + conteo de viajes de hoy | Derivable del payload del portal |
| *(falta)* Selector de empresa | Un chofer en dos empresas | **No está en el diseño de Stitch** — ver §4 |

También falta persistir la **credencial de dispositivo**. Lo más cercano que
existe es `internalPublicAccess.devices` (el enrolamiento de accesos) y su
verificación `verifyInternalPublicDeviceAccess`: conviene extender eso y no
inventar un mecanismo paralelo.

### 2.2 Operación — ya servido

Todo sale de `GET /api/public/fleet/driver` (un solo payload) y sus acciones:

| Pantalla | Campo / acción que ya existe |
| --- | --- |
| Mis viajes | `trips[]` con `date, origin, destination, cargo, plate, status, nextAction` |
| Detalle del viaje | El mismo `DriverPortalTrip` + `stops`, `documents`, `perDiem` |
| Checklist de seguridad | Catálogo en `payload.checklist`; se envía en `action.checklist[]` |
| Firmar entrega | `action.pod` = `receiverName, receiverDni, signatureDataUrl, geo` |
| Entregas múltiples | `trip.stops[]` + `action.stopIndex` (índice, no id — clave para el reintento offline) |
| Vueltas registradas | `POST` ciclo con `m3, tn, mediaId, photoDeferred, clientKey` |
| Documentos del viaje | `trip.documents[]` (`TripDocumentView`) |
| Perfil del conductor | `payload.duty` (jornada), `payload.docs` (licencia/médico), `trip.perDiem` |
| Reportar incidente | Auto-reporte con `incidentKind` del catálogo `INCIDENT_KINDS` |
| Registro de asistencia | `POST /api/attendance` — pero con OTRA identidad (§3.1) |

**Detalle que el diseño debe respetar:** la hora de una vuelta **la pone el
servidor**, no el teléfono. Decide horas de jornada y por lo tanto plata; el
reloj de un celular es data del cliente. Si la pantalla muestra la hora del tap,
que quede claro que es provisional hasta que confirme.

### 2.3 Solo cliente

Permiso de ubicación, permiso de batería, asistencia fuera de zona (la parte
visual) y los estados de sistema. No tocan API.

---

## 3. Las tres piezas que faltan, y no son de diseño

### 3.1 Asistencia y viajes usan identidades distintas

| | Viajes | Asistencia |
| --- | --- | --- |
| Endpoint | `/api/public/fleet/driver` | `/api/attendance` |
| Quién autoriza | `driverToken` (public link) | Dispositivo aprobado en `internalPublicAccess` |

Los dos menús de la app cruzan las dos. **Es el problema central del §3 del spec
técnico** y ninguna pantalla de Stitch lo revela, porque es invisible: el chofer
ve dos menús y asume que es la misma sesión. La credencial de dispositivo tiene
que habilitar ambas.

### 3.2 «Viaje en curso» pide datos que el portal del conductor no manda

La pantalla muestra **mapa, distancia restante y ETA**. Ese cálculo existe
—`getCachedDispatchTracking`, el mismo motor del seguimiento del cliente— pero
hoy **solo lo devuelve el endpoint del cliente**, no el del conductor.

Hay que decidir: o el payload del conductor incluye su tracking, o la app pega a
otro endpoint. Recomiendo lo primero, con la ruta ya cacheada 60 s.

### 3.3 Ubicación: falta el lote, y hay un choque de nombres

- El endpoint acepta **UN punto por request**. La app necesita mandar lotes
  (§4.3 del spec): dos horas sin señal son ~120 puntos.
- **Nombres distintos para la misma cosa:** flota usa `{ lat, lng }` y asistencia
  usa `{ latitude, longitude }`. Es exactamente el tipo de detalle que produce un
  bug mudo cuando la app comparte un módulo de ubicación entre los dos menús.
  Conviene normalizar en el cliente y dejarlo escrito.

### 3.4 «Asistencia fuera de zona» no tiene dónde apoyarse

La pantalla existe en el diseño, pero en la DB **no hay geocerca de asistencia ni
marca de fuera de zona**. `attendance` guarda `location`, nada más. Falta:
configuración de zona por empresa (opcional, apagada por defecto) y un campo que
registre que la marca cayó afuera —**para avisar, nunca para bloquear**—.

---

## 4. Lo que Stitch no diseñó (contra el brief)

1. **Selector de empresa** para el chofer que trabaja en dos. Es el caso normal
   de un fletero, no el raro.
2. **Estados de sistema**: actualización obligatoria, acceso revocado, sin
   permiso de ubicación durante el viaje.
3. **Variante iOS del permiso** («Mientras se usa» → «Siempre»).
4. **Estados sin conexión y cola pendiente** en cada pantalla, que el brief pedía
   como transversales.
5. **Modo oscuro de 13 de las 26**: solo la mitad vino en los dos modos.

---

## 5. El tema: lo de Stitch NO se copia

Stitch trabajó sin saber que acá **el color sale de la empresa logueada**. Lo que
devolvió tiene hexadecimales fijos y su propia tipografía:

| | Stitch | Portal |
| --- | --- | --- |
| Superficie | `#ffffff` / `#fcf9f8` | token `--sc-card` / `--sc-background` |
| Acento | `#b4c5ff`, `#ffb95f` (fijos) | `--portal-brand-*` de la company, vía puente a HSL |
| Tipografía | Inter | Roboto + stack del sistema |

**Regla: se toma la estructura, nunca el color.** Cada hex se traduce a token y
el acento se cablea a la marca de la empresa. Pegar su CSS metería una paleta
fija en una app donde el naranja de una empresa y el azul de otra tienen que
verse bien en la misma pantalla.

Lo que sí vale tal cual: la **anatomía**. En particular la del detalle del
viaje —héroe con la ruta, barra de hitos, y la acción única anclada al fondo— que
es justo lo que hoy le falta al portal web, donde hay que hacer scroll entre once
bloques para encontrar qué hacer.

---

## 6. Qué haría primero

1. **Endpoints del alta** (código de empresa, OTP, credencial). Es lo único
   bloqueante: sin eso la app no puede ni abrir.
2. **Tracking en el payload del conductor** (§3.2) y **lote de posiciones**
   (§3.3). Son las dos piezas de las que depende la razón de existir de la app.
3. **Unificar la identidad** de asistencia y viajes (§3.1).
4. Recién ahí, pantallas.
