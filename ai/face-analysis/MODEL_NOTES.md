# 얼굴상 분류 모델 노트

## v3 geometry-assisted scoring

- MediaPipe Face Landmarker 0.10.21 is loaded once from an in-memory model
  buffer. Blendshape and transformation-matrix outputs are disabled.
- Fifteen symmetric ratios represent face shape, vertical proportions, eyes,
  eye-corner tilt, and nose proportions. Hairline, makeup, skin texture,
  hairstyle, expression labels, and protected attributes are not features.
- FaceNet creates the candidate top two. When its score gap is under 0.02,
  geometry re-ranks only those two with geometry weight 0.80. The top-two set
  is preserved.
- Current person-disjoint weak-label OOF results: FaceNet baseline
  Top-1 0.1759 / Top-2 0.3367 / macro F1 0.1588; geometry-assisted shortlist
  Top-1 0.1759 / Top-2 0.3367 / macro F1 0.1613.
- Geometry-first scoring remains evaluation-only because it lowered Top-2.
  These values were selected on the same exploratory dataset and require
  separate webcam-domain validation before any production claim.
- Full landmarks, reduced per-image ratios, embeddings, crops, and identity
  centroids are not persisted or returned.
- MediaPipe 0.10.35 is excluded because its Windows wheel attempted
  undocumented external telemetry. Version 0.10.21 showed no such connection
  attempt in local validation and requires the pinned TF/NumPy/OpenCV stack.

## 현재 상태

이 모델은 오락성 얼굴상 태그를 제안하기 위한 실험 모델입니다. person-disjoint 4-fold
탐색 평가는 수행했지만 별도 독립 검증 데이터가 없으므로 운영 모델이나 확정 판정 모델로
간주하지 않습니다.

## 구성

- 얼굴 특징 모델: DeepFace Facenet512, frozen, 추가 학습 없음
- 모델 출력: 512차원 특징을 요청 처리 메모리에서만 사용
- 비교기: 인물별 사진 평균에서 분석 그룹 공통 방향을 제거한 뒤 얼굴상 중심을 정규화해 비교
- 분석 그룹: 사용자가 명시적으로 선택하며 얼굴에서 추론하지 않음
- 참조 입력: YuNet으로 정렬한 224×224 연예인 이미지

DeepFace 패키지는 MIT License로 제공되지만, DeepFace가 감싸는 Facenet512 가중치는
별도 출처의 모델입니다. 운영 배포 전 가중치와 참조 사진의 사용 허용 범위를 별도로
확인해야 합니다.

- DeepFace 저장소: <https://github.com/serengil/deepface>
- FaceNet 논문: <https://arxiv.org/abs/1503.03832>
- 현재 상태: 코드 라이선스 확인, Facenet512 가중치 배포 조건 추가 확인 필요

## 개인정보 처리

- 원본 사용자 프레임과 얼굴 crop을 저장하지 않음
- landmark 배열과 FaceNet512 특징 벡터를 저장하거나 외부로 전송하지 않음
- 사용자·참조 이미지 특징과 인물 중심을 파일로 저장하지 않음
- 사용자 식별자, 파일명과 얼굴 데이터를 추론 로그에 기록하지 않음

## 출력 제한

- 결과는 성격, 감정, 매력도나 외모의 우열을 의미하지 않음
- 보호 특성이나 민감한 속성을 얼굴에서 추론하지 않음
- 신뢰 조건을 충족하지 않으면 `UNCERTAIN`으로 표시하되 후보 하나를 제안
- 촬영 품질이 부족하면 후보 없이 `RETAKE_REQUIRED` 반환
- 촬영을 건너뛰면 분석 그룹과 얼굴상 모두 비운 `SKIPPED` 반환

## 알려진 제한사항

- 클래스당 참조 인물이 적어 결과가 특정 연예인 구성에 크게 좌우될 수 있음
- 사진의 화장, 조명, 표정과 촬영 환경이 결과에 영향을 줄 수 있음
- 상대 점수 temperature 0.20, top score 0.30, top1-top2 margin 0.08은 독립 검증 전 초기값임
- person-disjoint OOF 기준 SUCCESS 57.3%, UNCERTAIN 42.7%로 상태 표시를 조정함
- 기존 인물 유사도 평균은 Top-1 0.1658, Top-2 0.3116, macro F1 0.1507
- 그룹 중심 제거 방식은 Top-1 0.1759, Top-2 0.3367, macro F1 0.1588
- 그룹 중심 제거 방식은 같은 탐색 데이터에서 선택했으므로 독립적인 성능 향상 근거가 아님
- 기존 DINOv2 선형 head보다 세 집계 지표가 개선되어 기본 추론기로 교체함
- 별도 독립 검증셋과 웹캠 도메인 평가는 후속 단계에서 필요함
