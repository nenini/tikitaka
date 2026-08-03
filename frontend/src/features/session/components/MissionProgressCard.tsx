import { Badge, Card, Progress } from '@/components'
import type { SessionMission } from '../types'

export interface MissionProgressCardProps {
  /** `GET /api/v1/sessions/{id}/missions` 로 받은 내 미션들 */
  missions: SessionMission[]
}

/** 진행 단위 → 표시 접미사. */
const UNIT_SUFFIX: Record<SessionMission['progressUnit'], string> = {
  COUNT: '회',
  SECONDS: '초',
}

/**
 * 세션 미션 진행도 (MISSION-01).
 *
 * 서버가 세션 시작 시 미션을 배정하고(`SessionMissionProvisioningService`)
 * `progressValue / targetValue` 를 갱신한다. 화면은 그 값을 그대로 그린다.
 *
 * ⚠️ 원칙 1(연습이지 심사가 아니다): 점수·등수가 아니라 **행동 횟수**다.
 *    달성/미달성을 평가하는 문구를 붙이지 않고, 남은 양만 알려준다.
 *
 * ⚠️ 진행도 실시간 갱신 경로는 아직 없다 — 미션 진행을 밀어주는 STOMP 토픽이
 *    백엔드에 없어서(코칭·침묵·안전만 있다) 세션 화면 진입 시점 값이다.
 */
export function MissionProgressCard({ missions }: MissionProgressCardProps) {
  if (missions.length === 0) return null

  return (
    <Card variant="inset">
      <div className="bt-caption mb-2">이번 세션 미션</div>

      <div className="flex flex-col gap-3">
        {missions.map((mission) => {
          const target = Math.max(1, mission.targetValue)
          const ratio = Math.min(100, Math.round((mission.progressValue / target) * 100))
          const done = mission.status === 'COMPLETED'
          const suffix = UNIT_SUFFIX[mission.progressUnit]

          return (
            <div key={mission.sessionMissionId} className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="bt-body-sm">{mission.title}</span>
                <Badge tone={done ? 'success' : 'neutral'}>
                  <span className="bt-numeric">
                    {mission.progressValue}/{mission.targetValue}
                  </span>
                  {suffix}
                </Badge>
              </div>
              <Progress
                value={ratio}
                aria-label={`${mission.title} ${mission.progressValue}${suffix} / ${mission.targetValue}${suffix}`}
              />
              {mission.description && <p className="bt-caption bt-muted">{mission.description}</p>}
            </div>
          )
        })}
      </div>
    </Card>
  )
}
