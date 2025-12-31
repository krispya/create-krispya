// HTML for React and R3F templates
export const HtmlContent = `<!DOCTYPE html>
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
</html>`

// HTML for vanilla Vite template
export const ViteHtmlContent = `<!DOCTYPE html>
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
</html>`

// Entry point for React and R3F templates
export const IndexContent = `import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app.js'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)`

// Entry point for vanilla Vite template
export const ViteIndexContent = `import './style.css'

document.querySelector('#app')!.innerHTML = \`
  <h1>Hello Vite!</h1>
  <p>Edit src/main.ts and save to see HMR in action.</p>
\``

// Default styles for vanilla Vite template
export const ViteStyleContent = `body {
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
}`

export const GitAttributes = [
  '* text eol=lf',
  '*.png binary',
  '*.jpg binary',
  '*.jpeg binary',
  '*.gif binary',
  '*.ico binary',
  '*.mov binary',
  '*.mp4 binary',
  '*.mp3 binary',
  '*.flv binary',
  '*.fla binary',
  '*.wav binary',
  '*.swf binary',
  '*.gz binary',
  '*.zip binary',
  '*.7z binary',
  '*.ttf binary',
  '*.eot binary',
  '*.woff binary',
  '*.pyc binary',
  '*.pdf binary',
  '*.glb binary',
  '*.gltf binary',
].join('\n')

// Common formatter configuration (Prettier-style format)
export type FormatterConfig = {
  printWidth: number
  tabWidth: number
  useTabs: boolean
  semi: boolean
  singleQuote: boolean
  trailingComma: 'none' | 'es5' | 'all'
  bracketSpacing: boolean
  arrowParens: 'always' | 'avoid'
}

export const defaultFormatterConfig: FormatterConfig = {
  printWidth: 102,
  tabWidth: 4,
  useTabs: false,
  semi: true,
  singleQuote: true,
  trailingComma: 'es5',
  bracketSpacing: true,
  arrowParens: 'always',
}
