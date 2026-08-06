import type { FaceTypeCode } from './types'

/* -------------------------------------------------------------------------- */
/*  얼굴상 코드 → 프로필 이미지                                                 */
/*                                                                            */
/*  파일은 `public/face/*.webp` 에 있고 전부 256×256 이다.                      */
/*  원본(`아이콘 레퍼런스/profile_animal_image`)은 1254px PNG 10장·약 20MB 라    */
/*  그대로 넣으면 안 된다 — 화면에서 쓰는 가장 큰 크기가 128px 이라 256px 로     */
/*  줄이고 webp 로 바꿔 합계 80KB 로 만들었다.                                  */
/*  원본을 교체하면 같은 규격(256px webp)으로 다시 변환해서 덮어쓴다.            */
/*                                                                            */
/*  ⚠️ 원본 파일명 하나가 코드와 어긋난다: `ChatGPT Image_rat.png` → HAMSTER.    */
/*     그림 자체는 햄스터이고 `FaceTypeCode` 에 RAT 는 없다. 파일명 오기다.      */
/* -------------------------------------------------------------------------- */

const FACE_TYPE_IMAGE: Readonly<Record<FaceTypeCode, string>> = {
  DOG: '/face/dog.webp',
  CAT: '/face/cat.webp',
  RABBIT: '/face/rabbit.webp',
  FOX: '/face/fox.webp',
  DEER: '/face/deer.webp',
  TURTLE: '/face/turtle.webp',
  HAMSTER: '/face/hamster.webp',
  SNAKE: '/face/snake.webp',
  DINOSAUR: '/face/dinosaur.webp',
  WOLF: '/face/wolf.webp',
}

/**
 * 얼굴상 이미지 경로. 코드가 없으면 `undefined` 를 준다 —
 * `Avatar` 의 `src` 에 그대로 넘기면 닉네임 이니셜 폴백으로 돌아간다.
 */
export function faceTypeImage(code: FaceTypeCode | null | undefined): string | undefined {
  return code ? FACE_TYPE_IMAGE[code] : undefined
}
