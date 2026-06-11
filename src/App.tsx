import { useState, useEffect, useRef } from 'react'

// TypeScript 컴파일러 빌드 방어용 글로벌 윈도우 인터페이스 명확한 동기화
interface Window {
  sceneBot: {
    checkAdbConnection: () => Promise<{ success: boolean; message: string }>
    openFileDialog: () => Promise<string | null>
    openImageFolder: () => Promise<{ success: boolean }>
    startAutomation: (path: string) => Promise<{ success: boolean; message: string }>
    stopAutomation: () => Promise<{ success: boolean; message: string }>
  }
}
declare const window: Window

export default function App() {
  const [deviceStatus, setDeviceStatus] = useState<string>('⏳ 기기 연결 확인 중...')
  const [isDeviceConnected, setIsDeviceConnected] = useState<boolean>(false)
  const [scenarioPath, setScenarioPath] = useState<string>('')
  const [logs, setLogs] = useState<string[]>([])
  const [isRunning, setIsRunning] = useState<boolean>(false)
  const [showHelp, setShowHelp] = useState<boolean>(false)

  // 오토 스크롤 추적용 돔 참조 변수
  const consoleEndRef = useRef<HTMLDivElement>(null)

  // 기기 연결 체크 핸들러
  const handleCheckConnection = async () => {
    setDeviceStatus('⏳ 연결 상태 재점검 중...')
    const result = await window.sceneBot.checkAdbConnection()
    setDeviceStatus(result.message)
    setIsDeviceConnected(result.success)
    setLogs((prev) => [...prev, result.success ? `[+] ${result.message}` : `[-] 연결 실패: ${result.message}`])
  }

  // 컴포넌트 마운트 시 초기화 및 백엔드 실시간 로그 리스너 바인딩
  useEffect(() => {
    setLogs(['🤖 SceneBot 가동 준비 완료. 시나리오 JSON 파일을 로드해 주세요.'])
    handleCheckConnection()

    const electronAPI = (window as any).electronAPI
    
    // 리스너가 중복 바인딩되지 않도록 핸들러 분리 정의
    const handleIncomingLog = (_event: any, message: string) => {
      setLogs((prev) => [...prev, message])
    }

    if (electronAPI && electronAPI.onAutomationLog) {
      electronAPI.onAutomationLog(handleIncomingLog)
    }

    // 클린업 함수: 컴포넌트가 언마운트되거나 재구동될 때 기존 리스너를 완전히 청소
    return () => {
      const ipcRenderer = (window as any).ipcRenderer
      if (ipcRenderer && ipcRenderer.off) {
        ipcRenderer.off('automation-log', handleIncomingLog)
      }
    }
  }, [])

  // 무인 모니터링 로그 누적 시 스크롤 최하단 자동 트래킹
  useEffect(() => {
    consoleEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs])

  // OS 파일 탐색기 호출 및 시나리오 절대 경로 획득
  const handleLoadScenario = async () => {
    const path = await window.sceneBot.openFileDialog()
    if (path) {
      setScenarioPath(path)
      setLogs((prev) => [...prev, `[+] 시나리오 로드 성공: ${path}`])
    }
  }

  // 자동화 엔진 구동 요청 핸들러
  const handleStart = async () => {
    if (!scenarioPath) {
      alert('시나리오 파일을 먼저 로드해 주세요!')
      return
    }
    setIsRunning(true)
    setLogs((prev) => [...prev, '▶️ SceneBot 코어 엔진 가동 신호 하달...'])
    
    const result = await window.sceneBot.startAutomation(scenarioPath)
    if (result.success) {
      setLogs((prev) => [...prev, `[INFO] ${result.message}`])
    } else {
      setLogs((prev) => [...prev, `[-] 에러 발생: ${result.message}`])
      setIsRunning(false)
    }
  }

  // 자동화 엔진 루프 중지 핸들러
  const handleStop = async () => {
    const result = await window.sceneBot.stopAutomation()
    setIsRunning(false)
    setLogs((prev) => [...prev, `⏹️ ${result.message}`])
  }

  // 리소스 이미지 보관 폴더 탐색기 오픈 핸들러
  const handleOpenFolder = async () => {
    await window.sceneBot.openImageFolder()
    setLogs((prev) => [...prev, '[+] 이미지 리소스(benchmarks) 폴더를 탐색기로 열었습니다.'])
  }

  // JSON 표준 스키마 템플릿 콘솔 인쇄 핸들러
  const handleShowJsonExample = () => {
    const exampleJson = [
      "★ [시나리오 JSON 작성 예시 양식] ★",
      "[",
      "  {",
      '    "step": 1,',
      '    "desc": "게스트 로그인 버튼 터치",',
      '    "image": "btn_guest_login.png",',
      '    "action": "CLICK",',
      '    "post_delay": 2.0',
      "  },",
      "  {",
      '    "step": 2,',
      '    "desc": "공지 팝업 닫기",',
      '    "image": "btn_close_popup.png",',
      '    "action": "CLICK",',
      '    "post_delay": 1.0',
      "  }",
      "]"
    ]
    setLogs((prev) => [...prev, ...exampleJson])
  }

  return (
    <div style={{ padding: '25px', fontFamily: 'sans-serif', backgroundColor: '#1e1e1e', color: '#fff', minHeight: '100vh', boxSizing: 'border-box' }}>
      {/* 타이틀 헤더 바 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #333', paddingBottom: '15px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
          <h2 style={{ margin: 0, color: '#4fc3f7', display: 'flex', alignItems: 'center', gap: '10px' }}>🤖 SceneBot Dashboard</h2>
          <div 
            onClick={handleCheckConnection}
            style={{ fontSize: '12px', color: isDeviceConnected ? '#66bb6a' : '#ef5350', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px', textDecoration: 'underline' }}
          >
            {deviceStatus} (클릭 시 재검색)
          </div>
        </div>
        
        {/* 도움말 및 예시 보기 버튼 세트 */}
        <div style={{ display: 'flex', gap: '10px' }}>
          {showHelp && (
            <button 
              onClick={handleShowJsonExample} 
              style={{ backgroundColor: '#2d2d2d', color: '#ffd54f', border: '1px solid #ffd54f', padding: '6px 14px', cursor: 'pointer', borderRadius: '4px', fontWeight: 'bold' }}
            >
              📝 JSON 예시 보기
            </button>
          )}
          <button 
            onClick={() => setShowHelp(!showHelp)} 
            style={{ backgroundColor: '#333', color: '#4fc3f7', border: '1px solid #4fc3f7', padding: '6px 14px', cursor: 'pointer', borderRadius: '4px', fontWeight: 'bold' }}
          >
            {showHelp ? '도움말 닫기 ✖' : '❓ 도움말 보기'}
          </button>
        </div>
      </div>

      {/* 도움말 섹션 */}
      {showHelp && (
        <div style={{ backgroundColor: '#2d2d2d', border: '1px solid #4fc3f7', padding: '15px', marginTop: '15px', borderRadius: '6px', fontSize: '14px', lineHeight: '1.6' }}>
          <strong style={{ color: '#4fc3f7' }}>💡 SceneBot 사용 방법 가이드</strong>
          <ol style={{ margin: '8px 0 0 20px', padding: 0 }}>
            <li>안드로이드 스마트폰의 <span style={{ color: '#ffb74d' }}>USB 디버깅</span>을 활성화하고 PC와 연결합니다.</li>
            <li>기준이 될 버튼 이미지를 캡처하여 <code>benchmarks/images/</code> 폴더에 저장합니다.</li>
            <li><code>scenario.json</code>에 이미지 이름과 실행할 스텝 정보, 대기 시간들을 정의합니다.</li>
            <li>위 버튼을 통해 JSON 파일을 로드한 후 <strong>[SceneBot 가동]</strong>을 누르면 무인 자동화가 시작됩니다.</li>
          </ol>
        </div>
      )}

      {/* 파일 및 폴더 바인딩 컨트롤러 섹션 */}
      <div style={{ marginTop: '25px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {/* 1층: JSON 불러오기 */}
        <div style={{ display: 'flex', gap: '12px' }}>
          <button onClick={handleLoadScenario} style={{ backgroundColor: '#0288d1', color: '#fff', border: 'none', padding: '12px 20px', cursor: 'pointer', borderRadius: '4px', fontWeight: 'bold', fontSize: '13px', width: '210px' }}>
            📂 시나리오 JSON 불러오기
          </button>
          <div style={{ display: 'flex', alignItems: 'center', backgroundColor: '#2d2d2d', padding: '0 15px', borderRadius: '4px', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '13px', color: '#aaa', border: '1px solid #333' }}>
            {scenarioPath ? scenarioPath : '로드된 파일이 없습니다. 왼쪽 버튼을 눌러 JSON 파일을 선택하세요.'}
          </div>
        </div>

        {/* 2층: 이미지 폴더 열기 */}
        <div style={{ display: 'flex', gap: '12px' }}>
          <button onClick={handleOpenFolder} style={{ backgroundColor: '#ffb74d', color: '#111', border: 'none', padding: '12px 20px', cursor: 'pointer', borderRadius: '4px', fontWeight: 'bold', fontSize: '14px', width: '210px' }}>
            📸 이미지 소스 폴더 열기
          </button>
          <div style={{ display: 'flex', alignItems: 'center', backgroundColor: '#2d2d2d', padding: '0 15px', borderRadius: '4px', flex: 1, fontSize: '13px', color: '#888', border: '1px solid #333' }}>
            캡처한 폰 화면 이미지(.png)들을 넣고 관리하는 기준 저장소 폴더를 즉시 엽니다.
          </div>
        </div>
      </div>

      {/* 메인 동작 제어 트리거 */}
      <div style={{ marginTop: '20px', display: 'flex', gap: '15px' }}>
        <button 
          onClick={handleStart} 
          disabled={isRunning}
          style={{ flex: 1, backgroundColor: isRunning ? '#2d3748' : '#2e7d32', color: isRunning ? '#718096' : '#fff', border: 'none', padding: '16px', cursor: isRunning ? 'default' : 'pointer', borderRadius: '6px', fontWeight: 'bold', fontSize: '16px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}
        >
          {isRunning ? '🔄 봇 자동 구동 중...' : '▶️ SceneBot 가동'}
        </button>
        <button 
          onClick={handleStop} 
          disabled={!isRunning}
          style={{ flex: 1, backgroundColor: !isRunning ? '#2d3748' : '#c62828', color: !isRunning ? '#718096' : '#fff', border: 'none', padding: '16px', cursor: !isRunning ? 'default' : 'pointer', borderRadius: '6px', fontWeight: 'bold', fontSize: '16px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}
        >
          ⏹️ 구동 중지
        </button>
      </div>

      {/* 실시간 무인 모니터링 로그 콘솔 */}
      <div style={{ marginTop: '25px' }}>
        <div style={{ fontSize: '14px', marginBottom: '8px', color: '#aaa', fontWeight: 'bold' }}>🖥️ 실시간 무인 모니터링 콘솔 (Live Logs)</div>
        <div style={{ backgroundColor: '#000', fontFamily: 'monospace', padding: '18px', borderRadius: '6px', height: '280px', overflowY: 'auto', fontSize: '13px', lineHeight: '1.6', border: '1px solid #333', boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.5)' }}>
          {logs.map((log, index) => {
            let currentLogColor = '#fff'
            if (log.startsWith('[-]')) currentLogColor = '#ef5350'        // 에러 상태 (연한 빨강)
            else if (log.startsWith('[+]')) currentLogColor = '#66bb6a'   // 성공 상태 (연한 초록)
            else if (log.startsWith('[Step')) currentLogColor = '#29b6f6' // 스텝 상태 (시원한 파랑)
            else if (log.startsWith('★')) currentLogColor = '#ffd54f'      // 강조 상태 (샛노랑)

            return (
              <div key={index} style={{ color: currentLogColor }}>
                {log}
              </div>
            )
          })}
          {/* 스크롤 자동 트래킹을 고정하기 위한 앵커 포인트 돔 엘리먼트 */}
          <div ref={consoleEndRef} />
        </div>
      </div>
    </div>
  )
}