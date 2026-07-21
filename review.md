# 프로젝트 코드 리뷰

- **코더**: 이경규
- **리뷰어**: 김주병
- **프로젝트**: 파트너스 매칭 매니저
- **리뷰 일자**: 2026-07-21

---

## 프로젝트 루브릭 평가

### 1. 보안을 스스로 점검할 수 있습니다.

> 제출물에 보안상의 문제가 없는지 잘 검토 되어있고, 실제로 문제가 없어야합니다.

**[O] 만족**

| 보안 항목 | 상태 | 근거 |
|---|---|---|
| `.env` 파일 비밀값 격리 | O | `.gitignore`에 `.env`, `.env.local`, `.env.*.local` 포함 |
| Supabase RLS 활성화 | O | `supabase-setup.sql:48-49` — 모든 테이블에 RLS 활성화 |
| 전화번호 정규식 검증 | O | 프론트: `main.js:1210-1212` `validatePhone()` / DB: `supabase-setup.sql:10` CHECK 제약조건 |
| XSS 방지 | O | `main.js:1221-1225` — `esc()` 함수로 모든 사용자 입력 이스케이프 처리 |
| service_role key 미사용 | O | `supabase.js`에서 `VITE_SUPABASE_ANON_KEY`만 사용 |
| 비밀번호 최소 길이 | O | `index.html:87,121` — `minlength="6"` 적용 |
| 에러 메시지 내부 정보 노출 방지 | O | `main.js:95-96` — "Invalid login credentials"를 한국어 메시지로 변환 |

```javascript
// XSS 방지 — main.js:1221-1225
function esc(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// 전화번호 검증 — main.js:1210-1212
function validatePhone(phone) {
  return /^\d{2,3}-\d{3,4}-\d{4}$/.test(phone);
}

// DB 전화번호 제약조건 — supabase-setup.sql:10
phone TEXT NOT NULL CHECK (phone ~ '^\d{2,3}-\d{3,4}-\d{4}$')
```

---

### 2. 실제 동작하는 백엔드 동작을 포함시킬 수 있습니다.

> 실제로 동작하는 백엔드 동작이 의도한 것과 일치합니다.

**[O] 만족**

| 기능 | 상태 | 근거 |
|---|---|---|
| 회원가입/로그인/로그아웃 | O | `auth.js` — Supabase Auth `signInWithPassword`, `signUp`, `signOut` |
| 파트너 CRUD | O | `main.js:252-453` — partners 테이블 REST API 조작 |
| 배정 CRUD (팀장+팀원) | O | `main.js:459-678` — assignments 테이블 조작 |
| 휴무일 관리 | O | `main.js:888-977` — partner_day_offs 테이블 조작 |
| 급여 정산 | O | `main.js:1257-1668` — payroll_records 테이블, 시급x시간+수당 계산 |
| Mock 데이터 모드 | O | `main.js:4-20` — 로컬 개발 시 Supabase 없이 동작 |

```javascript
// 인증 — auth.js:14-21
export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

// 파트너 등록 — main.js:341-343
const { error } = await supabase
  .from('partners')
  .insert([{ name, phone: phone || '', region: region || '', specialty }]);

// 배정 등록 — main.js:626-628
const { error } = await supabase
  .from('assignments')
  .insert([{ leader_id, member_ids, client_name, client_address, assignment_date, notes }]);

// 휴무일 등록 — main.js:918-920
const { error } = await supabase
  .from('partner_day_offs')
  .insert([{ partner_id: partnerId, start_date: startDate, end_date: endDate, reason }]);

// 급여 저장 — main.js:1531-1533
const { error: insError } = await supabase
  .from('payroll_records')
  .insert(records);
```

---

### 3. 프론트엔드와 백엔드가 적절하게 만들어져 동작합니다.

> 서비스가 직관적이고, 의도한 대로 잘 동작합니다.

**[O] 만족**

| 항목 | 상태 | 근거 |
|---|---|---|
| 직관적인 탭 네비게이션 | O | `index.html:204-223` — 4개 탭 (파트너/배정/급여/일정) |
| 대시보드 통계 | O | `index.html:182-200` — 전체 파트너, 활동중, 대기 배정, 완료 건수 |
| 캘린더 뷰 (3종) | O | 배정 달력/휴무 달력/통합 달력으로 시각적 일정 관리 |
| 반응형 디자인 | O | Tailwind CSS `sm:`, `lg:` 브레이크포인트 적용 |
| Toast 알림 피드백 | O | `main.js:1236-1255` — 사용자 액션에 대한 즉각적 피드백 |
| 휴무일-배정 충돌 검증 | O | `main.js:618-624` — 휴무일과 겹치는 파트너 자동 감지 |
| 폰 번호 자동 포맷팅 | O | `main.js:1214-1219` — `010-1234-5678` 형식 자동 적용 |
| 급여 자동 계산 | O | `main.js:1450-1479` — 시급x시간+수당, 3.3% 공제 자동 계산 |

```javascript
// 휴무일-배정 충돌 검증 — main.js:618-624
const allTeamIds = [leader_id, ...member_ids];
const conflicting = getConflictingPartners(allTeamIds, assignment_date);
if (conflicting.length > 0) {
  const names = conflicting.map(c => c.name).join(', ');
  showToast(`휴무일 충돌: ${names}님이 ${assignment_date}에 휴무입니다`, 'error');
  return;
}
```

---

## PRT(Peer Review Template)

### 1. 주어진 문제를 해결하는 완성된 코드가 제출되었나요? (완성도)

**[O] 만족** — 프로젝트 루브릭 3개 항목(보안, 백엔드, 프론트+백엔드)을 모두 만족하며, 퀘스트 문제 요구조건에 해당하는 기능이 모두 구현되어 있다.

**루브릭 3개 중 3개 충족:**

| 루브릭 | 결과 | 핵심 근거 |
|---|---|---|
| 보안 | O | `.env` 격리, RLS, XSS 방지, 전화번호 검증 등 보안 항목 준수 |
| 실제 동작 백엔드 | O | Supabase 인증+CRUD 기능 모두 구현, 의도한 비즈니스 로직과 일치 |
| 프론트+백엔드 동작 | O | 탭 네비게이션, 캘린더, 급여 계산 등 UI/UX가 직관적이고 기능 풍부 |

**완성된 핵심 기능:**

| 기능 | 구현 상태 |
|---|---|
| 파트너 CRUD (등록/수정/삭제/활성비활성/검색) | 완료 (`main.js:252-453`) |
| 배정 관리 (팀장+팀원 선택, 상태 변경, 달력 뷰) | 완료 (`main.js:459-807`) |
| 급여 관리 (시급x시간+수당 계산, 3.3% 공제, 월별 통계) | 완료 (`main.js:1257-1668`) |
| 일정 통합 달력 (휴무+배정 합산) | 완료 (`main.js:1088-1192`) |
| 인증 (로그인/회원가입/로그아웃) | 완료 (`auth.js`) |
| Mock 데이터 모드 (로컬 개발 지원) | 완료 (`main.js:4-20`) |
| Vercel 배포 설정 + README | 완료 (`vercel.json`, `README.md`) |

---

### 2. 프로젝트에 대한 회고가 상세히 기록 되어 있나요? (회고, 정리)

**[X] 미충족** — README.md에 회고 섹션이 없으며, 프로젝트 진행 과정에서의 회고 기록이 전혀 없다.

- [X] **배운 점** — 기록 없음
- [X] **아쉬운 점** — 기록 없음
- [X] **느낀 점** — 기록 없음
- [X] **어려웠던 점** — 기록 없음

**현재 상태:**

`README.md`는 Supabase 설정, Vercel 배포, 보안 체크리스트 등 기술 가이드만 있고, 프로젝트를 진행하면서 겪은 경험과 회고가 전혀 기록되어 있지 않다.

**추천 회고 항목:**

| 항목 | 예시 |
|---|---|
| 배운 점 | Vanilla JS로도 풀스택 앱 구현 가능, Supabase RLS의 중요성, Mock 데이터의 가치 |
| 아쉬운 점 | SQL 스키마와 JS 코드 동기화 미비, main.js 모놀리식 구조, 테스트 부재 |
| 느낀 점 | 프론트엔드만으로도 복잡한 비즈니스 로직(팀 배정, 급여 계산) 구현 가능 |
| 어려웠던 점 | 팀 배정(팀장+팀원) 데이터 모델링, 캘린더 로직 중복, SQL-JS 스키마 동기화 |

---

## 종합 평가

| 항목 | 결과 |
|---|---|
| **프로젝트 루브릭** | |
| 1. 보안 점검 | **O** |
| 2. 실제 동작 백엔드 | **O** |
| 3. 프론트+백엔드 동작 | **O** |
| **PRT** | |
| 1. 완성도 | **O** |
| 2. 회고 | **X** |
