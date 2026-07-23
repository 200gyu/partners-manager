-- ═══════════════════════════════════════════════════════════
-- v6 매니저(정리수납사) 전용 포털 — 1단계: DB + 인증 구조
-- ═══════════════════════════════════════════════════════════
-- 전제: v5(RBAC)가 이미 적용됨 — profiles 테이블, is_admin()/my_partner_id()
--       헬퍼, 역할별 RLS(비관리자는 my_partner_id() 기준 본인 데이터만).
-- 이 마이그레이션은 그 위에 얇게 추가만 합니다(멱등·추가형).
-- 실행: Supabase SQL Editor에서 실행.
-- ═══════════════════════════════════════════════════════════

BEGIN;

-- ── 1. 매니저(정리수납사 로그인) 역할 추가 ──
--    기존 CHECK: ('admin','leader','partner') → 'manager' 포함으로 교체
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('admin', 'leader', 'partner', 'manager'));

-- ── 2. 방문 일정: 방문 시간 컬럼 추가 (현재 날짜만 존재) ──
ALTER TABLE assignments ADD COLUMN IF NOT EXISTS visit_time TIME;
-- 작업 내용은 기존 notes(TEXT) 컬럼을 그대로 사용, 진행 상태는 기존 status.

-- ── 3. 급여/수익: 건별 지급 상태(예정/완료) 컬럼 추가 ──
ALTER TABLE payroll_records
  ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT '예정';
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'payroll_payment_status_check'
  ) THEN
    ALTER TABLE payroll_records
      ADD CONSTRAINT payroll_payment_status_check
      CHECK (payment_status IN ('예정', '완료'));
  END IF;
END $$;

-- ── 4. RLS 재확인 (매니저 커버) ──
--    v5의 "self read" 정책은 TO authenticated + (… = my_partner_id())라
--    역할 문자열과 무관하게 '본인 partner_id'인 모든 로그인 사용자에 적용됨.
--    따라서 manager 역할도 별도 정책 없이 본인 데이터만 조회 가능(관리자만 전체).
--    (여기서는 추가 정책이 필요 없으며, 확인용 조회만 아래 검증 섹션에 둠)

COMMIT;

-- ═══════════════════════════════════════════════════════════
-- 매니저 계정 연결 방법 (관리자가 1회 수행)
-- ═══════════════════════════════════════════════════════════
-- ① 정리수납사가 앱에서 이메일/비번으로 가입 → profiles에 role='partner' 자동 생성
-- ② 관리자가 그 계정을 매니저로 지정하고 본인 정리수납사 레코드에 연결:
--
--   UPDATE profiles
--   SET role = 'manager',
--       partner_id = (SELECT id FROM partners WHERE name = '<정리수납사 이름>')
--   WHERE id = (SELECT id FROM auth.users WHERE email = '<매니저 이메일>');
--
-- 연결 후 그 계정으로 로그인하면 '매니저 포털'에서 본인 배정·급여만 조회됨.

-- ── 검증 1: 컬럼 추가 확인 ──
SELECT table_name, column_name FROM information_schema.columns
WHERE (table_name = 'assignments' AND column_name = 'visit_time')
   OR (table_name = 'payroll_records' AND column_name = 'payment_status');

-- ── 검증 2: 역할 CHECK에 manager 포함 확인 ──
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint WHERE conname = 'profiles_role_check';

-- ── 검증 3: anon 접근 여전히 차단(0행이어야 함) ──
SELECT count(*) AS anon_policies FROM pg_policies
WHERE schemaname = 'public' AND 'anon' = ANY (roles);
