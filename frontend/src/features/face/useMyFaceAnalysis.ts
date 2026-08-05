import { useEffect, useState } from 'react'
import { getMyFaceAnalysis } from './api'
import type { FaceAnalysisResult } from './types'

/* -------------------------------------------------------------------------- */
/*  내 얼굴상 결과 — 헤더 아바타와 마이페이지가 같은 값을 쓴다.                  */
/*                                                                            */
/*  화면마다 부르면 라우팅할 때마다 같은 GET 이 반복되므로 모듈 단위로 한 번만    */
/*  부르고 그 Promise 를 공유한다. 재분석(`/me/edit/face`) 뒤에는 값이 바뀌므로  */
/*  `resetMyFaceAnalysis()` 로 캐시를 버려야 한다.                              */
/* -------------------------------------------------------------------------- */

let cached: Promise<FaceAnalysisResult | null> | null = null

function load(): Promise<FaceAnalysisResult | null> {
  // 얼굴상은 부가 정보다. 실패(미로그인·서버 오류)해도 화면을 막지 않고 이니셜로 돌아간다.
  cached ??= getMyFaceAnalysis()
    .then((result) => (result?.status === 'COMPLETED' ? result : null))
    .catch(() => null)
  return cached
}

/** 재분석·로그아웃 후처럼 다음 조회를 다시 서버에서 받아야 할 때 호출한다. */
export function resetMyFaceAnalysis() {
  cached = null
}

/** 완료된 내 얼굴상 결과. 아직 없거나 분석 전이면 `null`. */
export function useMyFaceAnalysis(): FaceAnalysisResult | null {
  const [result, setResult] = useState<FaceAnalysisResult | null>(null)

  useEffect(() => {
    let alive = true
    void load().then((value) => {
      if (alive) setResult(value)
    })
    return () => {
      alive = false
    }
  }, [])

  return result
}
