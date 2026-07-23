-- ═══════════════════════════════════════════════════════════
-- v5 RBAC — 역할 기반 접근 제어 (관리자 / 팀장 / 파트너)
-- ═══════════════════════════════════════════════════════════
-- 이 마이그레이션은 v3(RLS 보안)를 포함·대체합니다. v3를 아직 실행하지
-- 않았어도 이 파일 하나로 anon 차단 + 역할별 접근이 모두 적용됩니다.
--   • 관리자(admin): 전체 CRUD (기존 동작 유지)
--   • 파트너(partner)/팀장(leader): 본인 관련 데이터만 조회 + 본인 휴무 신청
-- 보안 요지: 클라이언트 역할은 UI 라우팅용일 뿐, 실제 데이터 접근은
--            아래 RLS 정책이 auth.uid() 기준으로 서버에서 강제합니다.
-- 실행: Supabase SQL Editor에서 실행.
-- ═══════════════════════════════════════════════════════════

BEGIN;

-- ── 1. profiles 테이블 (로그인 계정 ↔ 역할 ↔ 파트너 연결) ──
CREATE TABLE IF NOT EXISTS profiles (
  id         uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role       text NOT NULL DEFAULT 'partner' CHECK (role IN ('admin', 'leader', 'partner')),
  partner_id uuid REFERENCES partners(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- ── 2. 역할 헬퍼 함수 (security definer로 RLS 재귀 방지) ──
CREATE OR REPLACE FUNCTION is_admin() RETURNS boolean
  LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin');
$$;

CREATE OR REPLACE FUNCTION my_partner_id() RETURNS uuid
  LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT partner_id FROM profiles WHERE id = auth.uid();
$$;

-- ── 3. 신규 가입 시 profiles 자동 생성 (기본 partner, 미연결) ──
CREATE OR REPLACE FUNCTION handle_new_user() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO profiles (id, role) VALUES (NEW.id, 'partner')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ── 4. 기존 로그인 계정을 모두 admin으로 승격 (락아웃 방지) ──
--     현재 로그인 계정은 관리자뿐이므로 안전. 파트너 계정은 이후 생성됨.
INSERT INTO profiles (id, role)
SELECT id, 'admin' FROM auth.users
ON CONFLICT (id) DO UPDATE SET role = 'admin';

-- ── 5. profiles 정책 ──
DROP POLICY IF EXISTS "read own or admin profiles" ON profiles;
CREATE POLICY "read own or admin profiles" ON profiles
  FOR SELECT TO authenticated USING (id = auth.uid() OR is_admin());
DROP POLICY IF EXISTS "admin manage profiles" ON profiles;
CREATE POLICY "admin manage profiles" ON profiles
  FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());

-- ── 6. 데이터 테이블 정책 재정의 (anon 완전 차단 + 역할별) ──
-- 헬퍼: 특정 테이블의 anon/authenticated 정책을 싹 정리하는 함수
CREATE OR REPLACE FUNCTION _drop_policies(tbl regclass) RETURNS void
  LANGUAGE plpgsql AS $$
DECLARE p record;
BEGIN
  FOR p IN SELECT policyname FROM pg_policies
           WHERE schemaname = 'public' AND tablename = tbl::text LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %s', p.policyname, tbl);
  END LOOP;
END; $$;

-- partners: 관리자 전체, 본인은 자기 레코드만 조회
SELECT _drop_policies('partners');
CREATE POLICY "partners admin all" ON partners
  FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "partners self read" ON partners
  FOR SELECT TO authenticated USING (id = my_partner_id());

-- assignments: 관리자 전체, 본인이 팀장/팀원인 배정만 조회
SELECT _drop_policies('assignments');
CREATE POLICY "assignments admin all" ON assignments
  FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "assignments self read" ON assignments
  FOR SELECT TO authenticated
  USING (leader_id = my_partner_id() OR my_partner_id() = ANY (member_ids));

-- payroll_records: 관리자 전체, 본인 급여만 조회
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'payroll_records') THEN
    PERFORM _drop_policies('payroll_records');
    EXECUTE 'CREATE POLICY "payroll admin all" ON payroll_records
             FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin())';
    EXECUTE 'CREATE POLICY "payroll self read" ON payroll_records
             FOR SELECT TO authenticated USING (partner_id = my_partner_id())';
  END IF;
END $$;

-- partner_day_offs: 관리자 전체, 본인 휴무 조회 + 본인 휴무 신청
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'partner_day_offs') THEN
    EXECUTE 'ALTER TABLE partner_day_offs ENABLE ROW LEVEL SECURITY';
    PERFORM _drop_policies('partner_day_offs');
    EXECUTE 'CREATE POLICY "dayoff admin all" ON partner_day_offs
             FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin())';
    EXECUTE 'CREATE POLICY "dayoff self read" ON partner_day_offs
             FOR SELECT TO authenticated USING (partner_id = my_partner_id())';
    EXECUTE 'CREATE POLICY "dayoff self insert" ON partner_day_offs
             FOR INSERT TO authenticated WITH CHECK (partner_id = my_partner_id())';
  END IF;
END $$;

DROP FUNCTION IF EXISTS _drop_policies(regclass);

COMMIT;

-- ── 검증 1: anon(익명)에 열린 정책이 없어야 함 (0행) ──
SELECT tablename, policyname FROM pg_policies
WHERE schemaname = 'public' AND 'anon' = ANY (roles);

-- ── 검증 2: 관리자 계정 확인 ──
SELECT p.role, u.email FROM profiles p JOIN auth.users u ON u.id = p.id ORDER BY p.role;

-- ═══════════════════════════════════════════════════════════
-- 파트너 계정을 실제로 쓰려면 (예시):
--   1) 해당 파트너가 이메일/비번으로 가입 → profiles에 partner 자동 생성
--   2) 관리자가 그 계정을 파트너 레코드에 연결:
--      UPDATE profiles SET partner_id = '<partners.id>'
--      WHERE id = (SELECT id FROM auth.users WHERE email = '<파트너이메일>');
-- ═══════════════════════════════════════════════════════════
