export const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>$title</title>
</head>
<body style="margin: 0; overscroll-behavior: none; user-select: none; touch-action: none;">
    <script type="module" src="$indexPath"></script>
    <div style="width: 100dvw; height: 100dvh; overflow: hidden;" id="root"></div>
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
import { App } from './app.js'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)`;

export const viteIndexContent = `import './style.css'

document.querySelector('#app')!.innerHTML = \`
  <h1>Hello Vite!</h1>
  <p>Edit src/main.ts and save to see HMR in action.</p>
\``;

export const viteStyleContent = `body {
  font-family: system-ui, -apple-system, sans-serif;
  margin: 0;
  padding: 2rem;
  min-height: 100vh;
  background: #1a1a1a;
  color: #fff;
}

h1 {
  color: #646cff;
}

a {
  color: #646cff;
}`;
