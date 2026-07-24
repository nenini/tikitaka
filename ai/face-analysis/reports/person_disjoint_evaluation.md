# Person-disjoint 얼굴상 분류 평가

> 이 결과는 연예인 weak label 데이터의 탐색 평가이며 운영 정확도를 입증하지 않습니다.

## 평가 설정

- 방식: person-disjoint-grouped-4-fold
- 모델: dinov2_vits14-frozen-dual-head
- 품질 통과 이미지: 199
- 고유 인물: 68
- 동일 인물의 학습·검증 중복: 없음

## 전체 결과

| 정책 | Top-1 | Top-2 | macro F1 | coverage | abstention | 확정 정확도 | 잘못된 확정률 |
|---|---:|---:|---:|---:|---:|---:|---:|
| 초기 | 0.1156 | 0.2864 | 0.1066 | 0.2312 | 0.7688 | 0.0870 | 0.2111 |

## 임계값 탐색

- 최고 탐색 후보 success threshold: 0.25
- 최고 탐색 후보 minimum margin: 0.02
- 목표 확정 정확도 충족: False
- 서비스 적용 가능한 추천 존재: False
- 목표 미달 후보는 서비스 임계값으로 추천하거나 적용하지 않음
- 동일 OOF 예측으로 탐색했으므로 목표 충족 시에도 별도 검증 전 자동 적용 금지

## Fold 결과

| Fold | 학습 인물 | 검증 인물 | 검증 이미지 | Top-1 | Top-2 | macro F1 |
|---:|---:|---:|---:|---:|---:|---:|
| 1 | 51 | 17 | 49 | 0.1224 | 0.3469 | 0.0889 |
| 2 | 51 | 17 | 50 | 0.1400 | 0.2600 | 0.1197 |
| 3 | 51 | 17 | 51 | 0.0784 | 0.2157 | 0.0534 |
| 4 | 51 | 17 | 49 | 0.1224 | 0.3265 | 0.1001 |

## female 혼동행렬

| actual \ predicted | dog | cat | rabbit | fox | deer | turtle | hamster | snake | dinosaur |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| dog | 1 | 0 | 1 | 2 | 2 | 3 | 2 | 0 | 1 |
| cat | 0 | 1 | 1 | 0 | 2 | 1 | 2 | 4 | 1 |
| rabbit | 1 | 0 | 1 | 0 | 1 | 5 | 2 | 1 | 1 |
| fox | 1 | 1 | 0 | 2 | 2 | 2 | 0 | 2 | 2 |
| deer | 2 | 2 | 0 | 1 | 2 | 1 | 1 | 1 | 2 |
| turtle | 2 | 0 | 3 | 1 | 1 | 1 | 1 | 2 | 1 |
| hamster | 4 | 1 | 1 | 2 | 3 | 0 | 0 | 0 | 0 |
| snake | 0 | 0 | 2 | 0 | 2 | 1 | 0 | 6 | 1 |
| dinosaur | 1 | 1 | 2 | 1 | 2 | 1 | 1 | 2 | 1 |

## male 혼동행렬

| actual \ predicted | dog | cat | rabbit | fox | deer | snake | dinosaur | wolf |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| dog | 0 | 0 | 2 | 4 | 4 | 1 | 0 | 1 |
| cat | 2 | 0 | 2 | 3 | 1 | 3 | 0 | 0 |
| rabbit | 2 | 2 | 1 | 0 | 4 | 2 | 1 | 0 |
| fox | 2 | 1 | 0 | 5 | 1 | 1 | 1 | 1 |
| deer | 2 | 1 | 4 | 1 | 0 | 1 | 0 | 2 |
| snake | 2 | 2 | 1 | 0 | 2 | 0 | 2 | 2 |
| dinosaur | 1 | 2 | 1 | 0 | 1 | 2 | 2 | 3 |
| wolf | 1 | 1 | 0 | 1 | 1 | 1 | 6 | 0 |

## 제한사항

- Celebrity reference labels are weak labels, not objective ground truth.
- Only four people are available per group-specific class.
- Threshold calibration and reporting use the same out-of-fold predictions.
- Webcam domain performance is not measured by this dataset.
- This report does not establish production readiness.
