import { useState } from 'react'
import type { ReactNode } from 'react'
import {
  AlertDialog,
  Avatar,
  Badge,
  BottomNav,
  Button,
  CallControls,
  Callout,
  Card,
  CardHeader,
  Chip,
  Cluster,
  CoachToast,
  ConnectionIndicator,
  ConsentRow,
  DarkScope,
  EmptyState,
  Field,
  Hedge,
  Icon,
  IconButton,
  Input,
  ListRowButton,
  Modal,
  Progress,
  QuestionCard,
  Rating,
  ScoreRing,
  Screen,
  Segmented,
  SessionTimer,
  Skeleton,
  Spinner,
  Stack,
  Steps,
  Switch,
  TagChip,
  ThemeToggle,
  TopicButton,
  iconNames,
} from '@/components'

type Intensity = 'flow' | 'balanced' | 'active'

/**
 * 공용 컴포넌트 갤러리 (개발/디자인 QA 전용, 라우트 /gallery).
 * preview.html 의 리빙 스타일가이드를 React 컴포넌트로 재현한다. 프로덕션 번들에서 제외 대상.
 */
export function ComponentGallery() {
  const [chips, setChips] = useState<Record<string, boolean>>({ rabbit: true, fox: false, dog: false })
  const [intensity, setIntensity] = useState<Intensity>('balanced')
  const [rating, setRating] = useState(4)
  const [cafe, setCafe] = useState(true)
  const [consent, setConsent] = useState({ terms: true, face: true, expr: false, report: true })
  const [modalOpen, setModalOpen] = useState(false)
  const [alertOpen, setAlertOpen] = useState(false)
  const [muted, setMuted] = useState(false)
  const [cameraDisabled, setCameraDisabled] = useState(true)

  return (
    <main style={{ maxWidth: 1080, margin: '0 auto', padding: '40px 24px 120px' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Icon name="bloom" size={26} style={{ color: 'var(--bt-color-brand)' }} />
          <span className="bt-h2">컴포넌트 갤러리</span>
        </div>
        <ThemeToggle />
      </header>
      <p className="bt-body bt-muted" style={{ marginTop: 12 }}>
        <code>@/components</code> 배럴에서 가져온 React 래퍼들. 우상단 토글로 라이트/다크를 검증하세요.
      </p>

      <Section title="Button">
        <Cluster gap={12}>
          <Button variant="primary" trailingAffordance>
            매칭 시작하기
          </Button>
          <Button variant="secondary" leadingIcon="chevron-left">
            뒤로가기
          </Button>
          <Button variant="tonal">전체 보기</Button>
          <Button variant="ghost">건너뛰기</Button>
          <Button variant="danger" leadingIcon="report">
            신고하기
          </Button>
          <Button variant="primary" loading>
            매칭 중
          </Button>
          <Button variant="primary" disabled>
            비활성
          </Button>
        </Cluster>
        <Cluster gap={12} style={{ marginTop: 16 }}>
          <Button variant="primary" size="sm">
            sm · 36px
          </Button>
          <Button variant="primary">md · 44px</Button>
          <Button variant="primary" size="lg">
            lg · 56px
          </Button>
        </Cluster>
      </Section>

      <Section title="Chip · Badge · Hedge · Avatar · Score ring">
        <Cluster>
          <Chip selected={chips.rabbit} onSelectedChange={(v) => setChips((c) => ({ ...c, rabbit: v }))}>
            🐰 토끼상
          </Chip>
          <Chip selected={chips.fox} onSelectedChange={(v) => setChips((c) => ({ ...c, fox: v }))}>
            🦊 여우상
          </Chip>
          <Chip selected={chips.dog} onSelectedChange={(v) => setChips((c) => ({ ...c, dog: v }))}>
            🐶 강아지상
          </Chip>
          <TagChip>ENFP</TagChip>
        </Cluster>
        <Cluster style={{ marginTop: 16 }}>
          <Badge tone="info">매칭 대기</Badge>
          <Badge tone="success">세션 완료</Badge>
          <Badge tone="warning">수락 대기 12:00</Badge>
          <Badge tone="danger">신고 접수</Badge>
          <Hedge />
        </Cluster>
        <Cluster gap={16} style={{ marginTop: 16 }}>
          <Avatar size="sm" style={{ background: 'var(--bt-blue-200)' }} />
          <Avatar name="소연" status="online" style={{ background: 'var(--bt-blue-300)' }} />
          <Avatar size="lg" round name="민준" style={{ background: 'var(--bt-blue-400)' }} />
          <ScoreRing value={85} unit="Good!" />
          <ScoreRing value={78} small />
          <ScoreRing value={90} small />
        </Cluster>
        <Progress value={64} aria-label="설문 진행률" style={{ marginTop: 16, maxWidth: 320 }} />
      </Section>

      <Section title="Form · Switch · Segmented · Rating">
        <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))' }}>
          <Card>
            <Stack>
              {/* Input 이 Field 컨텍스트를 읽어 id·aria-describedby·aria-invalid 를 자동 연결한다 */}
              <Field label="닉네임" required help="실명은 상대에게 공개되지 않습니다.">
                <Input placeholder="상대에게 보여질 이름이에요" />
              </Field>
              <Field label="한 줄 소개" error="연락처는 상호 동의 후에만 공개할 수 있어요.">
                <Input defaultValue="010-1234-5678" />
              </Field>
              {/* 합성 패턴 */}
              <Field>
                <Field.Label>자기소개</Field.Label>
                <Field.Textarea placeholder="어떤 대화를 좋아하세요?" />
              </Field>
            </Stack>
          </Card>
          <Card>
            <Stack gap={20}>
              <div>
                <div className="bt-caption" style={{ marginBottom: 10 }}>
                  코칭 개입 강도 (§10.4)
                </div>
                <Segmented
                  aria-label="코칭 개입 강도"
                  value={intensity}
                  onChange={setIntensity}
                  options={[
                    { value: 'flow', label: '흐름 우선' },
                    { value: 'balanced', label: '균형' },
                    { value: 'active', label: '적극' },
                  ]}
                />
              </div>
              <Switch checked={cafe} onChange={(e) => setCafe(e.currentTarget.checked)} label="카페 배경음 켜기" />
              <div>
                <div className="bt-caption" style={{ marginBottom: 10 }}>
                  상호 평가 1~5점 (§15.2)
                </div>
                <Rating aria-label="대화의 편안함" value={rating} onChange={setRating} />
              </div>
            </Stack>
          </Card>
        </div>
      </Section>

      <Section title="Card · List row · Callout · Steps">
        <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))' }}>
          <Card>
            <CardHeader title="연습 기록" action={<Button variant="ghost" size="sm">전체 보기</Button>} />
            <Stack gap={8}>
              <ListRowButton
                leading={<Avatar size="sm" style={{ background: 'var(--bt-blue-200)' }} />}
                title="소연"
                meta="05.24 · 12:34 · 30분"
                trailing={<ScoreRing value={85} small />}
              />
              <ListRowButton
                leading={<Avatar size="sm" style={{ background: 'var(--bt-blue-300)' }} />}
                title="민준"
                meta="05.22 · 18:20 · 30분"
                trailing={<ScoreRing value={78} small />}
              />
            </Stack>
          </Card>
          <Stack>
            <Steps count={3} current={2} labels={['얼굴 촬영', '설문', '완료']} />
            <Callout>
              AI 코칭은 <b>본인 화면에만</b> 표시돼요. 상대는 볼 수 없어요.
            </Callout>
            <Callout tone="warning">세션 원본 영상은 저장되지 않아요. 분석 지표만 기록됩니다.</Callout>
            <Callout tone="success">두 분 모두 동의해서 연락처가 공개됐어요.</Callout>
            <Cluster gap={8}>
              <Button variant="secondary" onClick={() => setModalOpen(true)}>
                신고 모달 열기
              </Button>
              <Button variant="secondary" onClick={() => setAlertOpen(true)}>
                확인 다이얼로그
              </Button>
            </Cluster>
          </Stack>
        </div>
      </Section>

      <Section title="목적별 동의">
        <Card>
          <ConsentRow
            title="이용약관 및 개인정보 처리"
            desc="계정 운영·연령 확인·신고 대응에 사용돼요."
            required
            checked={consent.terms}
            onCheckedChange={(v) => setConsent((c) => ({ ...c, terms: v }))}
          />
          <ConsentRow
            title="얼굴 촬영 및 얼굴상 분석"
            desc="분석이 끝나면 원본 이미지는 삭제돼요."
            checked={consent.face}
            onCheckedChange={(v) => setConsent((c) => ({ ...c, face: v }))}
          />
          <ConsentRow
            title="세션 중 표정·시선 분석"
            desc="원본 영상은 저장하지 않고, 분석 지표만 기록해요. 분석은 내 기기 안에서 실행돼요."
            checked={consent.expr}
            onCheckedChange={(v) => setConsent((c) => ({ ...c, expr: v }))}
          />
        </Card>
      </Section>

      <Section title="Skeleton · Empty · Spinner">
        <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))' }}>
          <Card>
            <Cluster gap={12} style={{ alignItems: 'center' }}>
              <Skeleton width={48} height={48} circle />
              <Stack gap={8} style={{ flex: 1 }}>
                <Skeleton width="60%" />
                <Skeleton width="40%" />
              </Stack>
            </Cluster>
            <div style={{ marginTop: 16 }}>
              <Spinner /> <span className="bt-body-sm bt-muted">불러오는 중…</span>
            </div>
          </Card>
          <Card>
            <EmptyState
              icon={<Icon name="heart" size={32} style={{ color: 'var(--bt-color-text-tertiary)' }} />}
              title="아직 매칭 기록이 없어요"
              text="첫 연습을 시작하면 여기에 기록이 쌓여요."
              action={<Button variant="primary" size="sm">연습 시작</Button>}
            />
          </Card>
        </div>
      </Section>

      <Section title="세션 UI (항상 다크)">
        <DarkScope fill={false} style={{ borderRadius: 20, padding: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
            <Cluster gap={8}>
              <SessionTimer remainingSec={24 * 60 + 18} label="남은 시간" />
              <ConnectionIndicator state="connected" />
            </Cluster>
            <Cluster gap={8}>
              <SessionTimer remainingSec={4 * 60 + 30} label="남은 시간" />
              <SessionTimer remainingSec={42} label="남은 시간" />
              <ConnectionIndicator state="reconnecting" />
            </Cluster>
          </div>

          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 24 }}>
            <CoachToast
              title="가볍게 고개를 끄덕여 보세요"
              text="최근 2분간 리액션이 줄어든 것 같아요."
              hedge
              onDismiss={() => {}}
            />
            <QuestionCard
              options={[
                { id: 'q1', text: '최근에 기억에 남은 전시가 있었어요?' },
                { id: 'q2', text: '쉬는 날엔 주로 뭐 하면서 보내세요?' },
                { id: 'q3', text: '요즘 빠져 있는 게 있어요?' },
              ]}
              onSelect={() => {}}
            />
          </div>

          <Cluster gap={8} style={{ marginTop: 20 }}>
            <TopicButton>☕ 카페 이야기</TopicButton>
            <TopicButton>🎬 최근 본 영화</TopicButton>
            <TopicButton>✈️ 여행</TopicButton>
          </Cluster>

          <div style={{ display: 'grid', placeItems: 'center', marginTop: 28 }}>
            <CallControls
              muted={muted}
              cameraDisabled={cameraDisabled}
              onToggleMute={() => setMuted((v) => !v)}
              onToggleCamera={() => setCameraDisabled((v) => !v)}
              onEnd={() => {}}
              beforeEnd={<IconButton icon="chat" aria-label="채팅" />}
              afterEnd={<IconButton icon="help" aria-label="도움 요청" />}
            />
          </div>
        </DarkScope>
      </Section>

      <Section title="Screen 레이아웃 (100dvh · 시맨틱 슬롯 · 스킵 링크)">
        <p className="bt-body-sm bt-muted" style={{ marginBottom: 12 }}>
          Tab 을 눌러 보세요 — 첫 포커스에서 "본문으로 이동" 스킵 링크가 나타납니다.
        </p>
        <div style={{ border: '1px solid var(--bt-color-border)', borderRadius: 16, overflow: 'hidden' }}>
          <Screen
            maxWidth={420}
            contentAs="div"
            style={{ minHeight: 320 }}
            header={
              <Cluster style={{ justifyContent: 'space-between', padding: '12px 20px' }}>
                <span className="bt-h3">홈</span>
                <ThemeToggle iconOnly />
              </Cluster>
            }
            footer={
              <BottomNav
                leftItems={[
                  { icon: 'home', label: '홈', to: '/gallery', end: true },
                  { icon: 'chart', label: '성장', to: '/gallery#growth' },
                ]}
                rightItems={[
                  { icon: 'heart', label: '매칭', to: '/gallery#match' },
                  { icon: 'user', label: '내 정보', to: '/gallery#me' },
                ]}
                fab={{ label: '연습 시작', onClick: () => {} }}
              />
            }
          >
            <p className="bt-body-sm bt-muted">
              header/main/footer 가 시맨틱 요소로 렌더되고, 레이아웃 값은 <code>--bt-screen-*</code> CSS
              변수로 나갑니다. FAB 은 좌우 항목 수와 무관하게 CSS Grid 로 정중앙에 고정됩니다.
            </p>
          </Screen>
        </div>
      </Section>

      {/* SVG path 는 타입 검사로 형태 오류를 잡을 수 없다 — 전체 그리드로 시각 검수한다. */}
      <Section title="Icon 레지스트리 시각 검수">
        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fill,minmax(96px,1fr))' }}>
          {iconNames.map((name) => (
            <div
              key={name}
              style={{
                display: 'grid',
                justifyItems: 'center',
                gap: 6,
                padding: 12,
                border: '1px solid var(--bt-color-border)',
                borderRadius: 12,
              }}
            >
              <Icon name={name} size={24} />
              <code className="bt-micro">{name}</code>
            </div>
          ))}
        </div>
      </Section>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="이 사용자를 신고할까요?"
        actions={
          <>
            <Button variant="ghost" onClick={() => setModalOpen(false)}>
              취소
            </Button>
            <Button variant="danger" leadingIcon="report" onClick={() => setModalOpen(false)}>
              신고하기
            </Button>
          </>
        }
      >
        신고 내용은 운영팀만 확인하며, 상대에게는 알려지지 않아요. 세션은 즉시 종료됩니다.
      </Modal>

      <AlertDialog
        open={alertOpen}
        onCancel={() => setAlertOpen(false)}
        onConfirm={() => setAlertOpen(false)}
        title="세션을 종료할까요?"
        description="지금 종료하면 남은 시간은 복구되지 않고, 분석 리포트는 여기까지의 대화로 만들어져요."
        tone="danger"
        confirmLabel="종료하기"
        confirmIcon="phone-end"
      />
    </main>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section style={{ marginTop: 56 }}>
      <div style={{ borderBottom: '1px solid var(--bt-color-border)', paddingBottom: 12, marginBottom: 24 }}>
        <h2 className="bt-h3">{title}</h2>
      </div>
      {children}
    </section>
  )
}
