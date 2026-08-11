# Timón

App móvil del conductor para empresas de transporte de carga.

Dos cosas hace: **registro de asistencia** y **mis viajes** — checklist, iniciar
viaje, registrar vueltas, firmar la entrega, fotos y documentos. Y debajo de todo
eso, lo que justifica que sea una app nativa y no una web: **comparte la
ubicación de la unidad mientras el viaje está en curso**, con la pantalla
apagada, para que la torre de control la vea en vivo.

Es **genérica del rubro**: el mismo binario sirve para cualquier empresa de
transporte. El chofer la instala, escribe el código de su empresa, verifica su
teléfono y entra.

## Estado

Sin implementar. Specs en `Portal/specs/modules/`:

| | |
| --- | --- |
| `FLOTA-APP-RN.spec.md` | Técnico: identidad, ubicación en background, contrato con el server, edge cases |
| `FLOTA-APP-RN.stitch-brief.md` | Diseño: sistema visual y una consigna por pantalla |

## Backend

No tiene backend propio: habla con **Portal** (endpoints públicos de flota). Los
archivos viven en **lila-app**.

## Para trabajar en este repo

Leer `CLAUDE.md` primero: están los invariantes que no se negocian y los
identificadores que no se pueden cambiar después.
