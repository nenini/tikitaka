import { useNavigate } from 'react-router-dom'
import { Button } from './Button'
import type { ButtonVariant } from './Button'

export interface ExitToHomeButtonProps {
  /** 기본 'ghost'. 화면의 주 동작과 경쟁하지 않게 기본은 약하게 둔다 */
  variant?: ButtonVariant
  size?: 'sm' | 'md' | 'lg'
  /** 라벨 교체 (예: '나중에 이어서'). 아이콘과 목적지는 그대로다 */
  label?: string
  className?: string
}

/**
 * 흐름 화면(앱 셸 밖)에서 홈으로 빠져나가는 공용 버튼.
 *
 * 상단·하단 네비는 top-level 화면에만 붙는다. 매칭 큐·평가·리포트처럼 셸 밖에 있는
 * 화면은 **브라우저 뒤로가기 말고는 나갈 길이 없었다.** 뒤로가기는 어디로 가는지
 * 예측할 수 없고(직전이 대기방이면 끝난 세션으로 되돌아간다) 사용자는 갇혔다고 느낀다.
 *
 * 화면마다 `navigate('/')` 를 새로 쓰지 않고 여기로 모은다 — 예전에는 같은 '홈으로' 가
 * 화면마다 ghost·secondary 로 섞여 있었다.
 *
 * ⚠️ **되돌리기 어려운 자리에는 쓰지 않는다.** 통화 중 세션은 종료 확인을 거쳐야 하고,
 *    대기방은 준비 상태를 풀어야 한다(각 화면이 자체 확인 절차를 갖는다).
 */
export function ExitToHomeButton({
  variant = 'ghost',
  size = 'sm',
  label = '홈으로',
  className,
}: ExitToHomeButtonProps) {
  const navigate = useNavigate()
  return (
    <Button
      variant={variant}
      size={size}
      leadingIcon="home"
      className={className}
      onClick={() => navigate('/')}
    >
      {label}
    </Button>
  )
}
