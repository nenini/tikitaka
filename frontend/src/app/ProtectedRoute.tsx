import { Outlet } from 'react-router-dom'

// TODO: auth 기능 붙기 전까지 임시로 인증 체크 비활성화
/** 인증이 필요한 라우트 보호. (미로그인 시 /login 으로) */
export function ProtectedRoute() {
  return <Outlet />
}
