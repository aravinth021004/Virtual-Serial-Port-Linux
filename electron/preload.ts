import { ipcRenderer, contextBridge } from 'electron'

contextBridge.exposeInMainWorld('virtualPort', {
  start(
    config: { id: string; leftPath: string; rightPath: string; mode: string; extraOptions: string },
    auth: { useSudo: boolean; password?: string },
  ) {
    return ipcRenderer.invoke('virtual-port:start', { config, auth })
  },
  stop(id: string, auth: { useSudo: boolean; password?: string }) {
    return ipcRenderer.invoke('virtual-port:stop', { id, auth })
  },
  status(id: string) {
    return ipcRenderer.invoke('virtual-port:status', id)
  },
  readLog(id: string) {
    return ipcRenderer.invoke('virtual-port:read-log', id)
  },
})
