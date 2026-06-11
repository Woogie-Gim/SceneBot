import { app as n, BrowserWindow as B, ipcMain as D, dialog as H, shell as J } from "electron";
import { fileURLToPath as M } from "node:url";
import { join as p } from "path";
import { exec as m } from "child_process";
import o from "node:path";
import h from "fs";
const j = o.dirname(M(import.meta.url));
process.env.APP_ROOT = o.join(j, "..");
const C = process.env.VITE_DEV_SERVER_URL, Z = o.join(process.env.APP_ROOT, "dist-electron"), k = o.join(process.env.APP_ROOT, "dist");
process.env.VITE_PUBLIC = C ? o.join(process.env.APP_ROOT, "public") : k;
let e;
function L() {
  e = new B({
    width: 900,
    height: 900,
    resizable: !1,
    // UI 레이아웃 깨짐 방지를 위한 크기 조절 제한
    icon: o.join(process.env.VITE_PUBLIC, "electron-vite.svg"),
    webPreferences: {
      preload: o.join(j, "preload.mjs"),
      contextIsolation: !0,
      nodeIntegration: !1
    }
  }), e.setMenu(null), e.webContents.on("did-finish-load", () => {
    e == null || e.webContents.send("main-process-message", (/* @__PURE__ */ new Date()).toLocaleString());
  }), C ? e.loadURL(C) : e.loadFile(o.join(k, "index.html"));
}
n.on("window-all-closed", () => {
  process.platform !== "darwin" && (n.quit(), e = null);
});
n.on("activate", () => {
  B.getAllWindows().length === 0 && L();
});
let r = null, R = [], g = 0;
function t(s) {
  console.log(s), e && !e.webContents.isDestroyed() && e.webContents.send("automation-log", s);
}
function l() {
  r && (clearInterval(r), r = null), g = 0, e && !e.webContents.isDestroyed() && e.webContents.send("automation-stopped");
}
D.handle("start-automation", async (s, i) => {
  if (r) return { success: !1, message: "이미 실행 중입니다." };
  try {
    const P = h.readFileSync(i, "utf8"), d = JSON.parse(P);
    let S = 0;
    R = [], g = 0;
    const b = o.dirname(i), A = n.isPackaged ? o.dirname(n.getPath("exe")) : n.getAppPath(), v = p(A, "match_finder.py"), T = p(A, "reports");
    t("==== SceneBot 가동시작 ====");
    let a = !1;
    return r = setInterval(async () => {
      if (a) return;
      if (S >= d.length) {
        if (t("모든 시나리오 스텝이 완료되었습니다! 무인 루프를 종료하고 리포트 가공을 시작합니다."), r && (clearInterval(r), r = null), !R || R.length === 0) {
          t("[🚨 WARNING] 수집된 PASS 테스트 데이터가 존재하지 않아 리포트 마감을 취소합니다."), l();
          return;
        }
        h.existsSync(T) || h.mkdirSync(T, { recursive: !0 });
        const $ = p(n.getPath("userData"), "temp_report.json");
        h.writeFileSync($, JSON.stringify(R), "utf8");
        const w = `set PYTHONPATH=${p(process.env.USERPROFILE || "", "AppData", "Roaming", "Python", "Python314", "site-packages")}&& set PYTHONIOENCODING=utf-8 && "${v}.exe" "EXPORT" "${$}" "${T}"`;
        a = !0, m(w, (I, y) => {
          t(I ? `[-] 최종 엑셀 리포트 생성 실패: ${I.message}` : `[+] ${y.trim()}`), t("[INFO] 시나리오 정상 완주 및 리포트 마감이 완료되어 SceneBot 가동을 안전하게 종료합니다."), a = !1, l();
        });
        return;
      }
      const c = d[S];
      t(`[Step ${c.step}] ${c.desc} 검사 중...`);
      const N = p(b, "current_screen.png"), U = p(b, "images", c.image);
      a = !0, m("adb shell screencap -p /sdcard/autobot_screen.png", ($) => {
        if ($) {
          t(`[-] ADB 내장 캡처 실패: ${$.message}`), a = !1, l();
          return;
        }
        m(`adb pull /sdcard/autobot_screen.png "${N}"`, {}, (_) => {
          if (_) {
            t(`[-] PC로 이미지 전송 실패: ${_.message}`), a = !1, l();
            return;
          }
          setTimeout(() => {
            const w = `set PYTHONIOENCODING=utf-8 && "${v}.exe" "MATCH" "${N}" "${U}" "${c.step}" "${c.desc}"`;
            m(w, (I, y) => {
              if (I) {
                t(`[-] 파이썬 엔진 실행 실패: ${I.message}`), a = !1, l();
                return;
              }
              const u = y.toString().trim().split(",");
              if (u[0] === "SUCCESS") {
                const f = parseInt(u[1]), O = parseInt(u[2]), E = u[3], F = u[4];
                t(`[+] 매칭 성공! 일치율: ${parseFloat(E) * 100}%, 좌표: (${f}, ${O})`), g = 0, R.push({
                  "번호 (Step)": c.step,
                  "테스트 케이스 (Description)": c.desc,
                  "결과 (Result)": "PASS",
                  "소요 시간 (Duration)": `${F}s`,
                  "일치율 (Confidence)": `${parseInt((parseFloat(E) * 100).toString())}%`,
                  "터치 좌표": `(${f}, ${O})`,
                  "비고 (Note)": "정상 터치 완료"
                }), setTimeout(() => {
                  const V = `adb shell input tap ${f} ${O}`;
                  m(V, {}, (x) => {
                    if (x) {
                      t(`[-] ADB 터치 명령 전송 실패: ${x.message}`), a = !1, l();
                      return;
                    }
                    t(`[+] 물리 터치 신호 전송 완료! -> (${f}, ${O})`), setTimeout(() => {
                      S++, a = !1;
                    }, c.post_delay * 1e3);
                  });
                }, 100);
              } else {
                const f = u[1] ? u[1] : "0";
                g++, t(`[-] 매칭 실패: 화면에 버튼이 존재하지 않습니다. (최대 유사도: ${f}%, 연속 실패 누적: ${g}/5)`), a = !1, g >= 5 && (t("[🚨 CRITICAL] 연속 5회 이미지 탐색 실패를 감지했습니다. 단말기 상태 보호를 위해 자동 구동을 강제 정지합니다."), l());
              }
            });
          }, 200);
        });
      });
    }, 1e3), { success: !0, message: "SceneBot 가동 시작" };
  } catch (P) {
    return { success: !1, message: `시나리오 파일 로드 실패: ${P.message}` };
  }
});
D.handle("check-adb-connection", async () => new Promise((s) => {
  m("adb devices", (i, P) => {
    if (i) {
      s({ success: !1, message: "ADB가 PC에 설치되어 있지 않거나 환경변수 오류입니다." });
      return;
    }
    const d = P.trim().split(`
`);
    if (d.length > 1 && d[1].trim() !== "") {
      const S = d[1].split("	")[0];
      s({ success: !0, message: `기기 연결 확인 완료 (ID: ${S})` });
    } else
      s({ success: !1, message: "연결된 안드로이드 기기를 찾을 수 없습니다. USB 디버깅을 확인하세요." });
  });
}));
D.handle("stop-automation", () => r ? (l(), t("SceneBot 구동이 사용자에 의해 중지되었습니다."), { success: !0, message: "SceneBot 중지 완료" }) : { success: !1, message: "실행 중인 자동화가 없습니다." });
n.whenReady().then(L);
D.handle("open-file-dialog", async () => {
  if (!e) return null;
  const s = await H.showOpenDialog(e, {
    properties: ["openFile"],
    filters: [{ name: "JSON 시나리오 파일", extensions: ["json"] }]
  });
  return !s.canceled && s.filePaths.length > 0 ? s.filePaths[0] : null;
});
D.handle("open-image-folder", async () => {
  const s = n.isPackaged ? o.dirname(n.getPath("exe")) : n.getAppPath(), i = p(s, "benchmarks");
  return h.existsSync(i) || h.mkdirSync(i, { recursive: !0 }), await J.openPath(i), { success: !0 };
});
export {
  Z as MAIN_DIST,
  k as RENDERER_DIST,
  C as VITE_DEV_SERVER_URL
};
