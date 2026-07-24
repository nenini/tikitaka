# Face analysis

The confirmed production data flow is `FE -> AI -> FE -> BE (storage)`.
See `FE_INTEGRATION.md` for the raw Blob request, AI response, status handling,
and the minimal BE storage projection. The AI service does not call BE.

## Geometry-assisted FaceNet v3

The active API keeps FaceNet512's top-two shortlist and uses MediaPipe face
geometry only when FaceNet's top-two score gap is below `0.02`. The geometry
branch uses 15 symmetric, dimensionless ratios with these category weights:
face shape 30%, upper/middle/lower face proportions 25%, eye size/spacing 15%,
outer-eye tilt 10%, and nose length/width 20%. With the current weak-label
person-disjoint evaluation, this preserves FaceNet Top-1/Top-2 and improves
macro F1 from `0.1588` to `0.1613` without a female/male group regression. It
is still an exploratory entertainment
tagger, not an objective face-shape test.

MediaPipe `0.10.21` is pinned intentionally. The `0.10.35` Windows wheel was
observed attempting undocumented external telemetry, so it is not used. The
compatible stack pins NumPy `1.26.4`, OpenCV `4.11.0`, TensorFlow `2.19.1`, and
tf-keras `2.19.0` for Python 3.11.

Install dependencies and fetch the ignored official task model:

```bash
./.venv/Scripts/python.exe -m pip install -e .
./.venv/Scripts/python.exe scripts/download_face_landmarker.py
```

The task model, full landmarks, reduced ratios, FaceNet embeddings, aligned
user face, and original request image are never written to reports or logs.
Blendshape and facial-transformation outputs are disabled. Full landmarks are
reduced in request memory and then discarded. If MediaPipe fails for one
request or is unavailable at startup, FaceNet remains usable.

Run the aggregate-only comparison report:

```bash
./.venv/Scripts/python.exe scripts/evaluate_hybrid.py
```

Python 3.11 환경에서 사용자 제공 연예인 사진을 검증하고, YuNet 5-point landmark로
224×224 얼굴 이미지를 정렬하는 학습 준비 모듈입니다.

## 데이터 구성

- `data/사진데이터`: 원본 204장(68명 × 3장). 전처리 과정에서 수정하지 않습니다.
- `data/dataset_manifest.csv`: 인물, 얼굴상, 명시적 분석 그룹, 원본 SHA-256 매핑
- `data/processed`: 정렬 이미지. 재생성 가능하므로 Git에서 제외합니다.
- `data/processing_report.csv`: 얼굴 검출과 품질 검수 결과

여성 분석 그룹은 9종, 남성 분석 그룹은 8종입니다. 분석 그룹은 사용자가 명시적으로
선택해야 하며 얼굴에서 성별을 추론하지 않습니다.

## 실행

```powershell
.\.venv\Scripts\python.exe scripts\preprocess_dataset.py
.\.venv\Scripts\python.exe scripts\make_contact_sheet.py
.\.venv\Scripts\python.exe -m pytest -q
.\.venv\Scripts\python.exe -m ruff check src scripts tests
```

전처리는 detector를 한 번만 로드하고 전체 이미지를 순차 처리합니다. 얼굴이 원본 경계에
붙어 있어도 반사 padding을 사용해 정렬하며 원본을 덮어쓰지 않습니다. 전체 landmark나
얼굴 embedding은 파일, 로그, report에 저장하지 않습니다.

## 현재 FaceNet512 유사도 모델

- 얼굴 특징 모델: DeepFace `Facenet512`, 추가 학습 없이 frozen 상태로 사용
- 입력: YuNet으로 정렬된 BGR 224×224 얼굴 이미지
- 기준 구성: 사진별 특징을 인물별로 평균하고 여성·남성 그룹의 공통 특징 방향을 제거
- 점수: 공통 특징을 제거한 인물 중심을 얼굴상별로 평균·정규화한 뒤 cosine similarity 계산
- 분석 공간: 사용자가 명시한 여성 9종 또는 남성 8종만 비교
- 메모리 정책: 사용자 특징, 참조 사진 특징과 인물 중심을 프로세스 메모리에서만 사용
- 비저장: 원본 사용자 이미지, 얼굴 crop, 특징 벡터, 인물별 유사도

FaceNet512 모델과 참조 인덱스는 서비스 시작 시 한 번 생성합니다. 개인정보 원칙에 따라
참조 embedding 파일을 만들지 않으므로, `data/processing_report.csv`에서 품질을 통과한
정렬 참조 이미지를 읽어 인물 중심을 메모리에서 구성합니다. 요청마다 모델이나 참조
인덱스를 다시 만들지 않습니다.

FaceNet512는 얼굴상 정답 모델이 아니라 얼굴 식별용 유사도 모델입니다. 응답은 객관적인
얼굴상 판정이 아니라 등록된 연예인 얼굴상 묶음 중 상대적으로 가까운 오락성 태그입니다.

## 이전 DINOv2 비교 모델

- 백본: DINOv2 ViT-S/14 (`dinov2_vits14`), frozen 상태로 사용
- 분류기: 공통 projection과 명시적으로 선택된 여성 9종·남성 8종 head
- 입력: YuNet으로 정렬된 RGB 224×224 얼굴 이미지
- 저장: projection/head 가중치와 라벨 순서만 저장
- 비저장: 원본 이미지, 얼굴 crop, DINOv2 특징 벡터, 사용자 식별자

이 구조는 비교 실험 재현을 위해 남겨두었지만 FastAPI 서비스에서는 로드하지 않습니다.

```powershell
.\.venv\Scripts\python.exe scripts\train_classifier.py --device auto
```

최초 실행 시 공식 DINOv2 코드와 가중치가 PyTorch 캐시에 내려받아지고, 프로세스에서는
백본을 한 번만 로드합니다. 체크포인트 기본 경로는
`artifacts/face_type_head_experimental.pt`이며 Git에서 제외됩니다. 별도 검증 전에는 운영
모델로 간주하지 않습니다.

추론 결과 상태는 다음 계약을 따릅니다.

- `SUCCESS`: 신뢰 조건을 충족하며 1~2개 후보를 반환
- `UNCERTAIN`: 신뢰 조건을 충족하지 않아도 최소 1개 후보를 제안
- `RETAKE_REQUIRED`: 품질 검사를 통과하지 못했으며 후보는 비움
- `SKIPPED`: 사용자가 촬영을 건너뛰었으며 분석 그룹과 후보를 모두 비움

`PredictionPolicy`의 임계값은 초기값이며 별도 검증 단계에서 조정해야 합니다.

개선된 FaceNet512 상대 점수에는 temperature `0.20`을 적용합니다. 현재 상태 기준은 1위
점수 `0.30` 이상이면서 1·2위 차이가 `0.08` 이상인 경우입니다. person-disjoint OOF에서
이 정책의 SUCCESS 비율은 약 57.3%, UNCERTAIN 비율은 약 42.7%입니다. 이는 정확도
보장이 아니라 오락성 결과의 후보 분리 정도를 표시하는 운영 초기값입니다.

모델 출처, 제한사항과 개인정보 처리 원칙은 `MODEL_NOTES.md`에 기록합니다.

## 내부 FastAPI

AI 모듈은 backend가 호출하는 내부 endpoint만 제공합니다. 인증, 동의 확인, 사용자 결과 저장,
공개 여부와 대표 인물 조회는 구현하지 않습니다. 이미지 입력은 multipart `UploadFile` 대신
JPEG·PNG·WebP 원본 바이트를 요청 body로 받아 메모리에서만 처리합니다.

```powershell
.\.venv\Scripts\python.exe -m uvicorn face_analysis.api:app `
  --app-dir src --host 127.0.0.1 --port 8001
```

- `GET /internal/v1/face-analysis/health`
- `POST /internal/v1/face-analysis/quality-check`
- `POST /internal/v1/face-analysis/analyze?analysis_group=female`

분석 그룹은 사용자가 선택하거나 backend의 프로필 계약에서 전달해야 하며 얼굴 이미지에서
추론하지 않습니다. 요청 `Content-Type`은 `image/jpeg`, `image/png`, `image/webp`만 허용합니다.
응답의 `relativeScore`는 보정된 확률이나 객관적 신뢰도가 아닙니다.

FaceNet512 또는 메모리 참조 인덱스만 초기화되지 않으면 health는 `DEGRADED`를 반환하며
품질 검사는 계속 사용할 수 있습니다. YuNet detector까지 초기화되지 않은 경우에만 두 분석
endpoint가 모두 503을 반환합니다. FaceNet512 가중치는 기본적으로
`artifacts/.deepface/weights`에서 읽습니다.

## 로컬 카메라 데모 (Phase 5)

프로젝트 루트에서 Git Bash를 열고 다음 한 줄을 실행합니다.

```bash
cd ai/face-analysis && ./.venv/Scripts/python.exe scripts/run_demo.py
```

모델 준비가 끝나면 `http://127.0.0.1:8001/`이 기본 브라우저에서 자동으로 열립니다. 자동으로
열리지 않으면 해당 주소를 직접 입력합니다. 브라우저를 열지 않고 서버만 실행하려면
`--no-browser`, 포트를 바꾸려면 `--port 8010`을 추가합니다.

데모에서는 얼굴에서 성별을 추론하지 않고 사용자가 여성 또는 남성 후보군을 직접 선택합니다.
카메라 촬영 또는 JPEG·PNG·WebP 사진 선택 후 품질 검사를 먼저 수행하며, 통과한 경우에만
FaceNet512 상대 유사도 분석을 요청합니다. `SUCCESS`, `UNCERTAIN`, `RETAKE_REQUIRED` 상태와
최대 두 개의 오락성 후보를 화면에 표시합니다.

이 서버는 `127.0.0.1`에만 바인딩되며 외부 클라이언트 요청을 한 번 더 거부합니다. 원본 사진,
얼굴 crop, landmark, embedding은 디스크나 로그에 저장하지 않습니다. 선택한 사진의
미리보기는 현재 브라우저 메모리에만 존재하고 재촬영하거나 페이지를 닫을 때 해제되며,
페이지를 벗어나면 카메라 트랙도 중지됩니다. 이 화면은 로컬 검증용이므로 인증·동의·회원
결과 저장을 제공하는 운영 프론트엔드를 대신하지 않습니다.

## Person-disjoint 평가

클래스마다 4명의 인물을 이용해 grouped 4-fold 평가를 실행합니다. 동일 인물의 사진은 한
fold에서 학습 또는 검증 중 한쪽에만 존재하며, 모든 인물이 한 번씩 검증에 사용됩니다.

```powershell
.\.venv\Scripts\python.exe scripts\evaluate_classifier.py --device cuda
```

보고서는 `reports/person_disjoint_evaluation.json`과 `.md`로 생성됩니다. 보고서에는 집계 지표,
클래스별 지표와 혼동행렬만 포함하고 인물별 예측·이미지·embedding은 포함하지 않습니다.
임계값 탐색은 동일 out-of-fold 예측을 사용하므로 별도 검증 전 서비스에 자동 적용하지
않습니다.

## 얼굴상 프로토타입 비교 실험

특정 연예인 식별 특징에 대한 과적합을 줄일 수 있는지 확인하기 위해 frozen DINOv2 특징의
코사인 유사도 실험을 별도로 제공합니다. 각 fold의 학습 데이터에서 사진을 먼저 인물별로
평균하고, 인물 평균을 다시 얼굴상별로 동일 가중 평균합니다. 이미지 특징, 인물 평균과
얼굴상 프로토타입은 평가 프로세스 메모리에서만 사용하고 파일로 저장하지 않습니다.

```powershell
.\.venv\Scripts\python.exe scripts\evaluate_prototype.py --device cuda
```

동일한 person-disjoint 4-fold 기준의 현재 결과는 다음과 같습니다.

| 방식 | Top-1 | Top-2 | macro F1 |
|---|---:|---:|---:|
| DINOv2 projection + linear head | 0.1156 | 0.2864 | 0.1066 |
| 인물 균형 얼굴상 prototype cosine | 0.0854 | 0.2060 | 0.0825 |

프로토타입 방식은 세 지표가 모두 하락하여 서비스 분류기를 교체하지 않았습니다. 비교
결과는 `reports/prototype_comparison.json`에 집계값으로만 기록하며, 인물별 예측이나 식별자,
이미지 경로, 특징 벡터는 포함하지 않습니다.

## FaceNet512 person-disjoint 평가

```powershell
.\.venv\Scripts\python.exe scripts\evaluate_facenet.py
```

각 fold에서는 검증 인물 한 명을 얼굴상별로 제외하고, 남은 세 명의 인물 중심을 동일 가중
평균합니다. 운영 시에는 얼굴상별 네 명 전체를 사용합니다.

| 방식 | Top-1 | Top-2 | macro F1 |
|---|---:|---:|---:|
| DINOv2 projection + linear head | 0.1156 | 0.2864 | 0.1066 |
| DINOv2 class prototype cosine | 0.0854 | 0.2060 | 0.0825 |
| FaceNet512 인물 유사도 평균(기존) | 0.1658 | 0.3116 | 0.1507 |
| FaceNet512 그룹 중심 제거·클래스 중심(현재) | 0.1759 | 0.3367 | 0.1588 |

그룹 공통 특징 방향을 제거하고 얼굴상별 중심을 정규화한 방식이 기존 FaceNet512 점수보다
세 집계 지표를 모두 개선해 FastAPI의 기본 추론기로 교체했습니다. 이 변환은 같은 탐색
데이터에서 선택했으므로 독립 검증 결과로 간주하지 않습니다. 현재 abstention 정책도 객관적
확정 기준으로 주장하지 않으며, 조건 미달 시 `UNCERTAIN`과 최소 한 개의 제안만 반환합니다.
