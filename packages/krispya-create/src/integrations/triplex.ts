import type { Generator } from '../index.js'
import { unique } from '../lib/array.js'

export type GenerateTriplexOptions = {} | boolean

export type PropValue = {
  declaredPropDefaultValue: unknown
  declaredPropName: string
  declaredPropType: string
  propName: string
  propValue: string
}

export type ProviderDefinition = Record<
  string,
  | {
      component: string
      type: 'wrapped-jsx'
      import: string
      props?: PropValue[]
    }
  | {
      code: string
      type: 'inline-jsx'
      import: string
      props?: PropValue[]
    }
  | {
      code: string
      type: 'layout-effect'
      import: string
      props?: PropValue[]
    }
>

function generateProvidersModule(generator: Generator): string {
  const canvasProviders: (keyof typeof providerDefs)[] = []
  const globalProviders: (keyof typeof providerDefs)[] = []
  const providerDefs: ProviderDefinition = {
    uikit: {
      type: 'layout-effect',
      props: [
        {
          declaredPropDefaultValue: '"light"',
          declaredPropName: 'colorMode',
          propName: 'colorMode',
          propValue: 'colorMode',
          declaredPropType: '"light" | "dark"',
        },
      ],
      code: `
        setPreferredColorScheme(colorMode);
      `,
      import: 'import { setPreferredColorScheme } from "@react-three/uikit"',
    },
    rapier: {
      component: 'Physics',
      type: 'wrapped-jsx',
      import: 'import { Physics } from "@react-three/rapier";',
      props: [
        {
          declaredPropDefaultValue: false,
          declaredPropName: 'physicsEnabled',
          propName: 'paused',
          propValue: '!physicsEnabled',
          declaredPropType: 'boolean',
        },
        {
          declaredPropDefaultValue: true,
          declaredPropName: 'debugPhysics',
          propName: 'debug',
          propValue: 'debugPhysics',
          declaredPropType: 'boolean',
        },
      ],
    },
    postprocessing: {
      type: 'inline-jsx',
      code: `
        <EffectComposer enabled={postProcessingEnabled}>
          <DepthOfField
            focusDistance={0}
            focalLength={0.02}
            bokehScale={2}
            height={480}
          />
          <Bloom luminanceThreshold={0} luminanceSmoothing={0.9} height={300} />
        </EffectComposer>
      `,
      import: 'import { Bloom, DepthOfField, EffectComposer } from "@react-three/postprocessing";',
      props: [
        {
          declaredPropDefaultValue: true,
          declaredPropName: 'postProcessingEnabled',
          propName: 'enabled',
          propValue: 'postProcessingEnabled',
          declaredPropType: 'boolean',
        },
      ],
    },
  }

  if (!!generator.options.rapier) {
    canvasProviders.push('rapier')
  }

  if (!!generator.options.postprocessing && !generator.options.xr) {
    canvasProviders.push('postprocessing')
  }

  if (!!generator.options.uikit) {
    globalProviders.push('uikit')
  }

  function generateProviderFunction(
    name: string,
    { jsdoc, providers }: { jsdoc: string; providers: (keyof typeof providerDefs)[] },
  ) {
    const resolvedProviders = providers.map((provider) => providerDefs[provider]!)
    const providerProps = resolvedProviders.flatMap((provider) => provider.props || [])
    const providerImports = resolvedProviders.flatMap((provider) => provider.import)
    const wrappedComponents = resolvedProviders.filter((provider) => provider.type === 'wrapped-jsx')
    const inlineComponents = resolvedProviders.filter((provider) => provider.type === 'inline-jsx')
    const layoutEffects = resolvedProviders.filter((provider) => provider.type === 'layout-effect')
    const declaredProps = providerProps
      .map((prop) => `${prop.declaredPropName} = ${prop.declaredPropDefaultValue}`)
      .join(', ')
    const declaredTypes = providerProps.map((prop) => `${prop.declaredPropName}?: ${prop.declaredPropType}`).join('; ')
    const reactImports: string[] = ['type ReactNode']

    if (layoutEffects.length) {
      reactImports.push('useLayoutEffect')
    }

    return {
      reactImports,
      imports: providerImports,
      code: `
      /**
${jsdoc
  .split('\n')
  .map((line) => `       * ${line}`)
  .join('\n')}
       */
      export function ${name}({ children, ${declaredProps} }: { children: ReactNode; ${declaredTypes} }) {
        ${
          layoutEffects.length
            ? `
          useLayoutEffect(() => {
            ${layoutEffects.map((effect) => effect.code).join('\n')}
          }, [${layoutEffects.map((effect) => effect.props?.[0]?.propValue)}]);
        `
            : ''
        }
        return (
          <>
            ${inlineComponents.map((provider) => provider.code)}
            ${wrappedComponents.reduce((acc, provider) => {
              const props = provider.props?.map((prop) => `${prop.propName}={${prop.propValue}}`).join(' ')
              return `<${provider.component} ${props}>${acc}</${provider.component}>`
            }, '{children}')}
          </>
        );
      }`,
    }
  }

  const global = generateProviderFunction('GlobalProvider', {
    jsdoc:
      'The global provider is rendered at the root of your application,\nuse it to set up global configuration like themes.\nProps defined on this component appear as controls inside Triplex.\n\nSee: https://triplex.dev/docs/building-your-scene/providers#global-provider',
    providers: globalProviders,
  })
  const canvas = generateProviderFunction('CanvasProvider', {
    jsdoc:
      'The canvas provider is rendered as a child inside the React Three Fiber canvas,\nuse it to set up canvas specific configuration like post-processing and physics.\nProps defined on this component appear as controls inside Triplex.\n\nSee: https://triplex.dev/docs/building-your-scene/providers#canvas-provider',
    providers: canvasProviders,
  })

  return `
    import { ${unique(global.reactImports, canvas.reactImports).sort().join(', ')} } from "react";
    ${unique(global.imports, canvas.imports).sort().join('\n')}
    
    ${global.code}
    ${canvas.code}
  `
}

export function generateTriplex(generator: Generator, options: GenerateTriplexOptions | undefined) {
  if (options == null) {
    return
  }

  generator.inject('vscode-extension-suggestion', 'trytriplex.triplex-vsce')
  generator.inject(
    'readme-tools',
    `[Triplex](https://triplex.dev) - Your visual workspace for React / Three Fiber. Get started by installing [Triplex for VS Code](https://triplex.dev/docs/get-started/vscode). Don't use Visual Studio Code? Download [Triplex Standalone](https://triplex.dev/docs/get-started/standalone).`,
  )

  generator.addFile('.triplex/providers.tsx', {
    content: generateProvidersModule(generator),
    type: 'text',
  })

  generator.addFile('.triplex/config.json', {
    content: JSON.stringify(
      {
        $schema: 'https://triplex.dev/config.schema.json',
        provider: './providers.tsx',
      },
      null,
      2,
    ),
    type: 'text',
  })
}
