import { EmptyState, Icon } from '@/components'

/** 아직 구현되지 않은 top-level 화면(매칭/리포트/성장)용 임시 페이지. AppShell 안에서 렌더된다. */
export function ComingSoon({ title }: { title: string }) {
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-[1080px] items-center justify-center px-4 sm:px-6">
      <EmptyState
        icon={<Icon name="sparkle" size={30} />}
        title={`${title} — 준비 중이에요`}
        text="다음 차수에서 만나요."
      />
    </main>
  )
}
