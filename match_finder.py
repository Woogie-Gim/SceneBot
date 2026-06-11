import cv2
import numpy as np
import sys
import os
import time
import json
import pandas as pd

CACHE_FILE = "scale_cache.json"

def load_scale_cache(template_path):
    # 캐시 파일이 있으면 로드, 없으면 빈 딕셔너리 반환
    if os.path.exists(CACHE_FILE):
        with open(CACHE_FILE, 'r', encoding='utf-8') as f:
            return json.load(f).get(template_path, None)
    return None

def save_scale_cache(template_path, scale):
    # 최적의 스케일 값을 로컬 파일 캐시에 저장
    cache_data = {}
    if os.path.exists(CACHE_FILE):
        with open(CACHE_FILE, 'r', encoding='utf-8') as f:
            cache_data = json.load(f)
    cache_data[template_path] = scale
    with open(CACHE_FILE, 'w', encoding='utf-8') as f:
        json.dump(cache_data, f, indent=4)

def find_match_with_cache(screenshot_path, template_path):
    start_time = time.time()
    
    img_scene = cv2.imread(screenshot_path, cv2.IMREAD_GRAYSCALE)
    img_template = cv2.imread(template_path, cv2.IMREAD_GRAYSCALE)

    if img_scene is None or img_template is None:
        print("FAIL,0")
        return False

    # 화면/템플릿 크기 진단용 (stdout 결과값과 안 섞이도록 stderr로 분리 출력)
    scene_h, scene_w = img_scene.shape
    template_h, template_w = img_template.shape
    print(f"DEBUG scene={scene_w}x{scene_h} template={template_w}x{template_h}", file=sys.stderr)

    # 캐시된 스케일이 있는지 먼저 확인 (1:1 고속 매칭 시도)
    cached_scale = load_scale_cache(template_path)
    fast_match_success = False
    threshold = 0.82 # 합격 임계값 표준 마진

    if cached_scale is not None:
        # 캐시된 비율로만 즉시 리사이징 후 단 1회만 초고속 검사
        resized_w = int(img_template.shape[1] * cached_scale)
        resized_h = int(img_template.shape[0] * cached_scale)
        
        if resized_w <= scene_w and resized_h <= scene_h:
            resized_template = cv2.resize(img_template, (resized_w, resized_h), interpolation=cv2.INTER_AREA)
            result = cv2.matchTemplate(img_scene, resized_template, cv2.TM_CCOEFF_NORMED)
            _, max_val, _, max_loc = cv2.minMaxLoc(result)
            
            # 캐시 결과가 임계값 이상이면 다중 스케일 전수조사 생략
            if max_val >= threshold:
                fast_match_success = True
                best_max_val = max_val
                best_max_loc = max_loc
                best_scale = cached_scale

    # 캐시가 없거나, 캐시 점수가 기준 미만(화면 변화)일 때만 전수 스캔 발동
    if not fast_match_success:
        best_max_val = -1
        best_max_loc = None
        best_scale = 1.0

        # 💡 [치트키 방어벽] 만약 버튼과 전체화면 크기가 완전히 같다면 전수조사 생략 후 1:1 매칭
        if img_template.shape == img_scene.shape:
            result = cv2.matchTemplate(img_scene, img_template, cv2.TM_CCOEFF_NORMED)
            _, max_val, _, max_loc = cv2.minMaxLoc(result)
            best_max_val = max_val
            best_max_loc = max_loc
            best_scale = 1.0
        else:
            # 기존 해상도 비율 다중 스케일 탐색 루프 (크기가 다를 때만 안전하게 작동)
            for scale in np.linspace(0.7, 1.3, 7):
                resized_w = int(img_template.shape[1] * scale)
                resized_h = int(img_template.shape[0] * scale)

                if resized_w > scene_w or resized_h > scene_h:
                    continue

                resized_template = cv2.resize(img_template, (resized_w, resized_h), interpolation=cv2.INTER_AREA)
                result = cv2.matchTemplate(img_scene, resized_template, cv2.TM_CCOEFF_NORMED)
                _, max_val, _, max_loc = cv2.minMaxLoc(result)

                if max_val > best_max_val:
                    best_max_val = max_val
                    best_max_loc = max_loc
                    best_scale = scale

        # 전수조사 결과 캐시 업데이트
        if best_max_val >= threshold:
            save_scale_cache(template_path, best_scale)

    # 최종 좌표 도출 및 하달
    if best_max_val >= threshold and best_max_loc is not None:
        actual_w = int(img_template.shape[1] * best_scale)
        actual_h = int(img_template.shape[0] * best_scale)
        
        start_x, start_y = best_max_loc
        center_x = int(start_x + (actual_w / 2))
        center_y = int(start_y + (actual_h / 2))

        # 좌표가 화면 범위를 벗어나면 잘못된 매칭으로 간주하고 실패 처리 (오터치 방어)
        if center_x < 0 or center_x > scene_w or center_y < 0 or center_y > scene_h:
            print(f"DEBUG out-of-bounds coord=({center_x},{center_y}) scene={scene_w}x{scene_h}", file=sys.stderr)
            print(f"FAIL,{int(best_max_val * 100)}")
            return False
        
        duration = round(time.time() - start_time, 2)
        print(f"SUCCESS,{center_x},{center_y},{best_max_val:.2f},{duration}")
        return True
    else:
        print(f"FAIL,{int(best_max_val * 100)}")
        return False

def export_to_excel(json_path, output_dir):
    # 백엔드가 수집한 JSON 임시 파일을 가공해 고품격 엑셀 리포트 빌드
    try:
        if not os.path.exists(json_path):
            print("[-] 에러: 변환할 임시 데이터 파일이 유실되었습니다.")
            return

        if not os.path.exists(output_dir):
            os.makedirs(output_dir)

        with open(json_path, 'r', encoding='utf-8') as f:
            data = json.load(f)

        df = pd.DataFrame(data)
        timestamp = time.strftime("%Y%m%d_%H%M%S")
        filename = f"QA_Test_Report_${timestamp}.xlsx"
        final_path = os.path.join(output_dir, filename)

        # 판다스 및 openpyxl 결합 출력
        df.to_excel(final_path, index=False)
        print(f"엑셀 리포트 저장 완료: {final_path}")
    except Exception as e:
        print(f"[-] 파이썬 엑셀 변환 중 런타임 에러 발생: {str(e)}")

if __name__ == "__main__":
    if len(sys.argv) >= 4 and sys.argv[1] == "EXPORT":
        export_to_excel(sys.argv[2], sys.argv[3])
    elif len(sys.argv) >= 6 and sys.argv[1] == "MATCH":
        find_match_with_cache(sys.argv[2], sys.argv[3])