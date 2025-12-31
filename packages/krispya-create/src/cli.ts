#!/usr/bin/env node
import { cwd } from 'process'
import { generate, GenerateOptions, generateRandomName, getLatestPnpmVersion, Template } from './index.js'
import { getLatestNodeVersion } from './utils.js'
import { dirname, join } from 'path'
import { mkdir, writeFile } from 'fs/promises'
import { Command } from 'commander'
import * as p from '@clack/prompts'
import color from 'chalk'
import { fetch } from 'undici'

function getDefaultProjectName(template: Template): string {
  switch (template) {
    case 'vite':
      return `vite-${generateRandomName()}`
    case 'react':
      return `react-${generateRandomName()}`
    case 'r3f':
      return `react-three-${generateRandomName()}`
  }
}

function getTemplateLabel(template: Template): string {
  switch (template) {
    case 'vite':
      return 'Vite (vanilla)'
    case 'react':
      return 'React'
    case 'r3f':
      return 'React Three Fiber'
  }
}

function getDefaultOptions(template: Template, name: string): GenerateOptions {
  const base: GenerateOptions = {
    name,
    template,
    language: 'typescript',
    packageManager: 'pnpm',
    pnpmManageVersions: true,
    nodeVersion: 'latest',
  }

  if (template === 'r3f') {
    return {
      ...base,
      drei: {},
      handle: {},
      leva: {},
      postprocessing: {},
      rapier: {},
      xr: {},
      uikit: {},
      offscreen: {},
      zustand: {},
      koota: {},
      triplex: {},
      viverse: {},
    }
  }

  return base
}

function formatConfigSummary(options: GenerateOptions): string {
  const lines: string[] = []
  const VALUE_COL = 27 // Start position for values

  const formatRow = (label: string, value: string, indent = '') => {
    const fullLabel = indent + label
    const dotCount = Math.max(1, VALUE_COL - fullLabel.length - 1)
    const dots = color.gray('.'.repeat(dotCount))
    return `${indent}${label} ${dots} ${value}`
  }

  const formatLanguage = (lang: string) => {
    return lang === 'typescript' ? 'TypeScript' : lang === 'javascript' ? 'JavaScript' : lang
  }

  // Language
  lines.push(formatRow('Language', formatLanguage(options.language || 'typescript')))

  // Node version
  lines.push(formatRow('Node version', options.nodeVersion || 'latest'))

  // Package manager
  lines.push(formatRow('Package manager', options.packageManager || 'pnpm'))

  // pnpm-specific options
  if (options.packageManager === 'pnpm') {
    const versionManaged = options.pnpmManageVersions ? 'yes' : 'no'
    lines.push(formatRow('↳ Version managed', versionManaged, '  '))
  }

  // R3F integrations
  if (options.template === 'r3f') {
    const integrationNames = [
      options.drei && 'drei',
      options.handle && 'handle',
      options.leva && 'leva',
      options.postprocessing && 'postproc',
      options.rapier && 'rapier',
      options.xr && 'xr',
      options.uikit && 'uikit',
      options.offscreen && 'offscreen',
      options.zustand && 'zustand',
      options.koota && 'koota',
      options.triplex && 'triplex',
      options.viverse && 'viverse',
    ].filter(Boolean) as string[]

    lines.push('')
    lines.push(color.dim('Integrations'))

    // Two-column layout
    for (let i = 0; i < integrationNames.length; i += 2) {
      const left = `${color.green('●')} ${integrationNames[i]}`
      const right = integrationNames[i + 1] ? `${color.green('●')} ${integrationNames[i + 1]}` : ''
      const spacing = ' '.repeat(Math.max(1, 16 - integrationNames[i]!.length))
      lines.push(`  ${left}${spacing}${right}`)
    }
  }

  return lines.join('\n')
}

async function promptForCustomization(template: Template, name: string): Promise<GenerateOptions> {
  const nodeVersion = await p.text({
    message: 'Node.js version',
    placeholder: 'latest',
    defaultValue: 'latest',
    validate: (value) => {
      if (!value.length) return 'Required'
      if (value !== 'latest' && !/^\d+(\.\d+(\.\d+)?)?$/.test(value)) {
        return 'Must be "latest" or a valid semver (e.g., "22" or "22.13.0")'
      }
    },
  })

  if (p.isCancel(nodeVersion)) {
    p.cancel('Operation cancelled.')
    process.exit(0)
  }

  const packageManager = await p.select({
    message: 'Package manager',
    options: [
      { value: 'pnpm', label: 'pnpm' },
      { value: 'npm', label: 'npm' },
      { value: 'yarn', label: 'yarn' },
      { value: 'custom', label: 'Other (custom)' },
    ],
    initialValue: 'pnpm',
  })

  if (p.isCancel(packageManager)) {
    p.cancel('Operation cancelled.')
    process.exit(0)
  }

  let finalPackageManager = packageManager as string
  if (packageManager === 'custom') {
    const customPm = await p.text({
      message: 'Enter package manager command',
      validate: (value) => {
        if (!value.length) return 'Required'
      },
    })
    if (p.isCancel(customPm)) {
      p.cancel('Operation cancelled.')
      process.exit(0)
    }
    finalPackageManager = customPm
  }

  let pnpmManageVersions = true
  if (packageManager === 'pnpm') {
    const managePnpm = await p.confirm({
      message: 'Enable manage-package-manager-versions?',
      initialValue: true,
    })
    if (p.isCancel(managePnpm)) {
      p.cancel('Operation cancelled.')
      process.exit(0)
    }
    pnpmManageVersions = managePnpm
  }

  const language = await p.select({
    message: 'Language',
    options: [
      { value: 'typescript', label: 'TypeScript' },
      { value: 'javascript', label: 'JavaScript' },
    ],
    initialValue: 'typescript',
  })

  if (p.isCancel(language)) {
    p.cancel('Operation cancelled.')
    process.exit(0)
  }

  let integrations: string[] = []
  if (template === 'r3f') {
    const selected = await p.multiselect({
      message: 'R3F integrations',
      options: [
        { value: 'drei', label: 'Drei' },
        { value: 'handle', label: 'Handle' },
        { value: 'leva', label: 'Leva' },
        { value: 'postprocessing', label: 'Postprocessing' },
        { value: 'rapier', label: 'Rapier' },
        { value: 'xr', label: 'XR' },
        { value: 'uikit', label: 'UIKit' },
        { value: 'offscreen', label: 'Offscreen' },
        { value: 'zustand', label: 'Zustand' },
        { value: 'koota', label: 'Koota' },
        { value: 'triplex', label: 'Triplex' },
        { value: 'viverse', label: 'Viverse' },
      ],
      initialValues: [
        'drei',
        'handle',
        'leva',
        'postprocessing',
        'rapier',
        'xr',
        'uikit',
        'offscreen',
        'zustand',
        'koota',
        'triplex',
        'viverse',
      ],
      required: false,
    })
    if (p.isCancel(selected)) {
      p.cancel('Operation cancelled.')
      process.exit(0)
    }
    integrations = selected as string[]
  }

  return {
    name,
    template,
    language: language as 'typescript' | 'javascript',
    nodeVersion,
    packageManager: finalPackageManager,
    pnpmManageVersions,
    ...(template === 'r3f' && {
      drei: integrations.includes('drei') ? {} : undefined,
      handle: integrations.includes('handle') ? {} : undefined,
      leva: integrations.includes('leva') ? {} : undefined,
      postprocessing: integrations.includes('postprocessing') ? {} : undefined,
      rapier: integrations.includes('rapier') ? {} : undefined,
      xr: integrations.includes('xr') ? {} : undefined,
      uikit: integrations.includes('uikit') ? {} : undefined,
      offscreen: integrations.includes('offscreen') ? {} : undefined,
      zustand: integrations.includes('zustand') ? {} : undefined,
      koota: integrations.includes('koota') ? {} : undefined,
      triplex: integrations.includes('triplex') ? {} : undefined,
      viverse: integrations.includes('viverse') ? {} : undefined,
    }),
  }
}

async function promptForOptions(name: string | undefined): Promise<GenerateOptions> {
  // Step 1: Project Name (if not provided via argument)
  let projectName = name
  if (!projectName) {
    const nameResult = await p.text({
      message: 'What is your project named?',
      placeholder: generateRandomName(),
      defaultValue: generateRandomName(),
      validate: (value) => {
        if (!value.length) return 'Project name is required'
      },
    })
    if (p.isCancel(nameResult)) {
      p.cancel('Operation cancelled.')
      process.exit(0)
    }
    projectName = nameResult
  }

  // Step 2: Select template
  const template = await p.select({
    message: 'Select a template',
    options: [
      { value: 'vite', label: 'Vite', hint: 'vanilla TypeScript' },
      { value: 'react', label: 'React', hint: 'with Vite' },
      { value: 'r3f', label: 'React Three Fiber', hint: '3D graphics with React' },
    ],
    initialValue: 'vite',
  })

  if (p.isCancel(template)) {
    p.cancel('Operation cancelled.')
    process.exit(0)
  }

  const defaultOptions = getDefaultOptions(template as Template, projectName)

  // Step 3: Show summary and ask confirm/customize
  p.note(formatConfigSummary(defaultOptions), 'Template Configuration')

  const action = await p.select({
    message: 'Proceed with these settings?',
    options: [
      { value: 'confirm', label: 'Yes, create project' },
      { value: 'customize', label: 'No, let me customize' },
    ],
    initialValue: 'confirm',
  })

  if (p.isCancel(action)) {
    p.cancel('Operation cancelled.')
    process.exit(0)
  }

  if (action === 'confirm') {
    return defaultOptions
  }

  // Step 4: Customize
  return promptForCustomization(template as Template, projectName)
}

interface CliOptions {
  template?: Template
  js?: boolean
  ts?: boolean
  drei?: boolean
  handle?: boolean
  leva?: boolean
  postprocessing?: boolean
  rapier?: boolean
  xr?: boolean
  uikit?: boolean
  offscreen?: boolean
  zustand?: boolean
  koota?: boolean
  pnpmManageVersions?: boolean
  triplex?: boolean
  viverse?: boolean
  packageManager?: string
  nodeVersion?: string
  yes?: boolean
}

async function main() {
  const program = new Command()
    .name('krispya-create')
    .description('CLI for creating Vite, React, and React Three Fiber projects')
    .argument('[name]', 'name for the app')
    .option('--template <type>', 'project template: vite, react, or r3f (default: vite)')
    .option('--js', 'use javascript')
    .option('--ts', 'use typescript (default)')
    .option('--drei', 'add @react-three/drei (r3f only)')
    .option('--handle', 'add @react-three/handle (r3f only)')
    .option('--leva', 'add leva (r3f only)')
    .option('--postprocessing', 'add @react-three/postprocessing (r3f only)')
    .option('--rapier', 'add @react-three/rapier (r3f only)')
    .option('--xr', 'add @react-three/xr (r3f only)')
    .option('--uikit', 'add @react-three/uikit (r3f only)')
    .option('--offscreen', 'add @react-three/offscreen (r3f only)')
    .option('--zustand', 'add zustand (r3f only)')
    .option('--koota', 'add koota (r3f only)')
    .option('--triplex', 'set up triplex development environment (r3f only)')
    .option('--viverse', 'set up viverse deployment (r3f only)')
    .option('--package-manager <manager>', 'specify package manager (e.g. npm, yarn, pnpm)')
    .option('--pnpm-manage-versions', 'enable manage-package-manager-versions in pnpm-workspace.yaml (default: true)')
    .option('--no-pnpm-manage-versions', 'disable manage-package-manager-versions in pnpm-workspace.yaml')
    .option('--node-version <version>', 'set Node.js version for engines.node field (default: "latest")')
    .option('-y, --yes', 'Skip prompts and use default values')
    .action(async (name: string | undefined, options: CliOptions) => {
      console.clear()
      p.intro(color.bgCyan(color.black(' krispya-create ')))

      let generateOptions: GenerateOptions

      if (Object.keys(options).length > 0) {
        const template: Template = options.template ?? 'vite'
        const defaultName = getDefaultProjectName(template)

        generateOptions = {
          name: name || defaultName,
          template,
          language: options.js ? 'javascript' : 'typescript',
          ...(template === 'r3f' && {
            drei: options.drei ? {} : undefined,
            handle: options.handle ? {} : undefined,
            leva: options.leva ? {} : undefined,
            postprocessing: options.postprocessing ? {} : undefined,
            rapier: options.rapier ? {} : undefined,
            xr: options.xr ? {} : undefined,
            uikit: options.uikit ? {} : undefined,
            offscreen: options.offscreen ? {} : undefined,
            zustand: options.zustand ? {} : undefined,
            koota: options.koota ? {} : undefined,
            viverse: options.viverse ? {} : undefined,
            triplex: options.triplex ? {} : undefined,
          }),
          packageManager: options.packageManager,
          pnpmManageVersions: options.pnpmManageVersions,
          nodeVersion: options.nodeVersion ?? 'latest',
        }
      } else {
        generateOptions = await promptForOptions(name)
      }

      const defaultFallbackName =
        generateOptions.template === 'vite'
          ? 'vite-app'
          : generateOptions.template === 'react'
          ? 'react-app'
          : 'react-three-app'
      generateOptions.name ??= defaultFallbackName

      // Fetch latest pnpm version if pnpm is selected
      const packageManager = generateOptions.packageManager || 'pnpm'
      if (packageManager === 'pnpm') {
        generateOptions.pnpmVersion = await getLatestPnpmVersion()
      }

      // Fetch latest Node version if "latest" is specified or default
      const nodeVersion = generateOptions.nodeVersion ?? 'latest'
      if (nodeVersion === 'latest') {
        generateOptions.nodeVersion = await getLatestNodeVersion()
      }

      const basePath = join(cwd(), generateOptions.name)
      const s = p.spinner()
      s.start('Creating project...')

      try {
        const files = generate(generateOptions)
        const filePaths = Object.keys(files).sort()

        for (const filePath of filePaths) {
          const fullFilePath = join(basePath, filePath)
          await mkdir(dirname(fullFilePath), { recursive: true })
          const file = files[filePath]!

          if (file.type === 'text') {
            await writeFile(fullFilePath, file.content)
          } else {
            const response = await fetch(file.url)
            await writeFile(fullFilePath, response.body!)
          }
        }

        s.stop('Project created!')

        const nextSteps = [`cd ${generateOptions.name}`, `${packageManager} install`, `${packageManager} run dev`].join(
          '\n',
        )

        p.note(nextSteps, 'Next steps')

        p.outro(color.green('Happy coding! ✨'))
      } catch (error) {
        s.stop('Failed to create project')
        p.log.error(String(error))
        process.exit(1)
      }
    })

  await program.parseAsync()
}

main().catch(console.error)
