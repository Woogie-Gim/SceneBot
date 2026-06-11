/// <reference types="vite/client" />

interface Window {
  sceneBot: {
    startAutomation: (scenarioPath: string) => Promise<{ success: boolean; message: string }>
    stopAutomation: () => Promise<{ success: boolean; message: string }>
    openFileDialog: () => Promise<string | null>
    openImageFolder: () => Promise<{ success: boolean }>
    checkAdbConnection: () => Promise<{ success: boolean, message: string }>
  }
}