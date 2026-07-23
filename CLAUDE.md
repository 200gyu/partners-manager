# CLAUDE.md — partners-manager 프로젝트 가이드

주식회사 케이제이파트너스 정리/수납 매니지먼트 시스템. AI 에이전트(및 개발자)가 이 저장소를 다룰 때 지켜야 할 규칙과 구조.

## 스택
- **프론트엔드**: Vanilla JS (ES modules) + Vite + Tailwill CSS(CDN)
- **백엔드/DB**: Supabase (PostgreSQL, Auth, RLS) — **Firebase 아님**
- **호스팅**: Vercel (프로덕션: partners-manager-omega.vercel.app)

## 파일 구조
| 파일 | 역할 |
|------|------|
| `index.html` | 전체 UI 셸(로그인·관리자 패널 4종·매니저 포털) |
| `src/main.js` | 상태·인증 라우팅·CRUD·렌더링(핵심 로직) |
| `src/supabase.js` | Supabase 클라이언트(env에서 URL/anon 키 로드) |
| `src/auth.js` | 인증 헬퍼 |
| `src/excel.js` | 엑셀 내보내기/대량등록 (xlsx 동적 import) |
| `src/reports.js` | 월간 추이 SVG 차트 + 급여명세서 인쇄 |
| `src/mockData.js` | 로컬 dev 전용 Mock(실명 포함 → gitignore) |
| `supabase-migration-v*.sql` | DB 마이그레이션(사용자가 SQL Editor에서 실행) |

## 권한/역할 (RBAC)
- `profiles(id, role, partner_id)` — role: `admin` / `manager` / `leader` / `partner`
- **admin**: 전체 CRUD. **그 외**: 본인 데이터만(배정·급여·휴무).
- 실제 접근 통제는 **서버 RLS**가 `auth.uid()`·`my_partner_id()` 기준으로 강제. 클라이언트 역할은 UI 라우팅용.
- 로그인 후 `showApp()` → `admin`이면 관리자 앱, 아니면 매니저 포털(`panel-mypage`).

## ⚠️ 반드시 지킬 규칙
1. **비밀값은 `.env`에만.** 코드/저장소에 하드코딩 금지. `.env`·`src/mockData.js`·`supabase-seed-*.sql`은 gitignore됨. Supabase anon 키는 공개돼도 되는 publishable 키(방어선은 RLS).
2. **배포는 CLI로.** 이 프로젝트는 **git push로 자동 배포되지 않는다.** 반드시 `npx vercel --prod --yes`로 배포해야 프로덕션 반영.
3. **RLS 마이그레이션은 "상태"로 관리.** 정책 추가만 하지 말고 낡은 정책은 `DROP`(RLS는 OR 평가 — anon 허용 정책 하나가 전체를 뚫음).
4. **DDL은 사용자가 실행.** 에이전트는 Supabase에 DDL을 직접 실행할 수 없음(직접 연결 불가). `supabase-migration-*.sql`을 만들고 사용자가 SQL Editor에서 실행.
5. **얇고 안전하게 확장.** 기존 기능 무손상, 추가형 우선. 스키마 변경은 `ADD COLUMN IF NOT EXISTS` + 기본값.
6. **모바일 우선.** 현장 매니저가 모바일로 쓰므로 responsive 필수(Tailwind `sm:` 분기).

## 로컬 개발/테스트
```bash
npm install
npm run dev          # http://localhost:5173 (dev는 mockData 자동 로드 → 로그인 없이 관리자 화면)
```
- 매니저 포털 시뮬레이션: `http://localhost:5173/?role=manager`
- 빌드 검증: `npm run build`
- 배포: `npx vercel --prod --yes`

## 마이그레이션 이력(개요)
- v5: RBAC 기반(profiles·헬퍼·역할별 RLS) / v6: manager 역할·visit_time·payment_status
- v7: 매니저 계정 연결 RPC(link/unlink/list_manager_accounts)
