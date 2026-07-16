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
