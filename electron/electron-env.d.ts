/// <reference types="vite-plugin-electron/electron-env" />

declare namespace NodeJS {
  interface ProcessEnv {
    APP_ROOT: string
    VITE_PUBLIC: string
  }
}

declare global {
  interface Window {
    sceneBot: {
      startAutomation: (scenarioPath: string) => Promise<{ success: boolean; message: string }>
      stopAutomation: () => Promise<{ success: boolean; message: string }>
      openFileDialog: () => Promise<string | null>
      openImageFolder: () => Promise<{ success: boolean }>
      checkAdbConnection: () => Promise<{ success: boolean, message: string }>
    }
    ipcRenderer: import('electron').IpcRenderer
  }
}

// Used in Renderer process, expose in `preload.ts`
interface Window {
  ipcRenderer: import('electron').IpcRenderer
}
