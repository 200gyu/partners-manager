-- ═══════════════════════════════════════════════════════════
-- v7 매니저 운영 도구 — 관리자용 계정 연결 RPC (2단계)
-- ═══════════════════════════════════════════════════════════
-- 전제: v5(RBAC) + v6(manager 역할) 적용됨.
-- 관리자가 화면에서 "이메일↔정리수납사"를 연결할 수 있도록 RPC를 제공.
-- 클라이언트는 auth.users를 직접 조회할 수 없으므로, security definer 함수로
-- 안전하게 처리하고 내부에서 is_admin()으로 권한을 강제한다.
-- 실행: Supabase SQL Editor에서 실행.
-- ═══════════════════════════════════════════════════════════

BEGIN;

-- ── 매니저 연결: 이메일로 가입된 계정을 매니저로 지정 + 정리수납사 연결 ──
CREATE OR REPLACE FUNCTION link_manager(p_email text, p_partner_id uuid)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid;
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION '관리자만 수행할 수 있습니다'; END IF;
  SELECT id INTO v_uid FROM auth.users WHERE lower(email) = lower(trim(p_email));
  IF v_uid IS NULL THEN
    RETURN 'NO_USER';  -- 해당 이메일로 가입된 계정 없음 (먼저 가입 필요)
  END IF;
  INSERT INTO profiles (id, role, partner_id)
  VALUES (v_uid, 'manager', p_partner_id)
  ON CONFLICT (id) DO UPDATE SET role = 'manager', partner_id = EXCLUDED.partner_id;
  RETURN 'OK';
END; $$;

-- ── 매니저 연결 해제: 다시 일반(partner)로, 연결 제거 ──
CREATE OR REPLACE FUNCTION unlink_manager(p_uid uuid)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION '관리자만 수행할 수 있습니다'; END IF;
  UPDATE profiles SET role = 'partner', partner_id = NULL WHERE id = p_uid;
  RETURN 'OK';
END; $$;

-- ── 연결된 매니저 목록 (이메일 + 연결된 정리수납사명) ──
CREATE OR REPLACE FUNCTION list_manager_accounts()
RETURNS TABLE (uid uuid, email text, role text, partner_id uuid, partner_name text)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id, u.email::text, p.role, p.partner_id, pt.name
  FROM profiles p
  JOIN auth.users u ON u.id = p.id
  LEFT JOIN partners pt ON pt.id = p.partner_id
  WHERE is_admin() AND p.role IN ('manager', 'leader')
  ORDER BY u.email;
$$;

-- 로그인 사용자가 호출할 수 있도록 실행 권한 부여 (내부에서 is_admin() 강제)
GRANT EXECUTE ON FUNCTION link_manager(text, uuid)   TO authenticated;
GRANT EXECUTE ON FUNCTION unlink_manager(uuid)        TO authenticated;
GRANT EXECUTE ON FUNCTION list_manager_accounts()     TO authenticated;

COMMIT;

-- ── 검증: 함수 생성 확인 ──
SELECT proname FROM pg_proc
WHERE proname IN ('link_manager', 'unlink_manager', 'list_manager_accounts')
ORDER BY proname;
