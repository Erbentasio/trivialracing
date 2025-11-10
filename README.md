# Trivial Racing

Juego formativo con salas y competición en tiempo real usando Socket.io.

## 🚀 Despliegue en Render.com (Gratuito)

### Requisitos previos
1. Una cuenta en [GitHub](https://github.com) (gratuita)
2. Una cuenta en [Render.com](https://render.com) (gratuita)

### Pasos para desplegar:

#### 1. Subir el código a GitHub

1. Crea un nuevo repositorio en GitHub (puede ser privado o público)
2. En tu terminal, ejecuta:

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/TU_REPOSITORIO.git
git push -u origin main
```

#### 2. Crear el servicio en Render.com

1. Ve a [Render.com](https://render.com) y crea una cuenta (puedes usar tu cuenta de GitHub)
2. En el dashboard, haz clic en **"New +"** → **"Web Service"**
3. Conecta tu repositorio de GitHub y selecciona el repositorio de Trivial Racing
4. Configura el servicio:
   - **Name**: `trivial-racing` (o el nombre que prefieras)
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Plan**: Selecciona **"Free"**
5. Haz clic en **"Create Web Service"**

#### 3. Configurar variables de entorno (opcional)

Si necesitas cambiar el puerto, Render lo configurará automáticamente con la variable `PORT`. Tu código ya está preparado para esto (línea 335 de `server.js`).

#### 4. Esperar el despliegue

Render instalará las dependencias y desplegará tu aplicación. Esto puede tardar 2-5 minutos la primera vez.

#### 5. Acceder a tu aplicación

Una vez desplegado, Render te dará una URL como: `https://trivial-racing.onrender.com`

¡Tu aplicación estará disponible en internet! 🎉

### Notas importantes:

- **WebSockets**: Render.com soporta WebSockets en el plan gratuito, así que Socket.io funcionará correctamente.
- **Auto-deploy**: Cada vez que hagas `git push` a tu repositorio, Render desplegará automáticamente los cambios.
- **Sleep mode**: En el plan gratuito, si tu aplicación no recibe tráfico por 15 minutos, entrará en "sleep mode". La primera petición después de esto puede tardar unos segundos en responder (esto es normal en el plan gratuito).

### Alternativas gratuitas:

Si prefieres otras opciones:

1. **Railway.app**: Similar a Render, también gratuito con créditos mensuales
2. **Fly.io**: Buena opción, requiere configuración adicional
3. **Glitch.com**: Fácil de usar pero con limitaciones de WebSockets

## 🛠️ Desarrollo local

```bash
npm install
npm start
```

La aplicación estará disponible en `http://localhost:3000`

