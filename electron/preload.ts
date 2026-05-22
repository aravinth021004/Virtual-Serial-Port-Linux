import { ipcRenderer, contextBridge } from 'electron'

contextBridge.exposeInMainWorld('virtualPort', {
  start(config: { leftPath: string; rightPath: string; mode: string; extraOptions: string }) {
    return ipcRenderer.invoke('virtual-port:start', config)
  },
  stop() {
    return ipcRenderer.invoke('virtual-port:stop')
  },
  status() {
    return ipcRenderer.invoke('virtual-port:status')
  },
})
