import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron'
import { fileURLToPath } from 'node:url'
import { join } from 'path'
import { exec } from 'child_process'
import path from 'node:path'
import fs from 'fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

process.env.APP_ROOT = path.join(__dirname, '..')

export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, 'public') : RENDERER_DIST

let win: BrowserWindow | null

function createWindow() {
  win = new BrowserWindow({
    width: 900,
    height: 900,
    resizable: false, // UI 레이아웃 깨짐 방지를 위한 크기 조절 제한
    icon: path.join(process.env.VITE_PUBLIC, 'electron-vite.svg'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false
    },
  })

  win.setMenu(null)

  win.webContents.on('did-finish-load', () => {
    win?.webContents.send('main-process-message', (new Date).toLocaleString())
  })

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
  } else {
    win.loadFile(path.join(RENDERER_DIST, 'index.html'))
  }
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
    win = null
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

// 인프라 제어 및 예외 차단 보관용 전역 변수
let automationInterval: NodeJS.Timeout | null = null
let collectedReports: any[] = []
let failCounter = 0 // 💡 연속 매칭 실패 횟수를 실시간 추적하는 카운터 스택 변수

interface ScenarioStep {
  step: number
  desc: string
  image: string
  action: string
  post_delay: number
}

// 실시간 로그 송신 및 UI 바이패스 헬퍼
function sendLogToUI(message: string) {
  console.log(message)
  if (win && !win.webContents.isDestroyed()) {
    win.webContents.send('automation-log', message)
  }
}

// 코어 자동화 인터벌 엔진 강제 차단 및 리액트 락 해제 신호 하달 함수
function forceStopAutomation() {
  if (automationInterval) {
    clearInterval(automationInterval)
    automationInterval = null
  }
  failCounter = 0 // 셧다운 시 연속 실패 카운터 초기화 수립
  if (win && !win.webContents.isDestroyed()) {
    win.webContents.send('automation-stopped') // 리액트 UI 락 해제 신호 하달
  }
}

// 시나리오 자동화 가동 요청 핸들러
ipcMain.handle('start-automation', async (_event, scenarioPath: string) => {
  if (automationInterval) return { success: false, message: '이미 실행 중입니다.' }

  try {
    const scenarioData = fs.readFileSync(scenarioPath, 'utf8')
    const steps: ScenarioStep[] = JSON.parse(scenarioData)
    let currentStepIndex = 0
    collectedReports = []
    failCounter = 0

    const baseDir = path.dirname(scenarioPath)
    const appRootDir = app.isPackaged ? path.dirname(app.getPath('exe')) : app.getAppPath()
    const pythonScriptPath = join(appRootDir, 'match_finder.py')
    const reportOutputDir = join(appRootDir, 'reports')
    
    sendLogToUI('==== SceneBot 가동시작 ====')
    let isProcessing = false

    automationInterval = setInterval(async () => {
      if (isProcessing) return
      
      // 💡 [최종 고도화] 시나리오 완주 즉시 비동기 경합을 막기 위해 1초의 망설임도 없이 인터벌 루프부터 완전히 파괴
      if (currentStepIndex >= steps.length) {
        sendLogToUI('모든 시나리오 스텝이 완료되었습니다! 무인 루프를 종료하고 리포트 가공을 시작합니다.')
        
        if (automationInterval) {
          clearInterval(automationInterval)
          automationInterval = null
        }

        // 예외 처리: 데이터 누적이 전혀 없을 경우 리포트 생성 스킵 연동
        if (!collectedReports || collectedReports.length === 0) {
          sendLogToUI('[🚨 WARNING] 수집된 PASS 테스트 데이터가 존재하지 않아 리포트 마감을 취소합니다.')
          forceStopAutomation()
          return
        }

        if (!fs.existsSync(reportOutputDir)) {
          fs.mkdirSync(reportOutputDir, { recursive: true })
        }

        const tempJsonPath = join(app.getPath('userData'), 'temp_report.json')
        fs.writeFileSync(tempJsonPath, JSON.stringify(collectedReports), 'utf8')

        const userSitePackages = join(process.env.USERPROFILE || '', 'AppData', 'Roaming', 'Python', 'Python314', 'site-packages')
        const excelCmd = `set PYTHONPATH=${userSitePackages}&& set PYTHONIOENCODING=utf-8 && "${pythonScriptPath}.exe" "EXPORT" "${tempJsonPath}" "${reportOutputDir}"`
        
        isProcessing = true // 엑셀 작업 도중 타이머가 다시 침범하는 현상을 원천 방어
        
        exec(excelCmd, (excelError, excelStdout) => {
          if (excelError) {
            sendLogToUI(`[-] 최종 엑셀 리포트 생성 실패: ${excelError.message}`)
          } else {
            sendLogToUI(`[+] ${excelStdout.trim()}`)
          }
          sendLogToUI('[INFO] 시나리오 정상 완주 및 리포트 마감이 완료되어 SceneBot 가동을 안전하게 종료합니다.')
          isProcessing = false
          forceStopAutomation() // 최종 락 해제 및 프로세스 안착
        })
        return
      }

      const currentStep = steps[currentStepIndex]
      sendLogToUI(`[Step ${currentStep.step}] ${currentStep.desc} 검사 중...`)

      const screenshotPath = join(baseDir, 'current_screen.png')
      const templatePath = join(baseDir, 'images', currentStep.image)

      isProcessing = true

      exec(`adb shell screencap -p /sdcard/autobot_screen.png`, (capError) => {
        if (capError) {
          sendLogToUI(`[-] ADB 내장 캡처 실패: ${capError.message}`)
          isProcessing = false
          forceStopAutomation()
          return
        }

        exec(`adb pull /sdcard/autobot_screen.png "${screenshotPath}"`, {}, (pullError) => {
          if (pullError) {
            sendLogToUI(`[-] PC로 이미지 전송 실패: ${pullError.message}`)
            isProcessing = false
            forceStopAutomation()
            return
          }

          setTimeout(() => {
            const pythonCmd = `set PYTHONIOENCODING=utf-8 && "${pythonScriptPath}.exe" "MATCH" "${screenshotPath}" "${templatePath}" "${currentStep.step}" "${currentStep.desc}"`
            
            exec(pythonCmd, (pyError, stdout) => {
              if (pyError) {
                sendLogToUI(`[-] 파이썬 엔진 실행 실패: ${pyError.message}`)
                isProcessing = false
                forceStopAutomation()
                return
              }

              const cleanStdout = stdout.toString().trim()
              const result = cleanStdout.split(',')
              const status = result[0]

              if (status === 'SUCCESS') {
                const targetX = parseInt(result[1])
                const targetY = parseInt(result[2])
                const confidence = result[3]
                const duration = result[4]

                sendLogToUI(`[+] 매칭 성공! 일치율: ${parseFloat(confidence) * 100}%, 좌표: (${targetX}, ${targetY})`)
                failCounter = 0 // 💡 매칭 성공 시 연속 실패 스택 카운터를 즉시 청소(0)해 줍니다!

                collectedReports.push({
                  "번호 (Step)": currentStep.step,
                  "테스트 케이스 (Description)": currentStep.desc,
                  "결과 (Result)": "PASS",
                  "소요 시간 (Duration)": `${duration}s`,
                  "일치율 (Confidence)": `${parseInt((parseFloat(confidence) * 100).toString())}%`,
                  "터치 좌표": `(${targetX}, ${targetY})`,
                  "비고 (Note)": "정상 터치 완료"
                })

                setTimeout(() => {
                  const physicalTouchCmd = `adb shell input tap ${targetX} ${targetY}`

                  exec(physicalTouchCmd, {}, (touchError) => {
                    if (touchError) {
                      sendLogToUI(`[-] ADB 터치 명령 전송 실패: ${touchError.message}`)
                      isProcessing = false
                      forceStopAutomation()
                      return
                    }
                    sendLogToUI(`[+] 물리 터치 신호 전송 완료! -> (${targetX}, ${targetY})`)
                    
                    setTimeout(() => {
                      currentStepIndex++
                      isProcessing = false
                    }, currentStep.post_delay * 1000)
                  })
                }, 100)

              } else {
                const failReason = result[1] ? result[1] : '0'
                failCounter++ // 💡 매칭 실패 즉시 카운터 1 누적
                
                sendLogToUI(`[-] 매칭 실패: 화면에 버튼이 존재하지 않습니다. (최대 유사도: ${failReason}%, 연속 실패 누적: ${failCounter}/5)`)
                isProcessing = false
                
                // 💡 [요구사항 반영] 연속 실패 누적 카운터가 임계값인 5회에 도달하면 즉시 차단 루프 작동
                if (failCounter >= 5) {
                  sendLogToUI(`[🚨 CRITICAL] 연속 5회 이미지 탐색 실패를 감지했습니다. 단말기 상태 보호를 위해 자동 구동을 강제 정지합니다.`)
                  forceStopAutomation()
                }
              }
            })
          }, 200)
        })
      })
    }, 1000)

    return { success: true, message: 'SceneBot 가동 시작' }
  } catch (err: any) {
    return { success: false, message: `시나리오 파일 로드 실패: ${err.message}` }
  }
})

// USB 연결 단말기 목록 상태 진단 핸들러
ipcMain.handle('check-adb-connection', async () => {
  return new Promise((resolve) => {
    exec('adb devices', (error, stdout) => {
      if (error) {
        resolve({ success: false, message: 'ADB가 PC에 설치되어 있지 않거나 환경변수 오류입니다.' })
        return
      }
      
      const lines = stdout.trim().split('\n')
      
      if (lines.length > 1 && lines[1].trim() !== '') {
        const deviceName = lines[1].split('\t')[0]
        resolve({ success: true, message: `기기 연결 확인 완료 (ID: ${deviceName})` })
      } else {
        resolve({ success: false, message: '연결된 안드로이드 기기를 찾을 수 없습니다. USB 디버깅을 확인하세요.' })
      }
    })
  })
})

// 자동화 수동 중지 요청 처리
ipcMain.handle('stop-automation', () => {
  if (automationInterval) {
    forceStopAutomation()
    sendLogToUI('SceneBot 구동이 사용자에 의해 중지되었습니다.')
    return { success: true, message: 'SceneBot 중지 완료' }
  }
  return { success: false, message: '실행 중인 자동화가 없습니다.' }
})

app.whenReady().then(createWindow)

// 로컬 시나리오 수립용 OS 파일 오프너 핸들러
ipcMain.handle('open-file-dialog', async () => {
  if (!win) return null
  
  const result = await dialog.showOpenDialog(win, {
    properties: ['openFile'],
    filters: [{ name: 'JSON 시나리오 파일', extensions: ['json'] }]
  })

  if (!result.canceled && result.filePaths.length > 0) {
    return result.filePaths[0]
  }
  return null
})

// 매칭 대상 리소스 폴더 탐색기 즉시 오픈 핸들러
ipcMain.handle('open-image-folder', async () => {
  const appRootDir = app.isPackaged ? path.dirname(app.getPath('exe')) : app.getAppPath()
  const benchmarksPath = join(appRootDir, 'benchmarks')
  
  if (!fs.existsSync(benchmarksPath)) {
    fs.mkdirSync(benchmarksPath, { recursive: true })
  }
  
  await shell.openPath(benchmarksPath)
  return { success: true }
})