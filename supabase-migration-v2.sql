-- ============================================================
-- 파트너스 매칭 매니저 v2 — 보안 강화 마이그레이션
-- Supabase Dashboard > SQL Editor 에서 실행하세요.
-- ============================================================
-- 변경사항:
--   1. 기존 anon 쓰기 정책 제거
--   2. authenticated 사용자만 CRUD 가능하도록 RLS 정책 교체
--   3. anon은 읽기만 허용 (선택적으로 제거 가능)
--   4. partners 테이블에 DELETE 정책 추가
-- ============================================================

-- ── 1. 기존 RLS 정책 삭제 ──
DROP POLICY IF EXISTS "Allow read partners"     ON partners;
DROP POLICY IF EXISTS "Allow insert partners"   ON partners;
DROP POLICY IF EXISTS "Allow update partners"   ON partners;
DROP POLICY IF EXISTS "Allow read assignments"  ON assignments;
DROP POLICY IF EXISTS "Allow insert assignments" ON assignments;
DROP POLICY IF EXISTS "Allow update assignments" ON assignments;
DROP POLICY IF EXISTS "Allow delete assignments" ON assignments;

-- ── 2. partners 테이블 — 인증 사용자 전용 CRUD ──
CREATE POLICY "Authenticated read partners"
  ON partners FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated insert partners"
  ON partners FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated update partners"
  ON partners FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated delete partners"
  ON partners FOR DELETE
  TO authenticated
  USING (true);

-- ── 3. assignments 테이블 — 인증 사용자 전용 CRUD ──
CREATE POLICY "Authenticated read assignments"
  ON assignments FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated insert assignments"
  ON assignments FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated update assignments"
  ON assignments FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated delete assignments"
  ON assignments FOR DELETE
  TO authenticated
  USING (true);
