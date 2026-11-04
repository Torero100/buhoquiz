# 🦉 BúhoQuiz

Juego de preguntas en tiempo real (estilo concurso) para 50–60+ participantes desde el celular.
Las preguntas se cargan desde un Excel; el maestro controla el juego desde el proyector.

- **Maestro:** `https://TU-APP.onrender.com/maestro` (pide clave)
- **Participantes:** `https://TU-APP.onrender.com` → PIN + nombre/apodo (o escanean el QR)

## Cómo se juega

1. El maestro entra a `/maestro`, escribe la clave y carga el Excel (y las imágenes, si usa archivos).
2. BúhoQuiz revisa el Excel y muestra errores fila por fila. Si todo está bien → **Abrir sala**.
3. Se proyecta el PIN y el QR. Los participantes entran desde su celular (o por enlace si están en otro lugar; a ellos se les comparte la pantalla del proyector por Zoom/Meet).
4. **Comenzar** → cada pregunta se cierra al acabar el tiempo o cuando todos responden.
5. Se muestra la respuesta correcta → **Ver ranking** → **Siguiente pregunta** …
6. Al final: podio con el **Búho de Oro, Plata y Bronce** y botón **Descargar resultados (Excel)**.

## Puntaje

- **UNICA / VF:** correcta = entre 50 % y 100 % de los puntos según la rapidez.
- **MULTIPLE:** cada correcta marcada suma `puntos ÷ n.º de correctas`; cada incorrecta marcada resta lo mismo (mínimo 0). Luego se aplica el factor de rapidez.
- Empate: gana quien acumuló menos tiempo de respuesta.

## Estructura del Excel

Descarga la plantilla desde el panel del maestro (`plantilla_buhoquiz.xlsx`). Hoja **preguntas**:

| columna | obligatorio | valores |
|---|---|---|
| orden | no | 1, 2, 3… |
| tipo | sí | `UNICA`, `VF`, `MULTIPLE` |
| pregunta | sí | texto |
| imagen | no | URL `https://…` o nombre de archivo (`perro.jpg`) subido junto al Excel |
| opcion_A, opcion_B | sí | texto (en VF: Verdadero / Falso) |
| opcion_C, opcion_D | no | texto (vacías en VF) |
| respuesta | sí | `B` o `A;C;D` |
| tiempo_seg | no | 5–120 (por defecto 20) |
| puntos | no | 100–10000 (por defecto 1000) |

Hoja **config** (opcional): `nombre_juego`, `tiempo_defecto`, `puntos_defecto`, `mostrar_ranking` (SI/NO).

## Probar en la PC (sin internet público)

Doble clic en `iniciar_local.bat` y abre `http://localhost:3000/maestro` (clave: `buho2026`).
Desde un celular en la **misma red WiFi**: `http://IP-DE-TU-PC:3000`.

## Publicar gratis en Render

Ver **GUIA_RENDER.md**.

## Notas

- Un juego activo a la vez. El estado vive en memoria: si el servidor se reinicia, el juego en curso se pierde (el Excel se vuelve a cargar en segundos).
- En el plan gratuito de Render el servidor "se duerme" tras ~15 min sin uso: abre la página del maestro **5 minutos antes** de empezar.
- Simulación de carga: `npm run simular -- public/plantilla_buhoquiz.xlsx 60` (con el servidor encendido).
