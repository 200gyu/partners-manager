-- ═══════════════════════════════════════════════════════════
-- v8 매니저 가입 승인 — 승인 대기 목록 조회 RPC
-- ═══════════════════════════════════════════════════════════
-- 개념: 가입 = 대기(profiles.role='partner') → 관리자 승인(link_manager로
--       정리수납사 연결 + role='manager') = 활성화.
-- 이 마이그레이션은 "아직 승인 안 된 가입 계정" 목록을 관리자에게 보여주는
-- 조회 함수만 추가합니다(승인 동작은 기존 link_manager 재사용).
-- 전제: v5·v6·v7 적용됨. 실행: Supabase SQL Editor.
-- ═══════════════════════════════════════════════════════════

BEGIN;

-- 승인 대기 계정 목록 (가입했지만 아직 매니저로 연결 안 된 role='partner')
CREATE OR REPLACE FUNCTION list_pending_accounts()
RETURNS TABLE (uid uuid, email text, created_at timestamptz)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id, u.email::text, u.created_at
  FROM profiles p
  JOIN auth.users u ON u.id = p.id
  WHERE is_admin() AND p.role = 'partner'
  ORDER BY u.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION list_pending_accounts() TO authenticated;

COMMIT;

-- ── 검증: 함수 생성 확인 ──
SELECT proname FROM pg_proc WHERE proname = 'list_pending_accounts';
