import { useEffect, useState } from 'react'
import './App.css'

function generateNextPair(existingPairs: VirtualPortConfig[]): VirtualPortConfig {
  let maxN = -1
  existingPairs.forEach((p) => {
    const lm = p.leftPath.match(/\/dev\/ttyV(\d+)/)
    const rm = p.rightPath.match(/\/dev\/ttyV(\d+)/)
    if (lm) maxN = Math.max(maxN, parseInt(lm[1], 10))
    if (rm) maxN = Math.max(maxN, parseInt(rm[1], 10))
  })
  const base = maxN >= 0 ? maxN + 1 : 0
  return {
    id: `pair-${Date.now()}`,
    leftPath: `/dev/ttyV${base}`,
    rightPath: `/dev/ttyV${base + 1}`,
    mode: '0666',
    extraOptions: '',
  }
}

function App() {
  const [pairs, setPairs] = useState<VirtualPortConfig[]>([])
  const [statuses, setStatuses] = useState<Record<string, VirtualPortStatus>>({})
  const [logs, setLogs] = useState<Record<string, string>>({})
  const [isBusy, setIsBusy] = useState(false)
  const [useSudo, setUseSudo] = useState(true)
  const [password, setPassword] = useState('')
  const [authAction, setAuthAction] = useState<{ action: 'start' | 'stop'; id: string } | null>(null)

  useEffect(() => {
    const saved = localStorage.getItem('virtual-port-pairs')
    if (saved) {
      try {
        const loaded = JSON.parse(saved)
        if (loaded && loaded.length > 0) {
          setPairs(loaded)
        } else {
          setPairs([generateNextPair([])])
        }
      } catch {
        setPairs([generateNextPair([])])
      }
    } else {
      setPairs([generateNextPair([])])
    }
  }, [])

  useEffect(() => {
    if (pairs.length > 0) {
      localStorage.setItem('virtual-port-pairs', JSON.stringify(pairs))
    }
  }, [pairs])

  useEffect(() => {
    void refreshStatusAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pairs.length])

  async function refreshStatusAll() {
    setIsBusy(true)
    try {
      const newStatuses: Record<string, VirtualPortStatus> = {}
      const newLogs: Record<string, string> = {}
      for (const p of pairs) {
        newStatuses[p.id] = await window.virtualPort.status(p.id)
        newLogs[p.id] = await window.virtualPort.readLog(p.id)
      }
      setStatuses(newStatuses)
      setLogs(newLogs)
    } finally {
      setIsBusy(false)
    }
  }

  async function runAction(action: 'start' | 'stop', authPassword: string, id: string) {
    setIsBusy(true)
    try {
      const auth = { useSudo, password: authPassword }
      let nextStatus: VirtualPortStatus
      if (action === 'start') {
        const config = pairs.find((p) => p.id === id)
        if (!config) return
        nextStatus = await window.virtualPort.start(config, auth)
      } else {
        nextStatus = await window.virtualPort.stop(id, auth)
      }
      setStatuses((prev) => ({ ...prev, [id]: nextStatus }))
      const newLog = await window.virtualPort.readLog(id)
      setLogs((prev) => ({ ...prev, [id]: newLog }))
    } finally {
      setPassword('')
      setIsBusy(false)
    }
  }

  function requestAuth(action: 'start' | 'stop', id: string) {
    if (useSudo) {
      setAuthAction({ action, id })
      return
    }
    void runAction(action, '', id)
  }

  function handleAuthConfirm() {
    if (!authAction) return
    void runAction(authAction.action, password, authAction.id)
    setAuthAction(null)
  }

  function handleAuthCancel() {
    setAuthAction(null)
    setPassword('')
  }

  function handleAddPair() {
    setPairs([...pairs, generateNextPair(pairs)])
  }

  function updatePair(id: string, updates: Partial<VirtualPortConfig>) {
    setPairs(pairs.map((p) => (p.id === id ? { ...p, ...updates } : p)))
  }

  function handleRemovePair(id: string) {
    void window.virtualPort.stop(id, { useSudo, password: '' }) // Attempt background stop if possible, but sudo might prevent it if not ran as root
    setPairs(pairs.filter((p) => p.id !== id))
    const newStatuses = { ...statuses }
    delete newStatuses[id]
    setStatuses(newStatuses)
    const newLogs = { ...logs }
    delete newLogs[id]
    setLogs(newLogs)
  }

  return (
    <div className="app">
      <header className="app__header">
        <div>
          <p className="app__eyebrow">Virtual Serial Ports</p>
          <h1 className="app__title">Virtual Port Studio</h1>
          <p className="app__subtitle">
            Create, manage, and monitor paired virtual serial ports using socat.
          </p>
        </div>
        <div className="header-actions">
          <label className="field toggle-row" style={{ marginTop: 0 }}>
            <span>Use sudo</span>
            <input
              type="checkbox"
              checked={useSudo}
              onChange={(event) => setUseSudo(event.target.checked)}
            />
          </label>
        </div>
      </header>

      <main className="app__grid" style={{ gridTemplateColumns: '1fr' }}>
        {pairs.map((p) => {
          const st = statuses[p.id]
          const isRunning = st?.state === 'running'
          const stateLabel = !st ? 'Unknown' : st.state === 'running' ? 'Running' : st.state === 'error' ? 'Error' : 'Stopped'

          return (
            <section className="card card--pair" key={p.id} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                  <div className={`status-pill status-pill--${st?.state ?? 'unknown'}`}>
                    <span className="status-dot" />
                    <span>{stateLabel}</span>
                    {st?.pid ? <span className="status-meta">PID {st.pid}</span> : null}
                  </div>
                  <h3 style={{ margin: 0 }}>{p.id}</h3>
                </div>
                <div className="actions" style={{ marginTop: 0 }}>
                  <button className="btn btn--primary" onClick={() => requestAuth('start', p.id)} disabled={isBusy || isRunning}>
                    Start
                  </button>
                  <button className="btn btn--ghost" onClick={() => requestAuth('stop', p.id)} disabled={isBusy || !isRunning}>
                    Stop
                  </button>
                  <button className="btn btn--ghost" onClick={() => handleRemovePair(p.id)} disabled={isBusy || isRunning}>
                    Delete
                  </button>
                </div>
              </div>

              <div className="form-grid">
                <label className="field">
                  <span>Left Port</span>
                  <input
                    value={p.leftPath}
                    onChange={(event) => updatePair(p.id, { leftPath: event.target.value })}
                    placeholder="/dev/ttyV0"
                    disabled={isRunning}
                  />
                </label>
                <label className="field">
                  <span>Right Port</span>
                  <input
                    value={p.rightPath}
                    onChange={(event) => updatePair(p.id, { rightPath: event.target.value })}
                    placeholder="/dev/ttyV1"
                    disabled={isRunning}
                  />
                </label>
                <label className="field">
                  <span>Mode (octal)</span>
                  <input
                    value={p.mode}
                    onChange={(event) => updatePair(p.id, { mode: event.target.value })}
                    placeholder="0666"
                    disabled={isRunning}
                  />
                </label>
                <label className="field">
                  <span>Extra socat options</span>
                  <input
                    value={p.extraOptions}
                    onChange={(event) => updatePair(p.id, { extraOptions: event.target.value })}
                    placeholder="waitslave,unlink-close"
                    disabled={isRunning}
                  />
                </label>
              </div>
              
              {st?.message && !isRunning && (
                <div className="status-message" style={{ marginTop: '0.5rem' }}>
                  {st.message}
                </div>
              )}
              {st?.details && !isRunning && (
                <div className="status-logs" style={{ marginTop: '0.5rem' }}>
                  <pre>{st.details}</pre>
                </div>
              )}

              {/* Show rolling terminal logs if running or if we have log data */}
              {(isRunning || logs[p.id]) && (
                <div className="status-logs" style={{ marginTop: '1rem', backgroundColor: '#1a1a1a', borderRadius: '4px', overflow: 'hidden' }}>
                   <div style={{ background: '#333', padding: '4px 8px', fontSize: '0.75rem', color: '#ccc', fontFamily: 'monospace' }}>
                     {st?.logPath || `/run/virtual-port-linux-${p.id}.log`}
                   </div>
                   <pre style={{ 
                     maxHeight: '150px', 
                     overflowY: 'auto', 
                     padding: '8px', 
                     margin: 0, 
                     color: '#f8f8f2' 
                   }}>
                     {logs[p.id] || 'Waiting for output...'}
                   </pre>
                </div>
              )}
            </section>
          )
        })}

        <div className="actions" style={{ justifyContent: 'center' }}>
          <button className="btn btn--primary" onClick={handleAddPair}>
            + Add New Pair
          </button>
          <button className="btn btn--ghost" onClick={refreshStatusAll}>
            ↻ Refresh All
          </button>
        </div>
      </main>

      {authAction ? (
        <div className="modal-backdrop">
          <div className="modal">
            <h3>Authentication Required</h3>
            <p>Enter your sudo password to {authAction.action} pair {authAction.id}.</p>
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
