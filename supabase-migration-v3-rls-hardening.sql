-- ═══════════════════════════════════════════════════════════
-- v3 RLS 보안 강화 — anon(익명) 접근 완전 차단
-- ═══════════════════════════════════════════════════════════
-- 문제: v2가 authenticated 정책을 추가했으나 v1의 anon 허용 정책을
--       삭제하지 않아, 공개된 anon 키로 로그인 없이 실명 조회·데이터
--       조작이 가능한 상태였음. (RLS는 OR 방식이라 anon 정책 하나만
--       남아도 문이 열림)
-- 조치: v1 anon 정책을 모두 제거하고 authenticated 전용 정책만 유지.
--       Supabase SQL Editor에서 실행하세요.
-- ═══════════════════════════════════════════════════════════

BEGIN;

-- 1. v1 anon 허용 정책 제거 (partners)
DROP POLICY IF EXISTS "Allow read partners"   ON partners;
DROP POLICY IF EXISTS "Allow insert partners" ON partners;
DROP POLICY IF EXISTS "Allow update partners" ON partners;
DROP POLICY IF EXISTS "Allow delete partners" ON partners;

-- 2. v1 anon 허용 정책 제거 (assignments)
DROP POLICY IF EXISTS "Allow read assignments"   ON assignments;
DROP POLICY IF EXISTS "Allow insert assignments" ON assignments;
DROP POLICY IF EXISTS "Allow update assignments" ON assignments;
DROP POLICY IF EXISTS "Allow delete assignments" ON assignments;

-- 3. authenticated 전용 정책 보장 (없으면 생성 — 멱등)
DROP POLICY IF EXISTS "Authenticated all partners" ON partners;
CREATE POLICY "Authenticated all partners" ON partners
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated all assignments" ON assignments;
CREATE POLICY "Authenticated all assignments" ON assignments
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 4. 나머지 테이블도 anon 정책 방어적 제거 + authenticated 전용화
--    (partner_day_offs / payroll_records — 존재 시에만 적용)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'partner_day_offs') THEN
    EXECUTE 'ALTER TABLE partner_day_offs ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "Authenticated all day_offs" ON partner_day_offs';
    EXECUTE 'CREATE POLICY "Authenticated all day_offs" ON partner_day_offs
             FOR ALL TO authenticated USING (true) WITH CHECK (true)';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'payroll_records') THEN
    EXECUTE 'ALTER TABLE payroll_records ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "Authenticated all payroll" ON payroll_records';
    EXECUTE 'CREATE POLICY "Authenticated all payroll" ON payroll_records
             FOR ALL TO authenticated USING (true) WITH CHECK (true)';
  END IF;
END $$;

COMMIT;

-- ═══════════════════════════════════════════════════════════
-- 검증: anon(익명) 역할에 열려 있는 정책이 남아있는지 확인.
-- 결과가 0행이어야 안전합니다.
-- ═══════════════════════════════════════════════════════════
SELECT tablename, policyname, roles, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND 'anon' = ANY (roles);
