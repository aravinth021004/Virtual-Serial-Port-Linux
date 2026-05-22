import { ipcRenderer, contextBridge } from 'electron'

contextBridge.exposeInMainWorld('virtualPort', {
  start(
    config: { leftPath: string; rightPath: string; mode: string; extraOptions: string },
    auth: { useSudo: boolean; password?: string },
  ) {
    return ipcRenderer.invoke('virtual-port:start', { config, auth })
  },
  stop(auth: { useSudo: boolean; password?: string }) {
    return ipcRenderer.invoke('virtual-port:stop', auth)
  },
  status() {
    return ipcRenderer.invoke('virtual-port:status')
  },
})
