# Publicar BúhoQuiz gratis en Render (≈10 minutos)

## 1. Crear las cuentas (solo la primera vez)

1. **GitHub:** https://github.com/signup (gratis).
2. **Render:** https://render.com → *Get Started* → **Sign in with GitHub** (así quedan conectadas).

## 2. Crear el repositorio en GitHub

1. En GitHub: botón **New repository**.
2. Nombre: `buhoquiz` · puede ser **Private** · NO marques "Add a README".
3. **Create repository** y copia la dirección que aparece, por ejemplo
   `https://github.com/TU_USUARIO/buhoquiz.git`

## 3. Subir el código desde la PC

Abre PowerShell en la carpeta `buhoquiz` y ejecuta (cambia la URL por la tuya):

```powershell
$git = "..\herramientas\git\cmd\git.exe"
& $git remote add origin https://github.com/TU_USUARIO/buhoquiz.git
& $git push -u origin main
```

La primera vez se abrirá una ventana para iniciar sesión en GitHub.

## 4. Crear el servicio en Render

1. En Render: **New +** → **Web Service** → elige el repositorio `buhoquiz`.
2. Configura:
   - **Name:** `buhoquiz` (será `https://buhoquiz.onrender.com`, o similar si el nombre está ocupado)
   - **Runtime:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance Type:** **Free**
3. En **Environment Variables** agrega:
   - `ADMIN_PASSWORD` = *tu clave secreta de maestro* (¡no uses la de ejemplo!)
4. **Create Web Service**. En 2–4 minutos verás "Live".

## 5. Usarlo

- Maestro: `https://TU-APP.onrender.com/maestro`
- Participantes: `https://TU-APP.onrender.com` (o el QR que aparece en la sala)

## Actualizar después de un cambio en el código

```powershell
& $git add -A
& $git commit -m "Cambios"
& $git push
```
Render vuelve a publicar solo.

## Consejos para el día del juego

- Abre la página del maestro **5 minutos antes**: el plan gratuito se duerme tras ~15 min sin uso y tarda ~1 minuto en despertar.
- Las preguntas NO se guardan en el servidor: cárgalas con el Excel cada vez (es instantáneo).
- Para participantes remotos: comparte la pantalla del proyector por Zoom/Meet y envíales el enlace con el PIN.
