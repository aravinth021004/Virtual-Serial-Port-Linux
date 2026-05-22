import { app, BrowserWindow, ipcMain } from 'electron'
import { spawn } from 'node:child_process'
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
}

type HelperResult = {
  exitCode: number | null
  stdout: string
  stderr: string
}

const LOG_PATH = '/run/virtual-port-linux.log'

function getHelperPath() {
  const root = process.env.APP_ROOT ?? app.getAppPath()
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'resources', 'virtual-port-helper.sh')
  }
  return path.join(root, 'resources', 'virtual-port-helper.sh')
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

function runHelper(args: string[], usePkexec = true): Promise<HelperResult> {
  return new Promise((resolve) => {
    const helperPath = getHelperPath()
    const command = usePkexec ? 'pkexec' : helperPath
    const commandArgs = usePkexec ? [helperPath, ...args] : args
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

async function readStatus(): Promise<PortStatus> {
  const result = await runHelper(['status'], false)
  const output = result.stdout.trim()

  if (result.exitCode !== 0 && !output) {
    return { state: 'error', message: result.stderr.trim() || 'Failed to read status.' }
  }

  if (output.startsWith('running:')) {
    const pidValue = Number(output.replace('running:', '').trim())
    return { state: 'running', pid: Number.isFinite(pidValue) ? pidValue : undefined, logPath: LOG_PATH }
  }

  if (output === 'stopped') {
    return { state: 'stopped', logPath: LOG_PATH }
  }

  return { state: 'error', message: output || result.stderr.trim() || 'Unknown status.', logPath: LOG_PATH }
}

function registerIpcHandlers() {
  ipcMain.handle('virtual-port:status', async () => readStatus())

  ipcMain.handle('virtual-port:start', async (_event, config: PortConfig) => {
    const error = validateConfig(config)
    if (error) {
      return { state: 'error', message: error, logPath: LOG_PATH }
    }

    const extra = config.extraOptions ? `,${config.extraOptions}` : '-'
    const result = await runHelper(['start', config.leftPath, config.rightPath, config.mode, extra])

    if (result.exitCode !== 0) {
      return {
        state: 'error',
        message: result.stdout.trim() || result.stderr.trim() || 'Failed to start socat.',
        logPath: LOG_PATH,
      }
    }

    return readStatus()
  })

  ipcMain.handle('virtual-port:stop', async () => {
    const result = await runHelper(['stop'])

    if (result.exitCode !== 0) {
      return {
        state: 'error',
        message: result.stdout.trim() || result.stderr.trim() || 'Failed to stop socat.',
        logPath: LOG_PATH,
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
