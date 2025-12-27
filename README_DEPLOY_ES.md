# Deploy sin Git en Netlify manteniendo Functions

Este proyecto **necesita** la función serverless `/.netlify/functions/gemini-proxy` para llamar a la API de Gemini sin exponer la API key en el navegador.

## 1) Importante: Drag & Drop (subir ZIP/carpeta desde la web)

El método de despliegue por **Drag & Drop / Netlify Drop** está orientado a sitios estáticos simples. En la práctica, este tipo de despliegue **no ejecuta builds** y suele **no desplegar Functions**.

Si despliegas solo con Drag & Drop, verás errores tipo “Error al conectar con la IA a través del proxy” porque el endpoint `/.netlify/functions/gemini-proxy` no estará disponible.

## 2) Forma recomendada sin Git: Netlify CLI

Netlify soporta despliegues manuales (sin Git) con **Netlify CLI**, incluyendo Functions.

### Pasos (Windows / macOS / Linux)

1. Instala la CLI (requiere Node.js):
   ```bash
   npm i -g netlify-cli
   ```

2. Inicia sesión:
   ```bash
   netlify login
   ```

3. Entra en la carpeta del proyecto (donde está `index.html` y la carpeta `netlify/`):
   ```bash
   cd /ruta/al/proyecto
   ```

4. (Una sola vez) Vincula con tu site de Netlify:
   ```bash
   netlify link
   ```
   Selecciona el site existente `trading-de-0m-a-100-con-ict` (o el que corresponda).

5. Asegura variables de entorno en Netlify (en el panel del site):
   - `GEMINI_API_KEY` = tu API key de Gemini
   - (Opcional) `GEMINI_MODEL` = por ejemplo `gemini-2.5-flash`

6. Despliega a producción:
   ```bash
   netlify deploy --prod --dir=.
   ```

## 3) Qué se añadió/cambió en este paquete

- `netlify/functions/gemini-proxy.js`:
  - Acepta múltiples formatos de entrada: `{prompt}`, `{userPrompt}`, o payload Gemini `{contents, systemInstruction}`
  - Normaliza `systemInstruction` -> `system_instruction` (formato REST)
  - Devuelve compatibilidad de salida:
    - `text`
    - `result`
    - `candidates` (en el nivel superior)
    - `data` (respuesta cruda de Gemini)
- `netlify.toml`: fija el directorio de Functions como `netlify/functions`.
