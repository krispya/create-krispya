import type { Generator } from '../index.js'

export type GenerateXrOptions =
  | {
      storeOptions?: any
    }
  | boolean

export function generateXr(generator: Generator, options: GenerateXrOptions | undefined) {
  if (options == null || options === false) {
    return
  }
  if (options === true) {
    options = {}
  }
  generator.addDependency('@react-three/xr', '^6.6.16')
  generator.addDependency("@vitejs/plugin-basic-ssl", "^2.0.0")
  generator.inject('import', "import { XR, createXRStore } from '@react-three/xr'")
  generator.inject(`global-start`, `const store = createXRStore(${JSON.stringify(options.storeOptions ?? {})})`)
  generator.inject('scene-start', '<XR store={store}>')
  generator.inject('scene-end', '</XR>')

  generator.inject('vite-config-import', "import basicSsl from '@vitejs/plugin-basic-ssl'")
  generator.configureVite({
    server: {
      host: true,
    },
    plugins: ['$raw:basicSsl()'],
  })

  generator.inject(
    'dom-start',
    `<div style={{
        display: "flex",
          flexDirection: "row",
          gap: "1rem",
          position: 'absolute',
          zIndex: 10000,
          background: 'black',
          borderRadius: '0.5rem',
          border: 'none',
          fontWeight: 'bold',
          color: 'white',
          cursor: 'pointer',
          fontSize: '1.5rem',
          bottom: '1rem',
          left: '50%',
          boxShadow: '0px 0px 20px rgba(0,0,0,1)',
          transform: 'translate(-50%, 0)',
        }}><button
        style={{ cursor: "pointer", padding: '1rem 2rem', fontSize: "1rem", background: "none", color: "white", border: "none" }}
        onClick={() => store.enterAR()}
      >
        Enter AR
      </button>
      <button
        style={{ cursor: "pointer", padding: '1rem 2rem', fontSize: "1rem", background: "none", color: "white", border: "none" }}
        onClick={() => store.enterVR()}
      >
        Enter VR
      </button></div>`,
  )
  generator.inject("readme-libraries", `[@react-three/xr](https://pmndrs.github.io/xr/docs/) - VR/AR support for @react-three/fiber`,)
}
