import { EmptyState, Icon } from '@/components'

/** 사이드바에는 있지만 이번 차수 목업이 없는 관리자 화면(회원 관리·사전 데이터·리포트)용 스텁. */
export function AdminPlaceholder({ title }: { title: string }) {
  return (
    <main className="flex min-h-[60vh] items-center justify-center p-6">
      <EmptyState icon={<Icon name="settings" size={30} />} title={`${title} — 준비 중이에요`} text="다음 차수에서 구현합니다." />
    </main>
  )
}
