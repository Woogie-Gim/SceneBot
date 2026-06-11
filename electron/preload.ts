import { ipcRenderer, contextBridge } from 'electron'

contextBridge.exposeInMainWorld('ipcRenderer', {
  on(...args: Parameters<typeof ipcRenderer.on>) {
    const [channel, listener] = args
    return ipcRenderer.on(channel, (event, ...args) => listener(event, ...args))
  },
  off(...args: Parameters<typeof ipcRenderer.off>) {
    const [channel, ...omit] = args
    return ipcRenderer.off(channel, ...omit)
  },
  send(...args: Parameters<typeof ipcRenderer.send>) {
    const [channel, ...omit] = args
    return ipcRenderer.send(channel, ...omit)
  },
  invoke(...args: Parameters<typeof ipcRenderer.invoke>) {
    const [channel, ...omit] = args
    return ipcRenderer.invoke(channel, ...omit)
  }
})

// 새로운 sceneBot 브릿지를 독립적으로 등록
contextBridge.exposeInMainWorld('sceneBot', {
  startAutomation: (scenarioPath: string) => ipcRenderer.invoke('start-automation', scenarioPath),
  stopAutomation: () => ipcRenderer.invoke('stop-automation'),
  openFileDialog: () => ipcRenderer.invoke('open-file-dialog'),
  openImageFolder: () => ipcRenderer.invoke('open-image-folder'),
  checkAdbConnection: () => ipcRenderer.invoke('check-adb-connection')
})

contextBridge.exposeInMainWorld('electronAPI', {
  onAutomationLog: (callback: (event: any, message: string) => void) => 
    ipcRenderer.on('automation-log', (event, message) => callback(event, message))
})