#!/usr/bin/env node
import { cwd } from 'process'
import { generate, GenerateOptions, generateRandomName, getLatestPnpmVersion, Template } from './index.js'
import { dirname, join } from 'path'
import { mkdir, writeFile } from 'fs/promises'
import { Command } from 'commander'
import prompts, { PromptObject } from 'prompts'
import chalk from 'chalk'
import ora from 'ora'
import { fetch } from 'undici'

async function loadOptionsFromUrl(url: string): Promise<GenerateOptions> {
  const spinner = ora('Loading template from URL...').start()
  try {
    const response = await fetch(url)
    const options = await response.json()
    spinner.succeed('Create options loaded successfully')
    return options as any
  } catch (error) {
    spinner.fail('Failed to load template')
    throw error
  }
}

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

function displayDefaults(options: GenerateOptions): void {
  const dim = chalk.dim
  const packageManagerInfo =
    options.packageManager === 'pnpm' && options.pnpmManageVersions
      ? `${options.packageManager} (version managed)`
      : options.packageManager

  console.log(dim(`  Template: ${getTemplateLabel(options.template!)}`))
  console.log(dim(`  Language: ${options.language}`))
  console.log(dim(`  Package manager: ${packageManagerInfo}`))
  if (options.template === 'r3f') {
    console.log(dim(`  R3F integrations: all enabled`))
  }
}

async function promptForCustomization(template: Template, defaultName: string): Promise<GenerateOptions> {
  let cancelled = false

  const nameAnswer = await prompts(
    {
      type: 'text',
      name: 'name',
      message: 'Project name',
      initial: defaultName,
      validate: (name: string) => (name.length > 0 ? true : 'Project name is required'),
    },
    {
      onCancel: () => {
        cancelled = true
        return false
      },
    },
  )

  if (cancelled) return Promise.reject('Input cancelled')

  const questions: PromptObject[] = [
    {
      type: 'autocomplete',
      name: 'packageManager',
      message: 'Package manager',
      choices: [
        { title: 'pnpm', value: 'pnpm' },
        { title: 'npm', value: 'npm' },
        { title: 'yarn', value: 'yarn' },
        { title: 'Other (custom)', value: 'custom' },
      ],
      initial: 0,
    },
    {
      type: (prev) => (prev === 'custom' ? 'text' : null),
      name: 'customPackageManager',
      message: 'Enter package manager command',
      validate: (value: string) => (value.length > 0 ? true : 'Required'),
    },
    {
      type: (prev, values) => (values.packageManager === 'pnpm' ? 'confirm' : null),
      name: 'pnpmManageVersions',
      message: 'Enable manage-package-manager-versions?',
      initial: true,
    },
    {
      type: 'select',
      name: 'language',
      message: 'Language',
      choices: [
        { title: 'TypeScript', value: 'typescript' },
        { title: 'JavaScript', value: 'javascript' },
      ],
      initial: 0,
    },
  ]

  if (template === 'r3f') {
    questions.push({
      type: 'multiselect',
      name: 'integrations',
      message: 'R3F integrations',
      choices: [
        { title: 'Drei', value: 'drei', selected: true },
        { title: 'Handle', value: 'handle', selected: true },
        { title: 'Leva', value: 'leva', selected: true },
        { title: 'Postprocessing', value: 'postprocessing', selected: true },
        { title: 'Rapier', value: 'rapier', selected: true },
        { title: 'XR', value: 'xr', selected: true },
        { title: 'UIKit', value: 'uikit', selected: true },
        { title: 'Offscreen', value: 'offscreen', selected: true },
        { title: 'Zustand', value: 'zustand', selected: true },
        { title: 'Koota', value: 'koota', selected: true },
        { title: 'Triplex', value: 'triplex', selected: true },
        { title: 'Viverse', value: 'viverse', selected: true },
      ],
    })
  }

  const answers = await prompts(questions, {
    onCancel: () => {
      cancelled = true
      return false
    },
  })

  if (cancelled) return Promise.reject('Input cancelled')

  return {
    name: nameAnswer.name,
    template,
    language: answers.language,
    packageManager: answers.packageManager === 'custom' ? answers.customPackageManager : answers.packageManager,
    pnpmManageVersions: answers.pnpmManageVersions,
    ...(template === 'r3f' && {
      drei: answers.integrations?.includes('drei') ? {} : undefined,
      handle: answers.integrations?.includes('handle') ? {} : undefined,
      leva: answers.integrations?.includes('leva') ? {} : undefined,
      postprocessing: answers.integrations?.includes('postprocessing') ? {} : undefined,
      rapier: answers.integrations?.includes('rapier') ? {} : undefined,
      xr: answers.integrations?.includes('xr') ? {} : undefined,
      uikit: answers.integrations?.includes('uikit') ? {} : undefined,
      offscreen: answers.integrations?.includes('offscreen') ? {} : undefined,
      zustand: answers.integrations?.includes('zustand') ? {} : undefined,
      koota: answers.integrations?.includes('koota') ? {} : undefined,
      triplex: answers.integrations?.includes('triplex') ? {} : undefined,
      viverse: answers.integrations?.includes('viverse') ? {} : undefined,
    }),
  }
}

async function promptForOptions(name: string | undefined): Promise<GenerateOptions> {
  let cancelled = false

  // Step 1: Select template
  const templateAnswer = await prompts(
    {
      type: 'select',
      name: 'template',
      message: 'Select a template',
      choices: [
        { title: 'Vite (vanilla)', value: 'vite' },
        { title: 'React', value: 'react' },
        { title: 'React Three Fiber', value: 'r3f' },
      ],
      initial: 0,
    },
    {
      onCancel: () => {
        cancelled = true
        return false
      },
    },
  )

  if (cancelled) return Promise.reject('Input cancelled')

  const template: Template = templateAnswer.template
  const defaultName = name ?? getDefaultProjectName(template)
  const defaultOptions = getDefaultOptions(template, defaultName)

  // Step 2: Show defaults and ask confirm/customize
  console.log(chalk.dim('\nDefault configuration:'))
  displayDefaults(defaultOptions)
  console.log()

  const confirmAnswer = await prompts(
    {
      type: 'select',
      name: 'action',
      message: 'Proceed?',
      choices: [
        { title: 'Confirm', value: 'confirm' },
        { title: 'Customize', value: 'customize' },
      ],
      initial: 0,
    },
    {
      onCancel: () => {
        cancelled = true
        return false
      },
    },
  )

  if (cancelled) return Promise.reject('Input cancelled')

  if (confirmAnswer.action === 'confirm') {
    return defaultOptions
  }

  // Step 3: Customize
  return promptForCustomization(template, defaultName)
}

interface CliOptions {
  url?: string
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
  'pnpm-manage-versions'?: boolean
  triplex?: boolean
  viverse?: boolean
  'package-manager'?: string
  yes?: boolean
}

async function main() {
  const program = new Command()
    .name('krispya-create')
    .description('CLI for creating Vite, React, and React Three Fiber projects')
    .argument('[name]', 'name for the app')
    .option('--url <url>', 'URL to load the create options from')
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
    .option('-y, --yes', 'Skip prompts and use default values')
    .action(async (name: string | undefined, options: CliOptions) => {
      let generateOptions: GenerateOptions

      if (options.url) {
        generateOptions = await loadOptionsFromUrl(options.url)
        generateOptions.name ??= name || `react-three-${generateRandomName()}`
      } else if (Object.keys(options).length > 0) {
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
          packageManager: options['package-manager'],
          pnpmManageVersions: options['pnpm-manage-versions'],
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
        const versionSpinner = ora('Fetching latest pnpm version...').start()
        generateOptions.pnpmVersion = await getLatestPnpmVersion()
        versionSpinner.succeed(`Using pnpm@${generateOptions.pnpmVersion}`)
      }

      const basePath = join(cwd(), generateOptions.name)
      const spinner = ora('Generating project structure...').start()

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

        spinner.succeed('Project created successfully!')

        console.log(chalk.green('\nNext steps:'))
        console.log(chalk.cyan(`  cd ${generateOptions.name}`))
        console.log(chalk.cyan(`  ${packageManager} install`))
        console.log(chalk.cyan(`  ${packageManager} run dev\n`))
      } catch (error) {
        spinner.fail('Failed to create project')
        console.error(error)
        process.exit(1)
      }
    })

  await program.parseAsync()
}

main().catch(console.error)
