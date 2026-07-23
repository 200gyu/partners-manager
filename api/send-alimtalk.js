// 카카오 알림톡 발송 — Vercel 서버리스 함수 (솔라피/Solapi)
// 보안: 로그인한 '관리자'만 호출 가능(Supabase JWT + profiles.role 검증).
//       솔라피 API 시크릿은 서버 환경변수에만 존재하며 클라이언트에 노출되지 않는다.
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

const SOLAPI_URL = 'https://api.solapi.com/messages/v4/send';

// ─── 솔라피 HMAC-SHA256 인증 헤더 ───
function authHeader(apiKey, apiSecret) {
  const date = new Date().toISOString();
  const salt = crypto.randomBytes(32).toString('hex');
  const signature = crypto
    .createHmac('sha256', apiSecret)
    .update(date + salt)
    .digest('hex');
  return `HMAC-SHA256 apiKey=${apiKey}, date=${date}, salt=${salt}, signature=${signature}`;
}

// ─── 호출자가 로그인한 관리자인지 검증 ───
async function verifyAdmin(req) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return { ok: false, reason: '인증 토큰 없음' };

  const url = process.env.SUPABASE_URL;
  const anon = process.env.SUPABASE_ANON_KEY;
  if (!url || !anon) return { ok: false, reason: 'Supabase 환경변수 미설정' };

  // 호출자 JWT로 클라이언트 생성 → RLS가 본인 profile만 읽게 허용
  const sb = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: userData, error: uErr } = await sb.auth.getUser(token);
  if (uErr || !userData?.user) return { ok: false, reason: '유효하지 않은 토큰' };

  const { data: profile } = await sb
    .from('profiles')
    .select('role')
    .eq('id', userData.user.id)
    .maybeSingle();
  if (profile?.role !== 'admin') return { ok: false, reason: '관리자 권한 필요' };
  return { ok: true };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { SOLAPI_API_KEY, SOLAPI_API_SECRET, SOLAPI_PFID, ALIMTALK_TEMPLATE_ID, ALIMTALK_FROM } =
    process.env;
  if (!SOLAPI_API_KEY || !SOLAPI_API_SECRET || !SOLAPI_PFID || !ALIMTALK_TEMPLATE_ID || !ALIMTALK_FROM) {
    return res.status(500).json({ error: '솔라피/알림톡 환경변수가 설정되지 않았습니다.' });
  }

  // 관리자 인증
  const gate = await verifyAdmin(req);
  if (!gate.ok) return res.status(403).json({ error: gate.reason });

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
    // recipients: [{ to: '01012345678', variables: { '#{이름}': '홍길동', ... } }]
    const recipients = Array.isArray(body.recipients) ? body.recipients : [];
    if (recipients.length === 0) return res.status(400).json({ error: '수신자가 없습니다.' });

    const results = [];
    for (const r of recipients) {
      const to = String(r.to || '').replace(/[^0-9]/g, '');
      if (!to) { results.push({ to: r.to, ok: false, error: '전화번호 없음' }); continue; }

      const payload = {
        message: {
          to,
          from: ALIMTALK_FROM,
          kakaoOptions: {
            pfId: SOLAPI_PFID,
            templateId: ALIMTALK_TEMPLATE_ID,
            variables: r.variables || {},
            disableSms: false, // 알림톡 실패 시 SMS 대체 발송 허용
          },
        },
      };

      const resp = await fetch(SOLAPI_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: authHeader(SOLAPI_API_KEY, SOLAPI_API_SECRET),
        },
        body: JSON.stringify(payload),
      });
      const data = await resp.json().catch(() => ({}));
      results.push({ to, ok: resp.ok, status: resp.status, detail: data?.statusMessage || data?.errorMessage || null });
    }

    const sent = results.filter((x) => x.ok).length;
    return res.status(200).json({ sent, total: results.length, results });
  } catch (err) {
    console.error('alimtalk error:', err);
    return res.status(500).json({ error: '발송 처리 중 오류가 발생했습니다.' });
  }
}
