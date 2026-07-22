# @video-dating/browser-ai

브라우저 로컬 비언어 행동 분석을 위한 strict TypeScript 패키지입니다.

주요 모듈:

- `FrameSampler`: 처리 중 프레임을 쌓지 않는 최신 프레임 중심 backpressure
- `FaceLandmarkerAdapter`: MediaPipe raw 타입을 내부 DTO로 격리하고 GPU 실패 시 CPU fallback
- `FaceFrameNormalizer`: 얼굴 box, head pose, 선택 blendshape, 밝기·blur 수치 정규화
- `FaceQualityDetector`: 품질 문제와 사용자 행동을 분리하는 hysteresis gate
- `BaselineCalibrator`: 정상 품질 프레임만 사용한 세션 전용 baseline
- `ScreenAttentionDetector`: head pose·얼굴 중심 변화 기반 화면 방향 이탈 근사
- `SmileExpressionDetector`: 입꼬리·볼 계수의 지속 변화 감지
- `VisionEventFactory`: 단조 증가 seq와 일관된 시간축을 갖는 최소 이벤트 계약

화면 방향 detector는 실제 아이컨택을 측정하지 않으며, 미소 detector는 감정이나 호감을 추론하지 않습니다. threshold는 초기 후보이므로 실제 동의 기반 평가 영상으로 반드시 튜닝해야 합니다.
