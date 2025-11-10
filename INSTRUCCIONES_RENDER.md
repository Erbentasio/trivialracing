# Instrucciones para actualizar en Render

## Opción 1: Auto-deploy (Recomendado - Automático)

Si tienes auto-deploy activado en Render (que es lo normal), los cambios se desplegarán automáticamente en 2-5 minutos después del push a GitHub.

**Para verificar:**
1. Ve a tu dashboard de Render: https://dashboard.render.com
2. Selecciona tu servicio "trivial-racing"
3. Ve a la pestaña "Events" o "Logs"
4. Verás un nuevo deploy iniciándose automáticamente

## Opción 2: Deploy Manual

Si necesitas forzar un deploy manual:

1. Ve a https://dashboard.render.com
2. Selecciona tu servicio "trivial-racing"
3. Haz clic en el botón **"Manual Deploy"** → **"Deploy latest commit"**
4. Espera 2-5 minutos mientras Render despliega

## Verificar que funciona

Una vez desplegado:
1. Visita tu URL de Render (ej: https://trivial-racing.onrender.com)
2. Verifica que:
   - El logo aparece en la página principal
   - Los colores han cambiado (fondo claro, colores vibrantes)
   - Todo funciona correctamente

## Nota importante

Si el logo no aparece, verifica que:
- El archivo `logo.png` esté en la carpeta `public/`
- El nombre del archivo sea exactamente `logo.png` (minúsculas)
- El archivo se haya subido correctamente a GitHub

