-- ============================================================
-- 파트너스 매칭 매니저 — Supabase 테이블 & RLS 설정
-- Supabase Dashboard > SQL Editor 에서 실행하세요.
-- ============================================================

-- 1. partners 테이블 (프리랜서 파트너 정보)
CREATE TABLE IF NOT EXISTS partners (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name        TEXT NOT NULL CHECK (char_length(name) >= 2 AND char_length(name) <= 50),
  phone       TEXT NOT NULL CHECK (phone ~ '^\d{2,3}-\d{3,4}-\d{4}$'),
  region      TEXT NOT NULL CHECK (char_length(region) >= 2),
  specialty   TEXT DEFAULT '정리수납',
  is_active   BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- 2. assignments 테이블 (현장 매칭/배정 기록)
CREATE TABLE IF NOT EXISTS assignments (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  partner_id      UUID NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  client_name     TEXT NOT NULL CHECK (char_length(client_name) >= 2),
  client_address  TEXT NOT NULL,
  assignment_date DATE NOT NULL,
  status          TEXT NOT NULL DEFAULT '대기'
                  CHECK (status IN ('대기', '완료', '종료')),
  notes           TEXT DEFAULT '',
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

-- 3. updated_at 자동 갱신 트리거
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON assignments
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- 4. RLS (Row Level Security) 활성화
-- ============================================================
ALTER TABLE partners    ENABLE ROW LEVEL SECURITY;
ALTER TABLE assignments ENABLE ROW LEVEL SECURITY;

-- 5. RLS 정책 — anon 키(서비스 역할)에 대한 CRUD 허용
--    실무에서는 auth.uid() 기반 정책으로 교체합니다.
--    여기서는 학습용으로 anon 역할에 제한적 허용.

-- partners: 읽기는 허용, 쓰기는 service_role 또는 anon
CREATE POLICY "Allow read partners"
  ON partners FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Allow insert partners"
  ON partners FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Allow update partners"
  ON partners FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- assignments: 동일하게 CRUD 허용
CREATE POLICY "Allow read assignments"
  ON assignments FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Allow insert assignments"
  ON assignments FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Allow update assignments"
  ON assignments FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow delete assignments"
  ON assignments FOR DELETE
  TO anon, authenticated
  USING (true);

-- ============================================================
-- 6. 샘플 데이터 (선택사항 — 테스트용)
-- ============================================================
INSERT INTO partners (name, phone, region, specialty) VALUES
  ('김정리', '010-1234-5678', '서울 강서구', '정리수납'),
  ('이수납', '010-2345-6789', '서울 마포구', '정리수납'),
  ('박깔끔', '010-3456-7890', '경기 고양시', '정리수납');
