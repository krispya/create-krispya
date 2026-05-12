import type { Formatter, Linter } from '../types.js';

export type PackageJsonScripts = Record<string, string>;

export const packageJsonScripts = {
  appBase: {
    dev: 'vite',
    build: 'vite build',
  } satisfies PackageJsonScripts,

  typescript: {
    typecheck: 'tsc --build --noEmit',
    'typecheck:watch': 'tsc --build --watch',
  } satisfies PackageJsonScripts,

  test: {
    vitest: {
      test: 'vitest',
    } satisfies PackageJsonScripts,
  },

  build: {
    unbuild(configPath?: string): PackageJsonScripts {
      return {
        build: configPath == null ? 'unbuild' : `unbuild --config ${configPath}`,
      };
    },

    tsdown: {
      build: 'tsdown',
    } satisfies PackageJsonScripts,
  },

  lint: {
    oxlint(configPath?: string): PackageJsonScripts {
      return {
        lint: configPath == null ? 'oxlint' : `oxlint -c ${configPath}`,
      };
    },

    eslint(configPath?: string): PackageJsonScripts {
      return {
        lint: configPath == null ? 'eslint .' : `eslint --config ${configPath} .`,
      };
    },

    biome(configPath?: string): PackageJsonScripts {
      return {
        lint: configPath == null ? 'biome lint .' : `biome lint --config-path ${configPath} .`,
      };
    },
  },

  format: {
    prettier(configPath?: string, ignorePath?: string): PackageJsonScripts {
      const configFlag = configPath == null ? '' : ` --config ${configPath}`;
      const ignoreFlag = ignorePath == null ? '' : ` --ignore-path ${ignorePath}`;

      return {
        format: `prettier${configFlag}${ignoreFlag} --write .`,
      };
    },

    oxfmt(configPath: string): PackageJsonScripts {
      return {
        format: `oxfmt -c ${configPath} --write .`,
      };
    },

    biome(configPath?: string): PackageJsonScripts {
      return {
        format:
          configPath == null
            ? 'biome format --write .'
            : `biome format --config-path ${configPath} --write .`,
      };
    },
  },

  release(packageManagerName: string): PackageJsonScripts {
    return {
      release: `${packageManagerName} run build && ${packageManagerName} publish`,
    };
  },

  monorepoRoot(linter: Linter, formatter: Formatter): PackageJsonScripts {
    return mergePackageJsonScripts(
      {
        dev: "pnpm --filter './apps/*' run dev",
        build: "pnpm --filter './packages/*' run build && pnpm --filter './apps/*' run build",
        test: 'pnpm -r run test',
      },
      linter === 'oxlint'
        ? {
            lint: 'oxlint .',
          }
        : linter === 'biome'
          ? {
              lint: 'biome check .',
            }
          : {
              lint: 'eslint .',
            },
      formatter === 'oxfmt'
        ? {
            format: 'oxfmt -c .config/oxfmt/base.json .',
          }
        : formatter === 'biome'
          ? {
              format: 'biome format . --write',
            }
          : {
              format:
                'prettier --config .config/prettier/base.json --ignore-path .config/prettier/prettierignore --write .',
            }
    );
  },
};

export function mergePackageJsonScripts(
  ...scriptSets: Array<PackageJsonScripts | undefined>
): PackageJsonScripts {
  return Object.assign({}, ...scriptSets.filter((scriptSet) => scriptSet != null));
}

export function resolveDefaultPackageJsonScripts(params: {
  language: 'javascript' | 'typescript';
  isLibrary: boolean;
  packageManagerName: string;
}): PackageJsonScripts {
  return mergePackageJsonScripts(
    params.isLibrary ? undefined : packageJsonScripts.appBase,
    params.language === 'typescript' ? packageJsonScripts.typescript : undefined,
    params.isLibrary ? packageJsonScripts.release(params.packageManagerName) : undefined
  );
}
