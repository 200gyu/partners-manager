# PRT(Peer Review Template)

- **코더**: 이경규
- **리뷰어**: 김주병
- **프로젝트**: 파트너스 매칭 매니저
- **리뷰 일자**: 2026-07-21

---

## 루브릭 평가 기준별 검토

### 1) 보안을 스스로 점검할 수 있습니다.

**[O] 제출물에 보안상의 문제가 없는지 잘 검토 되어있고, 실제로 문제가 없어야합니다.**

보안 항목이 README.md에 체크리스트로 체계적으로 정리되어 있으며, 실제 코드에서도 준수되고 있다.

**근거:**

| 보안 항목 | 상태 | 근거 코드/위치 |
|---|---|---|
| `.env` 파일 비밀값 격리 | O | `.gitignore`에 `.env`, `.env.local`, `.env.*.local` 포함 (`:3-5`) |
| Supabase RLS 활성화 | O | `supabase-setup.sql:48-49` — `ALTER TABLE partners ENABLE ROW LEVEL SECURITY;` |
| 전화번호 정규식 검증 | O | 프론트: `main.js:1210-1212` `validatePhone()` / DB: `supabase-setup.sql:10` `CHECK (phone ~ '^\d{2,3}-\d{3,4}-\d{4}$')` |
| XSS 방지 | O | `main.js:1221-1225` — `esc()` 함수로 모든 사용자 입력 이스케이프 처리 |
| service_role key 미사용 | O | `supabase.js`에서 `VITE_SUPABASE_ANON_KEY`만 사용, service_role key 없음 |
| 비밀번호 최소 길이 | O | `index.html:87` `minlength="6"` / `index.html:121` `minlength="6"` |
| 에러 메시지 노출 제한 | O | `main.js:95-96` — "Invalid login credentials"를 한국어 메시지로 변환하여 내부 에러 노출 방지 |

**보안 관련 개선 사항:**

`supabase-setup.sql`의 RLS 정책이 `anon` 역할에도 쓰기를 허용하고 있어, 인증 없이 누구나 데이터 수정/삭제가 가능하다. `supabase-migration-v2.sql`에서 이를 `authenticated` 전용으로 강화하는 마이그레이션이 제공되나, 실제 Supabase 프로젝트에 v2 마이그레이션이 적용되어야 보안이 완료된다.

```sql
-- supabase-setup.sql:55-64 — 현 정책 (학습용, anon 쓰기 허용)
CREATE POLICY "Allow insert partners"
  ON partners FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- supabase-migration-v2.sql:27-30 — 개선 정책 (인증 사용자만)
CREATE POLICY "Authenticated insert partners"
  ON partners FOR INSERT
  TO authenticated
  WITH CHECK (true);
```

---

### 2) 실제 동작하는 백엔드 동작을 포함시킬 수 있습니다.

**[△] 실제로 동작하는 백엔드 동작이 의도한 것과 일치합니다.**

Supabase 기반 백엔드 인증 및 CRUD 기능이 구현되어 있으나, SQL 스키마와 JS 코드 간 불일치로 인해 실제 연결 시 런타임 에러가 발생한다.

**의도한 대로 동작하는 부분:**

| 기능 | 상태 | 근거 |
|---|---|---|
| 회원가입/로그인/로그아웃 | O | `auth.js` — Supabase Auth `signInWithPassword`, `signUp`, `signOut` 사용 |
| 파트너 CRUD | O | `main.js:252-453` — Supabase REST API로 partners 테이블 조작 |
| 배정 CRUD | O | `main.js:459-678` — assignments 테이블 조작, 리더+팀원 선택 |
| 휴무일 관리 | O | `main.js:888-977` — partner_day_offs 테이블 조작 |
| 급여 정산 | O | `main.js:1257-1668` — payroll_records 테이블 조작, 시급x시간+수당 계산 |
| Mock 데이터 모드 | O | `main.js:4-20` — 로컬 개발 시 Supabase 없이 동작 |

**문제가 되는 부분:**

```javascript
// main.js:468 — JS는 leader_id를 사용
.select('*, leader:partners!leader_id(name, region)')

// main.js:628 — JS는 leader_id, member_ids를 사용
.insert([{ leader_id, member_ids, client_name, client_address, assignment_date, notes }])

// main.js:893 — JS는 partner_day_offs 테이블을 참조
.from('partner_day_offs')

// main.js:1309 — JS는 payroll_records 테이블을 참조
.from('payroll_records')
```

그러나 `supabase-setup.sql`의 assignments 테이블은 `partner_id` 컬럼 하나만 존재하고, `partner_day_offs`, `payroll_records` 테이블은 SQL 파일 어디에도 CREATE 문이 없다. v2 마이그레이션에도 이 테이블들이 추가되지 않아 Supabase 연결 시 모든 배정/휴무/급여 관련 기능에서 에러가 발생한다.

---

### 3) 프론트엔드와 백엔드가 적절하게 만들어져 동작합니다.

**[O] 서비스가 직관적이고, 의도한 대로 잘 동작합니다.**

UI/UX 설계가 직관적이며, 탭 네비게이션, 대시보드 통계, 캘린더 뷰 등 사용자 경험 측면에서 잘 구성되어 있다.

**근거:**

- **직관적인 탭 네비게이션**: `index.html:204-223` — 파트너 관리/배정 현황/급여 관리/일정 관리 4개 탭
- **대시보드 통계**: `index.html:182-200` — 전체 파트너, 활동중, 대기 배정, 이번달 완료 한눈에 파악
- **캘린더 뷰**: 배정 달력/휴무 달력/통합 달력 3종 제공으로 시각적 일정 관리
- **반응형 디자인**: Tailwind CSS 사용, `sm:`, `lg:` 브레이크포인트 적용 (`index.html:231`, `main.js:585` 등)
- **피드백 시스템**: `main.js:1236-1255` — Toast 알림으로 사용자 액션에 대한 즉각적 피드백
- **모달 상세보기**: `main.js:813-861` — 캘린더에서 클릭 시 배정 상세 정보 모달 표시
- **휴무일-배정 충돌 검증**: `main.js:618-624` — 배정 등록 시 휴무일과 겹치는 파트너 자동 감지
- **폰 번호 자동 포맷팅**: `main.js:1214-1219` — 입력 시 자동으로 `010-1234-5678` 형식 적용
- **로컬 개발 Mock 모드**: `main.js:4-20` — Supabase 없이도 로컬에서 기능 테스트 가능

---

## PRT(Peer Review Template) 항목별 평가

### 1. 주어진 문제를 해결하는 완성된 코드가 제출되었나요? (완성도)

**[O] 부분 만족** — 핵심 기능은 모두 구현되어 있으나, SQL 스키마 불일치로 인해 실제 배포 환경에서 런타임 에러가 발생할 수 있다.

**완성된 부분:**

| 기능 | 구현 완성도 | 위치 |
|---|---|---|
| 파트너 CRUD (등록/수정/삭제/활성비활성/검색) | 완료 | `main.js:252-453` |
| 배정 관리 (팀장+팀원 선택, 상태 변경) | 완료 | `main.js:459-678` |
| 배정 달력 뷰 | 완료 | `main.js:725-807` |
| 급여 관리 (시급x시간+수당 계산, 3.3% 공제) | 완료 | `main.js:1257-1668` |
| 일정 통합 달력 (휴무+배정 합산) | 완료 | `main.js:1088-1192` |
| 휴무일 관리 + 달력 | 완료 | `main.js:877-1054` |
| 인증 (로그인/회원가입/로그아웃) | 완료 | `auth.js` + `main.js:61-162` |
| Mock 데이터 모드 (로컬 개발 지원) | 완료 | `main.js:4-20` |
| Vercel 배포 설정 + README | 완료 | `vercel.json`, `README.md` |
| 대시보드 통계 | 완료 | `main.js:232-246` |

**미완성/문제 부분:**

| 항목 | 심각도 | 설명 |
|---|---|---|
| SQL-JS 스키마 불일치 | 높음 | `supabase-setup.sql`의 `assignments` 테이블은 `partner_id` 컬럼 하나인데, JS는 `leader_id` + `member_ids` 사용. v2 마이그레이션에도 미추가 |
| `partner_day_offs` 테이블 누락 | 높음 | JS에서 `partner_day_offs` 참조하나 SQL 파일에 CREATE 문 없음 |
| `payroll_records` 테이블 누락 | 높음 | JS에서 `payroll_records` 참조하나 SQL 파일에 CREATE 문 없음 |
| `pg` 의존성 미사용 | 낮음 | `package.json`에 `pg` 등록되어 있으나 코드 어디에서도 import 없음 |

---

### 2. 프로젝트에서 핵심적인 부분에 대한 설명이 주석(닥스트링) 및 마크다운 형태로 잘 기록되어있나요? (설명)

**[△] 부분 만족** — README는 잘 작성되어 있으나, 코드 내 주석이 부족하다.

- [ ] **모델 선정 이유** — 해당 없음 (ML 프로젝트가 아닌 웹 앱 프로젝트). 대신 **기술 스택 선정 이유** (왜 Supabase? 왜 Vanilla JS? 왜 Tailwind CDN?)가 기록되면 좋겠다.

- [ ] **Metrics 선정 이유** — 해당 없음 (ML 프로젝트가 아닌 웹 앱 프로젝트).

- [ ] **Loss 선정 이유** — 해당 없음 (ML 프로젝트가 아닌 웹 앱 프로젝트).

**잘 작성된 부분:**

- `README.md` — 기술 스택, 설정 단계, 배포 방법, 보안 체크리스트가 체계적으로 정리
- `src/main.js:4-20` — Mock 데이터 모드 전환 로직에 대한 설명 주석
- SQL 파일 — 각 섹션이 구분자와 함께 주석으로 설명
- `supabase-migration-v2.sql:1-10` — 변경사항이 목록으로 정리

**개선이 필요한 부분:**

- `main.js` 1668줄 중 섹션 구분 주석(`// =====`)만 있고, **함수 단위 JSDoc/docstring 없음**
- `auth.js` — 각 함수가 어떤 역할을 하는지 알 수 있으나 docstring 부재
- 아키텍처 선택 이유 기록 없음

```javascript
// main.js:57-59 — 섹션 구분 주석만 존재
// ═══════════════════════════════════════
//  인증 UI
// ═══════════════════════════════════════

// 개선 예시:
/**
 * 로그인/회원가입 폼 이벤트 핸들러를 설정한다.
 * - 이메일/비밀번호 기반 Supabase Auth 사용
 * - 로그인 실패 시 한국어 에러 메시지 표시
 * - 회원가입 시 이메일 확인 메일 발송
 */
function setupAuthForms() { ... }
```

---

### 3. 체크리스트에 해당하는 항목들을 모두 수행하였나요? (문제 해결)

> 참고: 해당 템플릿은 ML 프로젝트용이나, 이 웹 애플리케이션 프로젝트에 맞게 변환하여 평가합니다.

- [ ] **데이터를 분할하여 프로젝트를 진행했나요? (train, validation, test 데이터로 구분)**
  - **N/A** — 웹 애플리케이션 프로젝트로 ML 데이터 분할에 해당하지 않음

- [ ] **하이퍼파라미터를 변경해가며 여러 시도를 했나요? (learning rate, dropout rate, unit, batch size, epoch 등)**
  - **N/A** — 해당 없음. 대신 **UI/UX 반복 개선**, **Supabase RLS 정책 변경**, **API 호출 방식 변경** 등의 시도가 있었으면 좋겠다.

- [ ] **각 실험을 시각화하여 비교하였나요?**
  - **부분 충족** — 캘린더 뷰와 급여 통계 대시보드는 있으나, 기술적 의사결정 비교 시각화는 없음

  ```javascript
  // main.js:1548-1668 — 급여 통계 대시보드는 시각화가 잘 되어 있음
  // 파트너별 근무 건수, 총 근무시간, 평균 시급, 총 급여, 공제액, 차인지급액을
  // 테이블(PC)과 카드(모바일) 두 가지 뷰로 제공
  ```

- [ ] **모든 실험 결과가 기록되었나요?**
  - **미충족** — Git 커밋 로그만으로는 의사결정 과정 파악 어려움. 왜 Vanilla JS를 선택했는지, 왜 Supabase를 선택했는지 등의 기록이 없음

**추가적으로 수행했으면 좋은 시도:**

- CORS, RLS 정책 변경 등의 트러블슈팅 기록
- Vanilla JS vs React 등 프레임워크 비교 기록
- Supabase vs Firebase 등 BaaS 비교 기록

---

### 4. 프로젝트에 대한 회고가 상세히 기록 되어 있나요? (회고, 정리)

**[X] 미충족** — README에 회고 섹션이 없다.

현재 `README.md`는 설정/배포 가이드만 있고, 회고가 전혀 기록되어 있지 않다.

- [ ] **배운 점** — 기록 없음
- [ ] **아쉬운 점** — 기록 없음
- [ ] **느낀 점** — 기록 없음
- [ ] **어려웠던 점** — 기록 없음

**추천 회고 항목:**

- Vanilla JS + Supabase 조합을 선택하게 된 이유와 장단점
- Mock 데이터 모드를 도입하게 된 계기와 개발 생산성 향상
- SQL 스키마와 JS 코드 간 동기화 유지의 어려움
- 1668줄 모놀리식 파일의 한계와 리팩토링 방향
- 팀 배정(팀장+팀원) 비즈니스 로직을 설계하면서 겪은 어려움

---

## 코드 품질 분석

### 1. main.js 모놀리식 구조 (심각도: 높음)

1668줄이 하나의 파일에 모든 로직이 집중되어 있다.

```
main.js (1668줄)
  인증 UI (~140줄)
  탭 전환 (~25줄)
  대시보드 통계 (~20줄)
  파트너 CRUD (~200줄)
  배정 CRUD (~220줄)
  캘린더 뷰 x3 (~450줄)  ← 반복 코드
  휴무 관리 (~200줄)
  급여 관리 (~350줄)
  통합 캘린더 (~150줄)
  유틸리티 (~50줄)
  윈도우 전역 함수 (~80줄)
```

### 2. window.* 전역 함수 오염 (심각도: 높음)

약 15개의 함수가 `window`에 직접 바인딩되어 있다:

```javascript
// main.js:356 — window.togglePartnerActive
window.togglePartnerActive = async function (id, isActive) { ... };
// main.js:370 — window.deletePartner
window.deletePartner = async function (id, name) { ... };
// main.js:387 — window.editPartner
window.editPartner = function (id) { ... };
// main.js:428 — window.savePartnerEdit
window.savePartnerEdit = async function (id) { ... };
// main.js:451 — window.cancelPartnerEdit
window.cancelPartnerEdit = function () { ... };
// main.js:642 — window.updateStatus
window.updateStatus = async function (id, newStatus) { ... };
// main.js:660 — window.deleteAssignment
window.deleteAssignment = async function (id) { ... };
// main.js:676 — window.filterAssignments
window.filterAssignments = function () { ... };
// main.js:685 — window.switchAssignmentView
window.switchAssignmentView = function (view) { ... };
```

### 3. 캘린더 코드 3중 중복 (심각도: 중간)

배정 달력(`renderCalendar`), 휴무 달력(`renderDayOffCalendar`), 통합 달력(`renderUnifiedCalendar`)이 거의 동일한 로직을 복붙하여 3개 존재한다 (~150줄씩).

### 4. 테스트 없음 (심각도: 높음)

테스트 파일이 전혀 없다. `auth.js`, 유틸리티 함수 등은 단위 테스트가 가능하다.

### 5. linting/formatting 도구 없음 (심각도: 중간)

ESLint, Prettier 등 코드 품질 도구가 설정되어 있지 않다.

---

## 종합 평가

| 항목 | 점수 | 비고 |
|---|---|---|
| 보안 | 8/10 | RLS, XSS 방지, 환경변수 격리 양호. anon 쓰기 허용 정책 주의 |
| 백엔드 동작 | 5/10 | Supabase 인증+CRUD 구현. SQL 스키마 불일치로 런타임 에러 위험 |
| 프론트엔드+백엔드 | 7/10 | UI/UX 직관적, 기능 풍부. 스키마 불일치만 해소되면 양호 |
| 완성도 | 6/10 | 핵심 기능 모두 구현됨. SQL-JS 스키마 불일치가 치명적 |
| 설명/문서화 | 6/10 | README 우수, 코드 내 주석 부족, 회고 없음 |
| 문제 해결 기록 | 3/10 | 트러블슈팅 기록 없음, Git 로그만 존재 |
| 회고 | 1/10 | 회고 없음 |
| 코드 품질 | 4/10 | 모놀리식, 전역 함수, 테스트 없음, 코드 중복 |

---

## 핵심 개선 사항

### 1. SQL 스키마 동기화 (최우선)

`supabase-setup.sql`에 누락된 컬럼/테이블을 추가해야 한다:

```sql
-- assignments 테이블: partner_id → leader_id + member_ids 로 변경
ALTER TABLE assignments DROP COLUMN partner_id;
ALTER TABLE assignments ADD COLUMN leader_id UUID REFERENCES partners(id);
ALTER TABLE assignments ADD COLUMN member_ids JSONB DEFAULT '[]'::jsonb;

-- partner_day_offs 테이블 생성
CREATE TABLE IF NOT EXISTS partner_day_offs (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  partner_id  UUID NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  start_date  DATE NOT NULL,
  end_date    DATE NOT NULL,
  reason      TEXT DEFAULT '',
  created_at  TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE partner_day_offs ENABLE ROW LEVEL SECURITY;

-- payroll_records 테이블 생성
CREATE TABLE IF NOT EXISTS payroll_records (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  assignment_id   UUID NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  partner_id      UUID NOT NULL REFERENCES partners(id),
  hourly_rate     INTEGER NOT NULL,
  hours_worked    NUMERIC(4,1) NOT NULL,
  bonus           INTEGER DEFAULT 0,
  field_bonus     INTEGER DEFAULT 0,
  total_amount    INTEGER NOT NULL,
  work_date       DATE NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE payroll_records ENABLE ROW LEVEL SECURITY;

-- RLS 정책 (v2 기준 authenticated 전용)
CREATE POLICY "Authenticated read partner_day_offs"
  ON partner_day_offs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated insert partner_day_offs"
  ON partner_day_offs FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated delete partner_day_offs"
  ON partner_day_offs FOR DELETE TO authenticated USING (true);

CREATE POLICY "Authenticated read payroll_records"
  ON payroll_records FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated insert payroll_records"
  ON payroll_records FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update payroll_records"
  ON payroll_records FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated delete payroll_records"
  ON payroll_records FOR DELETE TO authenticated USING (true);
```

### 2. 회고 작성

README.md에 회고 섹션을 추가:

```markdown
## 회고

### 배운 점
- Vanilla JS로도 풀스택 앱을 만들 수 있다는 자신감
- Supabase RLS 정책의 중요성

### 아쉬운 점
- SQL 스키마와 JS 코드를 동기화하지 못한 점
- 모놀리식 구조로 인한 유지보수 어려움

### 느낀 점
- 프론트엔드만으로도 충분히 복잡한 비즈니스 로직 구현 가능

### 어려웠던 점
- 팀 배정(팀장+팀원) 데이터 모델링
- 캘린더 로직의 중복 제거
```

---

## 참고 링크

- **프로젝트 저장소**: https://github.com/jubyeong-kim/partners-manager
- **Supabase 대시보드**: https://supabase.com/dashboard
- **Vercel 배포**: https://vercel.com
