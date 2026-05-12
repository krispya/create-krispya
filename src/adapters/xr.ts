import type { PlanXrOptions, PlanBuilder } from '../types.js';

export function planXr(builder: PlanBuilder, options: PlanXrOptions | undefined) {
    if (options == null || options === false) {
        return;
    }
    if (options === true) {
        options = {};
    }
    builder.addDependency('@react-three/xr');
    builder.addDependency('@vitejs/plugin-basic-ssl');
    builder.inject('import', "import { XR, createXRStore } from '@react-three/xr'");
    builder.inject(
        `global-start`,
        `const store = createXRStore(${JSON.stringify(options.storeOptions ?? {})})`
    );
    builder.inject('scene-start', '<XR store={store}>');
    builder.inject('scene-end', '</XR>');

    builder.inject('vite-config-import', "import basicSsl from '@vitejs/plugin-basic-ssl';");
    builder.configureVite({
        server: {
            host: true,
        },
        plugins: ['$raw:basicSsl()'],
    });

    builder.inject(
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
      </button></div>`
    );
    builder.inject(
        'readme-libraries',
        `[@react-three/xr](https://pmndrs.github.io/xr/docs/) - VR/AR support for @react-three/fiber`
    );
}
