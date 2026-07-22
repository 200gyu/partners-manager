# 🤝 파트너스 매칭 매니저 — 프로젝트 분석 보고서

> **저장소**: [github.com/200gyu/partners-manager](https://github.com/200gyu/partners-manager)  
> **버전**: 1.0.0  
> **최종 수정**: 2026년 7월  
> **언어 구성**: JavaScript 62.6% | HTML 34.2% | PLpgSQL 3.2%

---

## 📋 프로젝트 개요

프리랜서 정리수납 파트너의 **매칭/배정**을 관리하는 웹 애플리케이션입니다.  
(주)케이제이파트너스의 실무 운영 시스템으로, 제주 지역 정리수납 서비스 업체에서 사용합니다.

### 핵심 기능

| 기능 | 설명 |
|------|------|
| 🔐 **인증 시스템** | 이메일/비밀번호 기반 로그인/회원가입 (Supabase Auth) |
| 👤 **파트너 관리** | 프리랜서 파트너 등록, 수정, 비활성화, 삭제 |
| 📋 **배정 관리** | 팀장+팀원 구성, 현장 배정, 상태 관리 (대기→완료→종료) |
| 💰 **급여 정산** | 배정별 급여 입력, 3.3% 공제 계산, 월별 통계 |
| 📅 **일정 관리** | 배정/휴무 통합 달력 뷰 |
| 🗓️ **휴무일 관리** | 파트너별 휴무일 등록 및 배정 시 충돌 방지 |

---

## 🏗️ 기술 스택

### Frontend
```
├── HTML5                    # 단일 페이지 애플리케이션
├── Tailwind CSS (CDN)       # 유틸리티 기반 스타일링
├── Vanilla JavaScript       # 프레임워크 없는 순수 JS
└── Vite 6.3+               # 빌드 도구
```

### Backend & Database
```
├── Supabase
│   ├── PostgreSQL           # 관계형 데이터베이스
│   ├── REST API             # 자동 생성 API
│   ├── Row Level Security   # 보안 정책
│   └── Auth                 # 인증 서비스
```

### 배포
```
├── Vercel                   # 프론트엔드 호스팅
└── Supabase                 # 백엔드 인프라
```

### 의존성 (package.json)
| 패키지 | 버전 | 용도 |
|--------|------|------|
| `@supabase/supabase-js` | ^2.49.0 | Supabase 클라이언트 |
| `vite` | ^6.3.0 | 빌드 도구 |
| `xlsx` | ^0.18.5 | 엑셀 파일 처리 |
| `pg` | ^8.22.0 | PostgreSQL 클라이언트 |

---

## 📁 프로젝트 구조

```
partners-manager/
├── index.html                    # 메인 HTML (단일 페이지)
├── package.json                  # 의존성 및 스크립트
├── vite.config.js                # Vite 설정
├── vercel.json                   # Vercel 배포 설정
├── .env.example                  # 환경변수 템플릿
├── .gitignore                    # Git 제외 파일
├── README.md                     # 프로젝트 설명서
├── review.md                     # 리뷰 문서
│
├── src/
│   ├── main.js                   # 메인 앱 로직 (67KB)
│   ├── auth.js                   # 인증 관련 함수
│   └── supabase.js               # Supabase 클라이언트 초기화
│
├── supabase-setup.sql            # 초기 DB 스키마 + RLS
└── supabase-migration-v2.sql     # 보안 강화 마이그레이션
```

---

## 🗄️ 데이터베이스 설계

### 테이블 구조

#### 1. `partners` 테이블 (프리랜서 파트너)

| 컬럼 | 타입 | 제약조건 | 설명 |
|------|------|----------|------|
| `id` | UUID | PK, 기본값 `gen_random_uuid()` | 고유 식별자 |
| `name` | TEXT | NOT NULL, 2~50자 | 파트너 이름 |
| `phone` | TEXT | NOT NULL, 정규식 검증 | 전화번호 |
| `region` | TEXT | NOT NULL, 2자 이상 | 활동 지역 |
| `specialty` | TEXT | 기본값 '정리수납' | 전문 분야 |
| `is_active` | BOOLEAN | 기본값 true | 활성화 상태 |
| `created_at` | TIMESTAMPTZ | 기본값 now() | 생성 시간 |

#### 2. `assignments` 테이블 (배정 기록)

| 컬럼 | 타입 | 제약조건 | 설명 |
|------|------|----------|------|
| `id` | UUID | PK | 고유 식별자 |
| `partner_id` | UUID | FK → partners.id, CASCADE | 파트너 참조 |
| `client_name` | TEXT | NOT NULL, 2자 이상 | 고객명 |
| `client_address` | TEXT | NOT NULL | 현장 주소 |
| `assignment_date` | DATE | NOT NULL | 배정 날짜 |
| `status` | TEXT | 기본값 '대기', CHECK 제약조건 | 상태 (대기/완료/종료) |
| `notes` | TEXT | 기본값 '' | 메모 |
| `created_at` | TIMESTAMPTZ | 기본값 now() | 생성 시간 |
| `updated_at` | TIMESTAMPTZ | 기본값 now() | 수정 시간 |

#### 3. `partner_day_offs` 테이블 (휴무일)

| 컬럼 | 타입 | 설명 |
|------|------|------|
| `id` | UUID | PK |
| `partner_id` | UUID | FK → partners.id |
| `start_date` | DATE | 휴무 시작일 |
| `end_date` | DATE | 휴무 종료일 |
| `reason` | TEXT | 휴무 사유 |

#### 4. `payroll_records` 테이블 (급여 기록)

| 컬럼 | 타입 | 설명 |
|------|------|------|
| `id` | UUID | PK |
| `assignment_id` | UUID | FK → assignments.id |
| `partner_id` | UUID | FK → partners.id |
| `work_date` | DATE | 근무일 |
| `hours` | NUMERIC | 근무 시간 |
| `hourly_rate` | NUMERIC | 시급 |
| `total_pay` | NUMERIC | 총 급여 |
| `deduction` | NUMERIC | 공제액 (3.3%) |
| `net_pay` | NUMERIC | 실지급액 |

---

## 🔒 보안 체크리스트

| 항목 | 상태 | 설명 |
|------|------|------|
| 환경변수 격리 | ✅ | `.env` 파일 사용, `.gitignore`에 포함 |
| RLS 활성화 | ✅ | 모든 테이블에 Row Level Security 적용 |
| 전화번호 검증 | ✅ | 프론트 + DB CHECK 제약조건 (`^\d{2,3}-\d{3,4}-\d{4}$`) |
| XSS 방지 | ✅ | `esc()` 함수로 텍스트 이스케이프 처리 |
| 키 노출 방지 | ✅ | `VITE_` 접두사로 anon key만 사용 |

### RLS 정책 (v2 마이그레이션)

```sql
-- 인증된 사용자만 CRUD 가능
-- anon 역할은 읽기만 허용 (선택적으로 제거 가능)
CREATE POLICY "Authenticated read partners" ON partners FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated insert partners" ON partners FOR INSERT TO authenticated WITH CHECK (true);
-- ... (전체 CRUD 정책)
```

---

## 🎨 UI/UX 설계

### 화면 구성

```
┌─────────────────────────────────────────────────────┐
│  로그인 화면                                          │
│  ┌─────────────────────────────────────────────┐   │
│  │  [KJ] 로고                                  │   │
│  │  주식회사 케이제이파트너스                      │   │
│  │  이메일: [_______________]                   │   │
│  │  비밀번호: [_______________]                 │   │
│  │  [로그인]                                    │   │
│  │  처음이신가요? 관리자 계정 생성                 │   │
│  └─────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│  메인 헤더  [KJ] 파트너스 매칭 매니저  [로그아웃]      │
├─────────────────────────────────────────────────────┤
│  대시보드                                            │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐              │
│  │전체  │ │활동중│ │대기  │ │이번달│              │
│  │파트너│ │      │ │배정  │ │완료  │              │
│  └──────┘ └──────┘ └──────┘ └──────┘              │
├─────────────────────────────────────────────────────┤
│  [👤 파트너 관리] [📋 배정 현황] [💰 급여] [📅 일정]  │
├─────────────────────────────────────────────────────┤
│                                                     │
│  (선택된 탭의 콘텐츠)                                 │
│                                                     │
└─────────────────────────────────────────────────────┘
```

### 디자인 시스템

- **브랜드 컬러**: `#1e3a5f` (다크 블루) ~ `#3b82f6` (라이트 블루)
- **폰트**: Pretendard, Apple SD Gothic Neo, Malgun Gothic
- **컴포넌트**: 과 모서리 (`rounded-xl`, `rounded-2xl`), 미묘한 그림자, 그라데이션
- **애니메이션**: `fadeIn` 트랜지션, 토스트 알림

---

## 🔧 주요 기능 상세

### 1. 파트너 관리

```javascript
// CRUD 작업
loadPartners()      // 파트너 목록 로드
handleAddPartner()  // 새 파트너 등록
editPartner()       // 파트너 정보 수정
togglePartnerActive() // 활성화/비활성화 전환
deletePartner()     // 파트너 삭제 (관련 배정도 함께 삭제)
```

**전화번호 자동 포맷팅**:
- 입력: `01012345678` → 출력: `010-1234-5678`

### 2. 배정 관리

```javascript
// 팀 구성
- 팀장: 1명 필수 선택
- 팀원: 0~N명 선택 (팀장과 동일 인물 자동 제외)

// 상태 관리
대기 → 완료 → 종료

// 휴무일 충돌 검사
배정 등록 시 해당 날짜에 휴무인 파트너가 있는지 자동 확인
```

### 3. 달력 뷰

- **배정 달력**: 날짜별 배정 현황 표시
- **휴무 달력**: 파트너별 휴무일 표시
- **통합 달력**: 배정 + 휴무 동시 표시

```
일  월  화  수  목  금  토
 1   2   3   4   5   6   7
 8   9  10  11  12  13  14
15  16  17  18  19  20  21
22  23  24  25  26  27  28
```

### 4. 급여 정산

```
근무 건수 × 시급 = 총 급여
총 급여 × 3.3% = 공제액 (4대 보험)
총 급여 - 공제액 = 실지급액
```

---

## 🚀 배포 방법

### 로컬 개발

```bash
# 1. 저장소 복제
git clone https://github.com/200gyu/partners-manager.git
cd partners-manager

# 2. 환경변수 설정
cp .env.example .env
# .env 파일에 Supabase 정보 입력

# 3. 의존성 설치 및 실행
npm install
npm run dev
```

### Vercel 배포

```bash
# 방법 1: CLI
npm i -g vercel
vercel

# 방법 2: GitHub 연동 (추천)
# 1. GitHub에 push
# 2. vercel.com에서 Import Project
# 3. Environment Variables 설정
# 4. Deploy 클릭
```

### 환경변수

```env
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJI...your-anon-key
```

---

## 📊 코드 분석

### 파일별 역할

| 파일 | 크기 | 설명 |
|------|------|------|
| `src/main.js` | 67KB | 전체 앱 로직 (CRUD, UI, 상태 관리) |
| `index.html` | - | 단일 페이지 HTML + Tailwind CSS |
| `src/auth.js` | 886B | Supabase Auth 래퍼 |
| `src/supabase.js` | 385B | Supabase 클라이언트 초기화 |

### 아키텍처 패턴

```
┌─────────────────────────────────────────────────┐
│                   Presentation                   │
│         (HTML + Tailwind CSS + Vanilla JS)       │
├─────────────────────────────────────────────────┤
│                  Application                     │
│              (main.js - 상태 관리)               │
├─────────────────────────────────────────────────┤
│                   Data Access                    │
│           (Supabase Client + REST API)          │
├─────────────────────────────────────────────────┤
│                   Database                       │
│           (PostgreSQL + RLS + 트리거)           │
└─────────────────────────────────────────────────┘
```

### Mock Data 시스템

로컬 개발 시 `mockData.js` 파일을 통해 실제 Supabase 없이 테스트 가능:
- 개발 모드(`import.meta.env.DEV`)에서만 활성화
- `MOCK_PARTNERS`, `MOCK_ASSIGNMENTS`, `MOCK_PAYROLL_RECORDS` 제공
- 운영 빌드에는 자동 제외

---

## 💡 개선 제안

### 기술적 개선

| 우선순위 | 제안 | 설명 |
|----------|------|------|
| 🔴 높음 | **모듈 분리** | `main.js`를 기능별 모듈로 분리 (파트너, 배정, 급여 등) |
| 🔴 높음 | **TypeScript 전환** | 타입 안전성 확보 |
| 🟡 중간 | **상태 관리 라이브러리** | 복잡도 증가 시 상태 관리 도입 고려 |
| 🟡 중간 | **테스트 코드 작성** | 단위 테스트 및 E2E 테스트 |
| 🟢 낮음 | **PWA 지원** | 오프라인 접근성 확보 |

### 기능적 개선

| 우선순위 | 제안 | 설명 |
|----------|------|------|
| 🔴 높음 | **알림 시스템** | 배정 상태 변경 시 이메일/SMS 알림 |
| 🔴 높음 | **데이터 내보내기** | 엑셀/PDF 급여 명세서 출력 |
| 🟡 중간 | **다중 사용자 역할** | 관리자/파트너 권한 분리 |
| 🟡 중간 | **매칭 자동화** | 지역/전문분야 기반 파트너 자동 추천 |
| 🟢 낮음 | **모바일 앱** | React Native 또는 Flutter 앱 개발 |

### 보안 개선

| 항목 | 설명 |
|------|------|
| 인증 강화 | 비밀번호 정책 강화, 2FA 도입 |
| 감사 로그 | 모든 CRUD 작업에 대한 로그 기록 |
| 데이터 백업 | 자동 백업 및 복구 체계 구축 |

---

## 📈 프로젝트 통계

```
총 커밋 수:        20개
기여자 수:         1명 (200gyu)
 Stars:           0개
 Forks:           1개
 라이선스:          미지정
```

---

## 🎯 결론

`partners-manager`는 제주 지역 정리수납 서비스 업체를 위한 **실무형 관리 시스템**입니다.

### 강점
- ✅ 심플하고 직관적인 UI/UX
- ✅ Supabase를 활용한 빠른 프로토타이핑
- ✅ 보안 고려사항 적용 (RLS, XSS 방지)
- ✅ 로컬 개발 환경 지원 (Mock Data)
- ✅ Vercel 배포 용이

### 과제
- ⚠️ 단일 파일 구조로 인한 유지보수 어려움
- ⚠️ 테스트 코드 부재
- ⚠️ 타입 안전성 미흡
- ⚠️ 확장성 제한

이 프로젝트는 소규모 비즈니스의 니즈를 빠르게 충족하는 **MVP(Minimum Viable Product)**로, 향후 기능 확장과 코드 품질 개선이 필요합니다.

---

*본 분석 보고서는 2026년 7월 22일 기준으로 작성되었습니다.*
