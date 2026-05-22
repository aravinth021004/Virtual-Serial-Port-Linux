import { app, BrowserWindow, ipcMain } from 'electron'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// The built directory structure
//
// ├─┬─┬ dist
// │ │ └── index.html
// │ │
// │ ├─┬ dist-electron
// │ │ ├── main.js
// │ │ └── preload.mjs
// │
process.env.APP_ROOT = path.join(__dirname, '..')

// 🚧 Use ['ENV_NAME'] avoid vite:define plugin - Vite@2.x
export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, 'public') : RENDERER_DIST

let win: BrowserWindow | null

type PortConfig = {
  leftPath: string
  rightPath: string
  mode: string
  extraOptions: string
}

type PortStatus = {
  state: 'running' | 'stopped' | 'error'
  pid?: number
  message?: string
  logPath?: string
  details?: string
}

type AuthConfig = {
  useSudo: boolean
  password?: string
}

type HelperResult = {
  exitCode: number | null
  stdout: string
  stderr: string
}

const LOG_PATH = '/run/virtual-port-linux.log'

function resolveHelperPath() {
  const root = process.env.APP_ROOT ?? app.getAppPath()
  const candidates = app.isPackaged
    ? [
        path.join(process.resourcesPath, 'virtual-port-helper.sh'),
        path.join(process.resourcesPath, 'resources', 'virtual-port-helper.sh'),
      ]
    : [
        path.join(root, 'resources', 'virtual-port-helper.sh'),
        path.join(process.cwd(), 'resources', 'virtual-port-helper.sh'),
      ]

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate
    }
  }

  return candidates[0]
}

// function ensureExecutable(helperPath: string): string {
//   try {
//     fs.accessSync(helperPath, fs.constants.X_OK)
//     return helperPath
//   } catch {
//     const tempPath = path.join(os.tmpdir(), 'virtual-port-helper.sh')
//     try {
//       fs.copyFileSync(helperPath, tempPath)
//       fs.chmodSync(tempPath, 0o755)
//       return tempPath
//     } catch {
//       return helperPath
//     }
//   }
// }

function resolvePkexecPath() {
  const candidates = ['/usr/bin/pkexec', '/bin/pkexec']
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate
    }
  }

  const pathEntries = (process.env.PATH ?? '').split(path.delimiter)
  for (const entry of pathEntries) {
    const candidate = path.join(entry, 'pkexec')
    if (fs.existsSync(candidate)) {
      return candidate
    }
  }

  return null
}

function resolveSudoPath() {
  const candidates = ['/usr/bin/sudo', '/bin/sudo']
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate
    }
  }

  const pathEntries = (process.env.PATH ?? '').split(path.delimiter)
  for (const entry of pathEntries) {
    const candidate = path.join(entry, 'sudo')
    if (fs.existsSync(candidate)) {
      return candidate
    }
  }

  return null
}

function validateConfig(config: PortConfig): string | null {
  const deviceRegex = /^\/dev\/tty[A-Za-z0-9._-]+$/
  const modeRegex = /^[0-7]{3,4}$/
  const extraRegex = /^[A-Za-z0-9_=,.-]*$/

  if (!deviceRegex.test(config.leftPath)) {
    return 'Left port path must be a /dev/tty* device name.'
  }
  if (!deviceRegex.test(config.rightPath)) {
    return 'Right port path must be a /dev/tty* device name.'
  }
  if (!modeRegex.test(config.mode)) {
    return 'Mode must be a 3 or 4 digit octal value (e.g., 666 or 0666).'
  }
  if (config.extraOptions && !extraRegex.test(config.extraOptions)) {
    return 'Extra options can only contain letters, numbers, =, _, -, ., and commas.'
  }

  return null
}

function stageHelper(helperPath: string): { path: string; error?: string } {
  const isPackaged = app.isPackaged
  try {
    if (!isPackaged) {
      fs.accessSync(helperPath, fs.constants.X_OK)
      return { path: helperPath }
    }
  } catch {
    // Continue to staged copy for AppImage/noexec mounts.
  }

  const tempPath = path.join(os.tmpdir(), `virtual-port-helper-${process.pid}.sh`)
  try {
    fs.copyFileSync(helperPath, tempPath)
    fs.chmodSync(tempPath, 0o755)
    return { path: tempPath }
  } catch (error) {
    return { path: helperPath, error: error instanceof Error ? error.message : 'Unable to stage helper.' }
  }
}

function runHelper(args: string[], usePkexec = true): Promise<HelperResult> {
  return new Promise((resolve) => {
    const helperPath = resolveHelperPath()
    if (!fs.existsSync(helperPath)) {
      resolve({
        exitCode: 1,
        stdout: '',
        stderr: `Helper not found at ${helperPath}.`,
      })
      return
    }
    const staged = stageHelper(helperPath)
    if (staged.error) {
      resolve({ exitCode: 1, stdout: '', stderr: `Error staging helper: ${staged.error}` })
      return
    }
    const executableHelper = staged.path
    const isRoot = typeof process.getuid === 'function' && process.getuid() === 0
    const pkexecPath = usePkexec ? resolvePkexecPath() : null

    if (usePkexec && !pkexecPath && !isRoot) {
      resolve({
        exitCode: 1,
        stdout: '',
        stderr: 'pkexec is not available. Install policykit or run the app as root.',
      })
      return
    }

    const shouldUsePkexec = usePkexec && !isRoot
    const command = shouldUsePkexec ? pkexecPath ?? 'pkexec' : executableHelper
    const commandArgs = shouldUsePkexec ? [executableHelper, ...args] : args
    const proc = spawn(command, commandArgs, {
      env: {
        ...process.env,
      },
    })

    let stdout = ''
    let stderr = ''

    proc.stdout.on('data', (data) => {
      stdout += data.toString()
    })
    proc.stderr.on('data', (data) => {
      stderr += data.toString()
    })

    proc.on('error', (error) => {
      resolve({ exitCode: 1, stdout, stderr: `${stderr}${error.message}` })
    })

    proc.on('close', (exitCode) => {
      resolve({ exitCode, stdout, stderr })
    })
  })
}

function runHelperWithSudo(args: string[], password: string): Promise<HelperResult> {
  return new Promise((resolve) => {
    const helperPath = resolveHelperPath()
    if (!fs.existsSync(helperPath)) {
      resolve({
        exitCode: 1,
        stdout: '',
        stderr: `Helper not found at ${helperPath}.`,
      })
      return
    }
    const staged = stageHelper(helperPath)
    if (staged.error) {
      resolve({ exitCode: 1, stdout: '', stderr: `Error staging helper: ${staged.error}` })
      return
    }
    const sudoPath = resolveSudoPath()
    if (!sudoPath) {
      resolve({ exitCode: 1, stdout: '', stderr: 'sudo is not available on this system.' })
      return
    }

    const proc = spawn(sudoPath, ['-S', staged.path, ...args], {
      env: {
        ...process.env,
      },
    })

    let stdout = ''
    let stderr = ''

    proc.stdout.on('data', (data) => {
      stdout += data.toString()
    })
    proc.stderr.on('data', (data) => {
      stderr += data.toString()
    })

    proc.on('error', (error) => {
      resolve({ exitCode: 1, stdout, stderr: `${stderr}${error.message}` })
    })

    proc.on('close', (exitCode) => {
      resolve({ exitCode, stdout, stderr })
    })

    proc.stdin.write(`${password}\n`)
    proc.stdin.end()
  })
}

async function readStatus(): Promise<PortStatus> {
  const result = await runHelper(['status'], false)
  const output = result.stdout.trim()

  if (result.exitCode !== 0 && !output) {
    return {
      state: 'error',
      message: result.stderr.trim() || 'Failed to read status.',
      details: [result.stdout, result.stderr].filter(Boolean).join('\n').trim() || undefined,
    }
  }

  if (output.startsWith('running:')) {
    const pidValue = Number(output.replace('running:', '').trim())
    return {
      state: 'running',
      pid: Number.isFinite(pidValue) ? pidValue : undefined,
      logPath: LOG_PATH,
      details: [result.stdout, result.stderr].filter(Boolean).join('\n').trim() || undefined,
    }
  }

  if (output === 'stopped') {
    return {
      state: 'stopped',
      logPath: LOG_PATH,
      details: [result.stdout, result.stderr].filter(Boolean).join('\n').trim() || undefined,
    }
  }

  return {
    state: 'error',
    message: output || result.stderr.trim() || 'Unknown status.',
    logPath: LOG_PATH,
    details: [result.stdout, result.stderr].filter(Boolean).join('\n').trim() || undefined,
  }
}

function registerIpcHandlers() {
  ipcMain.handle('virtual-port:status', async () => readStatus())

  ipcMain.handle('virtual-port:start', async (_event, payload: { config: PortConfig; auth: AuthConfig }) => {
    const { config, auth } = payload
    const error = validateConfig(config)
    if (error) {
      return { state: 'error', message: error, logPath: LOG_PATH }
    }

    if (auth.useSudo && !auth.password) {
      return { state: 'error', message: 'Password is required for sudo.', logPath: LOG_PATH }
    }

    const extra = config.extraOptions ? `,${config.extraOptions}` : '-'
    const result = auth.useSudo
      ? await runHelperWithSudo(
          ['start', config.leftPath, config.rightPath, config.mode, extra],
          auth.password ?? '',
        )
      : await runHelper(['start', config.leftPath, config.rightPath, config.mode, extra])

    if (result.exitCode !== 0) {
      const combined = [result.stdout, result.stderr].filter(Boolean).join('\n').trim()
      const authFailed = combined.includes('AUTHENTICATION FAILED') || combined.includes('incorrect password')
      const message = authFailed
        ? 'Authentication failed. Please verify your password.'
        : result.stdout.trim() || result.stderr.trim() || 'Failed to start socat.'
      return {
        state: 'error',
        message,
        logPath: LOG_PATH,
        details: combined || undefined,
      }
    }

    return readStatus()
  })

  ipcMain.handle('virtual-port:stop', async (_event, auth: AuthConfig) => {
    if (auth.useSudo && !auth.password) {
      return { state: 'error', message: 'Password is required for sudo.', logPath: LOG_PATH }
    }

    const result = auth.useSudo
      ? await runHelperWithSudo(['stop'], auth.password ?? '')
      : await runHelper(['stop'])

    if (result.exitCode !== 0) {
      const combined = [result.stdout, result.stderr].filter(Boolean).join('\n').trim()
      const authFailed = combined.includes('AUTHENTICATION FAILED') || combined.includes('incorrect password')
      const message = authFailed
        ? 'Authentication failed. Please verify your password.'
        : result.stdout.trim() || result.stderr.trim() || 'Failed to stop socat.'
      return {
        state: 'error',
        message,
        logPath: LOG_PATH,
        details: combined || undefined,
      }
    }

    return readStatus()
  })
}

function createWindow() {
  win = new BrowserWindow({
    icon: path.join(process.env.VITE_PUBLIC, 'electron-vite.svg'),
    width: 980,
    height: 680,
    backgroundColor: '#f3efe6',
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
  } else {
    // win.loadFile('dist/index.html')
    win.loadFile(path.join(RENDERER_DIST, 'index.html'))
  }
}

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
    win = null
  }
})

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

app.whenReady().then(() => {
  registerIpcHandlers()
  createWindow()
})
