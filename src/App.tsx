import { useEffect, useMemo, useState } from 'react'
import './App.css'

type FormState = {
  leftPath: string
  rightPath: string
  mode: string
  extraOptions: string
}

const DEFAULT_FORM: FormState = {
  leftPath: '/dev/ttyV0',
  rightPath: '/dev/ttyV1',
  mode: '0666',
  extraOptions: '',
}

function App() {
  const [form, setForm] = useState<FormState>(DEFAULT_FORM)
  const [status, setStatus] = useState<VirtualPortStatus | null>(null)
  const [isBusy, setIsBusy] = useState(false)
  const [useSudo, setUseSudo] = useState(true)
  const [password, setPassword] = useState('')
  const [authAction, setAuthAction] = useState<'start' | 'stop' | null>(null)

  useEffect(() => {
    const saved = localStorage.getItem('virtual-port-config')
    if (saved) {
      try {
        setForm({ ...DEFAULT_FORM, ...JSON.parse(saved) })
      } catch {
        setForm(DEFAULT_FORM)
      }
    }
  }, [])

  useEffect(() => {
    localStorage.setItem('virtual-port-config', JSON.stringify(form))
  }, [form])

  useEffect(() => {
    void refreshStatus()
  }, [])

  const statusLabel = useMemo(() => {
    if (!status) return 'Unknown'
    if (status.state === 'running') return 'Running'
    if (status.state === 'stopped') return 'Stopped'
    return 'Error'
  }, [status])

  const authHint = useMemo(() => {
    const text = `${status?.message ?? ''}\n${status?.details ?? ''}`
    if (
      text.includes('No session for cookie') ||
      text.includes('pam_authenticate failed') ||
      text.includes('Not authorized')
    ) {
      return 'Polkit agent not available. In WSL, start a user dbus session and run a polkit agent before using Start.'
    }
    return ''
  }, [status])

  async function refreshStatus() {
    setIsBusy(true)
    try {
      const nextStatus = await window.virtualPort.status()
      setStatus(nextStatus)
    } finally {
      setIsBusy(false)
    }
  }

  async function runAction(action: 'start' | 'stop', authPassword: string) {
    setIsBusy(true)
    try {
      const auth = { useSudo, password: authPassword }
      const nextStatus =
        action === 'start'
          ? await window.virtualPort.start(form, auth)
          : await window.virtualPort.stop(auth)
      setStatus(nextStatus)
    } finally {
      setPassword('')
      setIsBusy(false)
    }
  }

  function requestAuth(action: 'start' | 'stop') {
    if (useSudo) {
      setAuthAction(action)
      return
    }
    void runAction(action, '')
  }

  function handleAuthConfirm() {
    if (!authAction) return
    void runAction(authAction, password)
    setAuthAction(null)
  }

  function handleAuthCancel() {
    setAuthAction(null)
    setPassword('')
  }

  return (
    <div className="app">
      <header className="app__header">
        <div>
          <p className="app__eyebrow">Virtual Serial Ports</p>
          <h1 className="app__title">Virtual Port Studio</h1>
          <p className="app__subtitle">
            Create, manage, and monitor a paired virtual serial port using socat.
          </p>
        </div>
        <div className={`status-pill status-pill--${status?.state ?? 'unknown'}`}>
          <span className="status-dot" />
          <span>{statusLabel}</span>
          {status?.pid ? <span className="status-meta">PID {status.pid}</span> : null}
        </div>
      </header>

      <main className="app__grid">
        <section className="card">
          <h2>Configuration</h2>
          <div className="form-grid">
            <label className="field">
              <span>Left Port</span>
              <input
                value={form.leftPath}
                onChange={(event) => setForm({ ...form, leftPath: event.target.value })}
                placeholder="/dev/ttyV0"
              />
            </label>
            <label className="field">
              <span>Right Port</span>
              <input
                value={form.rightPath}
                onChange={(event) => setForm({ ...form, rightPath: event.target.value })}
                placeholder="/dev/ttyV1"
              />
            </label>
            <label className="field">
              <span>Mode (octal)</span>
              <input
                value={form.mode}
                onChange={(event) => setForm({ ...form, mode: event.target.value })}
                placeholder="0666"
              />
            </label>
            <label className="field">
              <span>Extra socat options</span>
              <input
                value={form.extraOptions}
                onChange={(event) => setForm({ ...form, extraOptions: event.target.value })}
                placeholder="waitslave,unlink-close"
              />
            </label>
            <label className="field">
              <span>Use sudo (in-app password)</span>
              <div className="toggle-row">
                <input
                  type="checkbox"
                  checked={useSudo}
                  onChange={(event) => setUseSudo(event.target.checked)}
                />
                <span className="toggle-label">Required in WSL AppImage</span>
              </div>
            </label>
          </div>

          <div className="actions">
            <button className="btn btn--primary" onClick={() => requestAuth('start')} disabled={isBusy}>
              Start
            </button>
            <button className="btn btn--ghost" onClick={() => requestAuth('stop')} disabled={isBusy}>
              Stop
            </button>
            <button className="btn btn--ghost" onClick={() => void refreshStatus()} disabled={isBusy}>
              Refresh
            </button>
          </div>
        </section>

        <section className="card card--dark">
          <h2>Status</h2>
          <div className="status-grid">
            <div>
              <p className="status-label">State</p>
              <p className="status-value">{statusLabel}</p>
            </div>
            <div>
              <p className="status-label">PID</p>
              <p className="status-value">{status?.pid ?? '—'}</p>
            </div>
            <div>
              <p className="status-label">Log</p>
              <p className="status-value mono">{status?.logPath ?? '/run/virtual-port-linux.log'}</p>
            </div>
          </div>
          <div className="status-message">
            {status?.message ? status.message : 'Start to create the virtual port pair.'}
          </div>
          {authHint ? <div className="status-hint">{authHint}</div> : null}
          {status?.details ? (
            <div className="status-logs">
              <p className="status-label">Details</p>
              <pre>{status.details}</pre>
            </div>
          ) : null}
        </section>
      </main>

      {authAction ? (
        <div className="modal-backdrop">
          <div className="modal">
            <h3>Authentication Required</h3>
            <p>Enter your sudo password to {authAction} the virtual ports.</p>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && password) {
                  handleAuthConfirm()
                }
              }}
              placeholder="Sudo password"
              autoFocus
            />
            <div className="modal-actions">
              <button className="btn btn--ghost" onClick={handleAuthCancel}>
                Cancel
              </button>
              <button className="btn btn--primary" onClick={handleAuthConfirm} disabled={!password}>
                Continue
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export default App
