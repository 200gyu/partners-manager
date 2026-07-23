🧹 주식회사 케이제이파트너스: 정리/수납 매니지먼트 시스템"

현장의 복잡한 인력 관리부터 정확한 급여 정산까지 한눈에!

"케이제이파트너스가 운영하는 정리·수납 현장 인력 통합 관리 솔루션입니다.📌 
시스템 개요정리/수납 매니지먼트 시스템은 주식회사 케이제이파트너스가 정리수납 전문 매니저들의 일정 배정, 휴무 관리, 급여 정산을 효율적으로 운영하기 위해 구축한 반응형 웹 기반 통합 관리 플랫폼입니다.
과거 엑셀이나 수기로 처리하던 복잡한 현장 인력 배정과 급여 정산 프로세스를 자동화하여, 관리자의 업무 공수를 획기적으로 줄이고 운영 효율성을 극대화합니다.

✨ 핵심 기능 살펴보기
1. 📅 스마트한 파트너 일정 & 휴무 관리현장 배정 관리: 어느 매니저가 어느 고객 집에 언제 방문하는지 직관적으로 관리휴무 신청 및 반영: 매니저들의 휴무 일정을 실시간으로 반영하여 중복 배정 방지
2. 💰 자동화된 급여 & 3.3% 원천징수 정산급여 자동 계산: 파트너의 실제로 근무한 시간과 시급을 바탕으로 급여 자동 산출원천징수 세액 계산: 프리랜서/정리수납 전문 매니저 대상 3.3% 원천징수 세액을 시스템에서 자동으로 계산대량이체 지원: 정산된 급여 데이터를 기반으로 은행 대량이체용 엑셀 파일 생성 기능을 제공하여 금융 업무 처리 시간 단축3. 📱 모바일 지원 & 확장 예정 기능 (진행 중)반응형 웹 디자인: PC뿐만 아니라 현장에서 움직이는 매니저들이 스마트폰(모바일)에서도 편리하게 접속매니저 전용 포털 (확장 중):🔑 매니저 직접 로그인📍 본인의 고객 방문 일정 및 위치 정보 확인💵 건별 지급 예정/완료 급여 조회📊 1달간 올린 월간 누적 수익 대시보드 제공🛠️ 시스템 특징 & 기대 효과구분주요 특징도입 기대 효과급여 업무 자동화시급·근무시간 기반 3.3% 세액 자동 산출 및 대량이체 엑셀 출력정산 오류 방지 및 세무·회계 업무 처리 시간 90% 이상 단축스마트한 인력 운용파트너별 휴무 및 일정 현황을 한눈에 파악누락 없는 현장 인력 배치 및 인력 운영 효율성 극대화매니저 경험 개선매니저가 자신의 일정과 급여를 직접 조회 가능관리자와 매니저 간의 커뮤니케이션 비용 감소 및 신뢰도 향상반응형 웹 환경별도 앱 설치 없이 모바일/PC 브라우저에서 즉시 접속현장 이동 중에도 간편하게 모바일로 접속하여 확인 가능🚀 비전 (Vision)케이제이파트너스의 정리/수납 매니지먼트 시스템은 단순한 내부 관리 도구를 넘어, 현장 매니저와 관리자가 서로 신뢰하고 협력할 수 있는 스마트 인력 솔루션으로 발전해 나가고 있습니다.


# 🤝 파트너스 매칭 매니저

프리랜서 정리수납 파트너의 매칭/배정을 관리하는 웹 애플리케이션입니다.

## 기술 스택

- **Frontend**: HTML + Tailwind CSS + Vanilla JS (Vite 빌드)
- **Backend & DB**: Supabase (PostgreSQL + REST API + RLS)
- **배포**: Vercel (프론트) + Supabase (백엔드)

## 로컬 개발 환경 설정

### 1단계: Supabase 프로젝트 생성

1. [supabase.com](https://supabase.com) 에서 무료 계정 생성
2. **New Project** 클릭 → 프로젝트 이름, DB 비밀번호 설정
3. **SQL Editor** 에서 `supabase-setup.sql` 내용을 붙여넣고 실행
4. **Settings > API** 에서 `Project URL`과 `anon public` 키 복사

### 2단계: 환경변수 설정

```bash
# .env.example 을 복사해서 .env 생성
cp .env.example .env
```

`.env` 파일에 Supabase 정보 입력:

```
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJI...your-anon-key
```

### 3단계: 로컬 실행

```bash
npm install
npm run dev
```

브라우저에서 `http://localhost:5173` 으로 접속합니다.

## Vercel 배포

### 방법 1: Vercel CLI

```bash
npm i -g vercel
vercel
```

### 방법 2: GitHub 연동 (추천)

1. 이 프로젝트를 GitHub 저장소에 push
2. [vercel.com](https://vercel.com) 에서 **Import Project** → GitHub 저장소 선택
3. **Environment Variables** 에 아래 두 값 입력:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. **Deploy** 클릭

### CORS 관련 안내

Supabase는 기본적으로 모든 도메인의 요청을 허용합니다.
별도의 CORS 설정 없이 Vercel 배포 후 바로 동작합니다.

만약 CORS 에러가 발생한다면:
- Supabase Dashboard > Settings > API > **Additional allowed origins** 에
  Vercel 배포 URL을 추가하세요 (예: `https://partners-manager.vercel.app`)

## 보안 체크리스트

- [x] `.env` 파일로 비밀값 격리 (`.gitignore`에 포함)
- [x] Supabase RLS(Row Level Security) 활성화
- [x] 전화번호 정규식 검증 (프론트 + DB CHECK 제약조건)
- [x] XSS 방지 (텍스트 이스케이프 처리)
- [x] `VITE_` 접두사 = 브라우저 노출 → anon key만 사용 (service_role key 미사용)
