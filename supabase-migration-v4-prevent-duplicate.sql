-- ═══════════════════════════════════════════════════════════
-- v4 중복 배정 방지 — DB 차원의 원자적 방어
-- ═══════════════════════════════════════════════════════════
-- 목적: 두 관리자가 동시에(또는 더블클릭으로) 같은 팀장·같은 날짜·같은
--       현장에 배정을 넣는 Race Condition을 DB UNIQUE 인덱스로 차단.
--       앱 레벨에서는 파트너 이중 배정을 경고(override 가능)로 처리하고,
--       완전 동일한 배정 중복은 이 제약이 원자적으로 막는다.
-- 실행: Supabase SQL Editor에서 실행.
-- ═══════════════════════════════════════════════════════════

-- 1) (선택) 기존 중복 데이터 확인 — 결과가 있으면 인덱스 생성 전에 정리 필요
SELECT leader_id, assignment_date, client_name, client_address, count(*)
FROM assignments
GROUP BY leader_id, assignment_date, client_name, client_address
HAVING count(*) > 1;

-- 2) 중복 방지 UNIQUE 인덱스
--    같은 팀장 + 같은 날짜 + 같은 현장(고객명·주소) 조합은 1건만 허용.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_assignment_leader_date_client
  ON assignments (leader_id, assignment_date, client_name, client_address);

-- 확인
SELECT indexname FROM pg_indexes
WHERE tablename = 'assignments' AND indexname = 'uniq_assignment_leader_date_client';
