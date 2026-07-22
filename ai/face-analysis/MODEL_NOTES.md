# 얼굴상 분류 모델 노트

## 현재 상태

이 모델은 오락성 얼굴상 태그를 제안하기 위한 실험 모델입니다. 별도 검증 데이터와 평가가
완료되기 전에는 운영 모델이나 확정 판정 모델로 간주하지 않습니다.

## 구성

- 백본: Meta DINOv2 ViT-S/14, frozen
- 백본 출력: 384차원 특징을 요청 처리 메모리에서만 사용
- 분류기: 192차원 공통 projection과 여성 9종·남성 8종 head
- 분석 그룹: 사용자가 명시적으로 선택하며 얼굴에서 추론하지 않음
- 학습 입력: YuNet으로 정렬한 224×224 연예인 참조 이미지

DINOv2 코드와 공개 사전학습 가중치는 Apache License 2.0으로 제공됩니다.

- 저장소: <https://github.com/facebookresearch/dinov2>
- 모델 카드: <https://github.com/facebookresearch/dinov2/blob/main/MODEL_CARD.md>
- 라이선스: <https://github.com/facebookresearch/dinov2/blob/main/LICENSE>

## 개인정보 처리

- 원본 사용자 프레임과 얼굴 crop을 저장하지 않음
- landmark 배열과 DINOv2 특징 벡터를 저장하거나 외부로 전송하지 않음
- 체크포인트에는 projection/head 가중치와 라벨 순서만 저장
- 사용자 식별자, 파일명과 얼굴 데이터를 추론 로그에 기록하지 않음

## 출력 제한

- 결과는 성격, 감정, 매력도나 외모의 우열을 의미하지 않음
- 보호 특성이나 민감한 속성을 얼굴에서 추론하지 않음
- 신뢰 조건을 충족하지 않으면 `UNCERTAIN`으로 표시하되 후보 하나를 제안
- 촬영 품질이 부족하면 후보 없이 `RETAKE_REQUIRED` 반환
- 촬영을 건너뛰면 분석 그룹과 얼굴상 모두 비운 `SKIPPED` 반환

## 알려진 제한사항

- 클래스당 참조 인물이 적어 특정 연예인의 특징을 학습할 수 있음
- 사진의 화장, 조명, 표정과 촬영 환경이 결과에 영향을 줄 수 있음
- 현재 confidence와 margin 임계값은 검증 전 초기값임
- 인물 단위 분리, 별도 검증셋과 정량 평가는 후속 단계에서 확정해야 함
