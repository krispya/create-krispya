export const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>$title</title>
</head>
<body>
    <div id="root"></div>
    <script type="module" src="$indexPath"></script>
</body>
</html>`;

export const viteHtmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>$title</title>
</head>
<body>
    <div id="app"></div>
    <script type="module" src="$indexPath"></script>
</body>
</html>`;

export const indexContent = `import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { App } from './app.js'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)`;

export const viteIndexContent = `import './index.css'

document.querySelector('#app')!.innerHTML = \`
  <h1>Hello Vite!</h1>
  <p>Edit src/main.ts and save to see HMR in action.</p>
\``;

export const viteStyleContent = `:root {
  font-family:
    system-ui,
    -apple-system,
    sans-serif;
  line-height: 1.5;
  font-weight: 400;
}

*,
*::before,
*::after {
  box-sizing: border-box;
}

body {
  margin: 0;
}`;

export const viteEnvContent = `/// <reference types="vite/client" />`;
