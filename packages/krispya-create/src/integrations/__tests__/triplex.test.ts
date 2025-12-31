import { describe, it, expect, vi } from 'vitest'
import { generateTriplex } from '../triplex'

describe('triplex integration', () => {
  it('should generate empty providers', () => {
    const addFile = vi.fn()

    generateTriplex(
      {
        configureVite: vi.fn(),
        options: {},
        replace: vi.fn(),
        addDependency: vi.fn(),
        addFile,
        inject: vi.fn(),
      },
      {},
    )

    expect(addFile.mock.calls[0]).toMatchInlineSnapshot(`
      [
        ".triplex/providers.tsx",
        {
          "content": "
          import { type ReactNode } from "react";
          
          
          
            /**
             * The global provider is rendered at the root of your application,
             * use it to set up global configuration like themes.
             * Props defined on this component appear as controls inside Triplex.
             * 
             * See: https://triplex.dev/docs/building-your-scene/providers#global-provider
             */
            export function GlobalProvider({ children,  }: { children: ReactNode;  }) {
              
              return (
                <>
                  
                  {children}
                </>
              );
            }
          
            /**
             * The canvas provider is rendered as a child inside the React Three Fiber canvas,
             * use it to set up canvas specific configuration like post-processing and physics.
             * Props defined on this component appear as controls inside Triplex.
             * 
             * See: https://triplex.dev/docs/building-your-scene/providers#canvas-provider
             */
            export function CanvasProvider({ children,  }: { children: ReactNode;  }) {
              
              return (
                <>
                  
                  {children}
                </>
              );
            }
        ",
          "type": "text",
        },
      ]
    `)
  })

  it('should generate uikit color mode switcher', () => {
    const addFile = vi.fn()

    generateTriplex(
      {
        configureVite: vi.fn(),
        options: { uikit: true },
        replace: vi.fn(),
        addDependency: vi.fn(),
        addFile,
        inject: vi.fn(),
      },
      {},
    )

    expect(addFile.mock.calls[0]).toMatchInlineSnapshot(`
      [
        ".triplex/providers.tsx",
        {
          "content": "
          import { type ReactNode, useLayoutEffect } from "react";
          import { setPreferredColorScheme } from "@react-three/uikit"
          
          
            /**
             * The global provider is rendered at the root of your application,
             * use it to set up global configuration like themes.
             * Props defined on this component appear as controls inside Triplex.
             * 
             * See: https://triplex.dev/docs/building-your-scene/providers#global-provider
             */
            export function GlobalProvider({ children, colorMode = "light" }: { children: ReactNode; colorMode?: "light" | "dark" }) {
              
                useLayoutEffect(() => {
                  
              setPreferredColorScheme(colorMode);
            
                }, [colorMode]);
              
              return (
                <>
                  
                  {children}
                </>
              );
            }
          
            /**
             * The canvas provider is rendered as a child inside the React Three Fiber canvas,
             * use it to set up canvas specific configuration like post-processing and physics.
             * Props defined on this component appear as controls inside Triplex.
             * 
             * See: https://triplex.dev/docs/building-your-scene/providers#canvas-provider
             */
            export function CanvasProvider({ children,  }: { children: ReactNode;  }) {
              
              return (
                <>
                  
                  {children}
                </>
              );
            }
        ",
          "type": "text",
        },
      ]
    `)
  })

  it('should generate populated providers', () => {
    const addFile = vi.fn()

    generateTriplex(
      {
        configureVite: vi.fn(),
        options: { postprocessing: true, rapier: true },
        replace: vi.fn(),
        addDependency: vi.fn(),
        addFile,
        inject: vi.fn(),
      },
      {},
    )

    expect(addFile.mock.calls[0]).toMatchInlineSnapshot(`
      [
        ".triplex/providers.tsx",
        {
          "content": "
          import { type ReactNode } from "react";
          import { Bloom, DepthOfField, EffectComposer } from "@react-three/postprocessing";
      import { Physics } from "@react-three/rapier";
          
          
            /**
             * The global provider is rendered at the root of your application,
             * use it to set up global configuration like themes.
             * Props defined on this component appear as controls inside Triplex.
             * 
             * See: https://triplex.dev/docs/building-your-scene/providers#global-provider
             */
            export function GlobalProvider({ children,  }: { children: ReactNode;  }) {
              
              return (
                <>
                  
                  {children}
                </>
              );
            }
          
            /**
             * The canvas provider is rendered as a child inside the React Three Fiber canvas,
             * use it to set up canvas specific configuration like post-processing and physics.
             * Props defined on this component appear as controls inside Triplex.
             * 
             * See: https://triplex.dev/docs/building-your-scene/providers#canvas-provider
             */
            export function CanvasProvider({ children, physicsEnabled = false, debugPhysics = true, postProcessingEnabled = true }: { children: ReactNode; physicsEnabled?: boolean; debugPhysics?: boolean; postProcessingEnabled?: boolean }) {
              
              return (
                <>
                  
              <EffectComposer enabled={postProcessingEnabled}>
                <DepthOfField
                  focusDistance={0}
                  focalLength={0.02}
                  bokehScale={2}
                  height={480}
                />
                <Bloom luminanceThreshold={0} luminanceSmoothing={0.9} height={300} />
              </EffectComposer>
            
                  <Physics paused={!physicsEnabled} debug={debugPhysics}>{children}</Physics>
                </>
              );
            }
        ",
          "type": "text",
        },
      ]
    `)
  })
})
