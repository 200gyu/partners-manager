# 카카오 알림톡(솔라피) 연동 설정

배정 등록 시 파트너에게 카카오 알림톡을 자동 발송하기 위한 설정 안내입니다.
발송 함수(`api/send-alimtalk.js`)는 partners-manager와 같은 Vercel 프로젝트에 배포되며,
**관리자 로그인 계정만** 호출할 수 있고, 솔라피 시크릿은 서버 환경변수에만 저장됩니다.

## 구조

```
관리자 앱(배정 등록)
   │  POST /api/send-alimtalk  { recipients: [{to, variables}] }  + 관리자 JWT
   ▼
Vercel 서버리스(api/send-alimtalk.js)   ← 솔라피 API 시크릿(서버 전용)
   │  1) 호출자가 관리자인지 Supabase JWT + profiles.role 검증
   │  2) 솔라피 HMAC 인증 → 알림톡 발송(실패 시 SMS 대체)
   ▼
솔라피 → 카카오 알림톡 → 파트너 카카오톡
```

## 1단계 — Vercel 환경변수 등록

Vercel → partners-manager 프로젝트 → Settings → Environment Variables (Production)에
아래 값을 추가하세요. **모두 서버 전용이라 절대 코드/클라이언트에 넣지 않습니다.**

| 변수 | 값 | 어디서 |
|------|------|--------|
| `SOLAPI_API_KEY` | 솔라피 API Key | 솔라피 콘솔 → 개발/연동 → API Key |
| `SOLAPI_API_SECRET` | 솔라피 API Secret | 〃 (Secret은 발급 시 1회만 표시 — 잘 보관) |
| `SOLAPI_PFID` | 발신프로필 ID(pfId) | 솔라피 콘솔 → 카카오 → 발신프로필 |
| `ALIMTALK_TEMPLATE_ID` | 승인된 템플릿 ID | 솔라피 콘솔 → 카카오 → 알림톡 템플릿 |
| `ALIMTALK_FROM` | 발신번호(등록된 SMS 번호) | 솔라피 콘솔 → 발신번호 (알림톡 실패 시 SMS 대체용, 필수) |
| `SUPABASE_URL` | `https://zjwihnahegzajlpflqzk.supabase.co` | (관리자 검증용) |
| `SUPABASE_ANON_KEY` | Supabase anon(publishable) 키 | (관리자 검증용) |

## 2단계 — 승인된 템플릿 정보 공유

승인된 알림톡 템플릿의 **정확한 변수명과 문구**를 알려주세요. 예:

```
[케이제이파트너스]
#{이름}님, #{날짜} #{현장} 현장에 #{역할}(으)로 배정되셨습니다.
· 주소: #{주소}
· 문의: 010-0000-0000
```

이 경우 변수는 `#{이름} #{날짜} #{현장} #{역할} #{주소}` 입니다. 템플릿 변수명이
확정되면 배정 등록 시 이 값들을 자동으로 채워 발송하도록 앱에 연결하겠습니다.

> ⚠️ 알림톡은 **승인된 템플릿 문구를 글자 하나까지 그대로**만 발송할 수 있습니다.
> 변수 자리(`#{...}`)에 값만 치환됩니다. 그래서 템플릿 변수명이 코드와 정확히 일치해야 합니다.

## 3단계 — 파트너 전화번호 확보

알림톡은 파트너 전화번호로 발송됩니다. `partners.phone`이 채워져 있어야 하며,
비어있는 파트너는 발송에서 자동 제외됩니다. (엑셀 대량 등록 시 전화번호 열 포함 권장)

## 4단계 — 발송 트리거 (개발 예정)

템플릿 변수 확정 후, 배정 등록 성공 시 팀장·팀원 각자에게 자동 발송하도록
`handleAddAssignment`에 연결합니다. 발송 전 확인 다이얼로그와 실패 목록 표시를 포함합니다.

## 로컬 테스트 (선택)

```bash
curl -X POST https://partners-manager-omega.vercel.app/api/send-alimtalk \
  -H "Authorization: Bearer <관리자 로그인 후 얻은 Supabase access token>" \
  -H "Content-Type: application/json" \
  -d '{"recipients":[{"to":"01012345678","variables":{"#{이름}":"홍길동","#{현장}":"테스트"}}]}'
```
