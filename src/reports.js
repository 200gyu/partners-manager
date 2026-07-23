// 리포트 모듈 — 월간 수익 추이 차트(SVG) + 급여명세서(인쇄용 HTML)
// 외부 라이브러리 없이 순수 함수로 구성.

const won = (n) => '₩' + (Math.round(n) || 0).toLocaleString();
const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// ─── 월별 합계 집계: records → [{month:'YYYY-MM', total}] (오름차순) ───
export function monthlyTotals(records) {
  const by = {};
  (records || []).forEach((r) => {
    if (!r.work_date) return;
    const m = String(r.work_date).slice(0, 7);
    by[m] = (by[m] || 0) + (Number(r.total_amount) || 0);
  });
  return Object.entries(by).sort((a, b) => a[0].localeCompare(b[0])).map(([month, total]) => ({ month, total }));
}

// ─── 월간 수익 추이 막대차트 (인라인 SVG 문자열) ───
export function monthlyTrendSvg(monthly) {
  if (!monthly || monthly.length === 0) {
    return '<p class="text-sm text-gray-400 text-center py-6">표시할 수익 데이터가 없습니다.</p>';
  }
  const W = 640, H = 220, padL = 56, padB = 34, padT = 16, padR = 12;
  const max = Math.max(...monthly.map((d) => d.total), 1);
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const n = monthly.length;
  const bw = Math.min(64, (plotW / n) * 0.6);
  const gap = plotW / n;

  const bars = monthly.map((d, i) => {
    const x = padL + gap * i + (gap - bw) / 2;
    const h = (d.total / max) * plotH;
    const y = padT + plotH - h;
    const label = d.month.slice(2).replace('-', '/'); // 26/05
    return `
      <rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}"
        rx="4" fill="#1d4ed8" opacity="0.85"><title>${esc(d.month)} · ${won(d.total)}</title></rect>
      <text x="${(x + bw / 2).toFixed(1)}" y="${(y - 5).toFixed(1)}" text-anchor="middle"
        font-size="10" fill="#334155">${(d.total / 10000).toLocaleString()}만</text>
      <text x="${(x + bw / 2).toFixed(1)}" y="${(H - padB + 16).toFixed(1)}" text-anchor="middle"
        font-size="11" fill="#64748b">${label}</text>`;
  }).join('');

  // Y축 눈금 (0, max)
  const axis = `
    <line x1="${padL}" y1="${padT}" x2="${padL}" y2="${padT + plotH}" stroke="#e2e8f0"/>
    <line x1="${padL}" y1="${padT + plotH}" x2="${W - padR}" y2="${padT + plotH}" stroke="#e2e8f0"/>
    <text x="${padL - 8}" y="${padT + 4}" text-anchor="end" font-size="10" fill="#94a3b8">${(max / 10000).toLocaleString()}만</text>
    <text x="${padL - 8}" y="${padT + plotH}" text-anchor="end" font-size="10" fill="#94a3b8">0</text>`;

  return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="월간 수익 추이">${axis}${bars}</svg>`;
}

// ─── 급여명세서 인쇄 (새 창 → 브라우저 인쇄 → PDF 저장) ───
// info: { company, name, region, month, rows:[{date,client,hours,rate,role,field,gross}], gross, deduction, net }
export function printPayslip(info) {
  const rows = (info.rows || []).map((r) => `
    <tr>
      <td>${esc(r.date)}</td>
      <td>${esc(r.client)}</td>
      <td class="num">${r.hours}h</td>
      <td class="num">${won(r.rate)}</td>
      <td class="num">${won((r.role || 0) + (r.field || 0))}</td>
      <td class="num">${won(r.gross)}</td>
    </tr>`).join('');

  const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8">
    <title>급여명세서_${esc(info.name)}_${esc(info.month)}</title>
    <style>
      *{box-sizing:border-box} body{font-family:'Malgun Gothic','Apple SD Gothic Neo',sans-serif;color:#1f2937;padding:32px;max-width:720px;margin:0 auto}
      h1{font-size:20px;margin:0 0 4px} .sub{color:#6b7280;font-size:13px;margin-bottom:20px}
      .meta{display:flex;justify-content:space-between;font-size:13px;margin-bottom:16px}
      table{width:100%;border-collapse:collapse;font-size:12px;margin-bottom:16px}
      th,td{border-bottom:1px solid #e5e7eb;padding:7px 8px;text-align:left}
      th{background:#f8fafc;color:#475569;font-weight:600} .num{text-align:right}
      .totals{margin-left:auto;width:260px;font-size:13px}
      .totals div{display:flex;justify-content:space-between;padding:5px 0}
      .totals .net{border-top:2px solid #1f2937;margin-top:4px;padding-top:8px;font-weight:700;font-size:15px}
      .sign{margin-top:48px;display:flex;justify-content:flex-end}
      .sign .box{text-align:center;font-size:13px} .sign .line{margin-top:40px;border-top:1px solid #9ca3af;width:200px;padding-top:6px;color:#6b7280}
      .foot{margin-top:32px;font-size:11px;color:#9ca3af;text-align:center}
      @media print{body{padding:0}}
    </style></head><body>
    <h1>급여명세서</h1>
    <div class="sub">${esc(info.company || '주식회사 케이제이파트너스')}</div>
    <div class="meta">
      <div><b>${esc(info.name)}</b> ${info.region ? '· ' + esc(info.region) : ''}</div>
      <div>정산 월: <b>${esc(info.month)}</b></div>
    </div>
    <table>
      <thead><tr><th>근무일</th><th>현장</th><th class="num">시간</th><th class="num">시급</th><th class="num">수당</th><th class="num">금액</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="6" style="text-align:center;color:#9ca3af">해당 월 근무 내역이 없습니다</td></tr>'}</tbody>
    </table>
    <div class="totals">
      <div><span>총 급여(세전)</span><span>${won(info.gross)}</span></div>
      <div style="color:#dc2626"><span>공제액(3.3%)</span><span>-${won(info.deduction)}</span></div>
      <div class="net"><span>차인지급액</span><span>${won(info.net)}</span></div>
    </div>
    <div class="sign"><div class="box">위 금액을 정히 수령하였습니다.<div class="line">수령인 (서명 또는 인)</div></div></div>
    <div class="foot">본 명세서는 ${esc(info.company || '주식회사 케이제이파트너스')} 급여관리 시스템에서 발행되었습니다.</div>
    <script>window.onload=function(){setTimeout(function(){window.print();},250);};<\/script>
    </body></html>`;

  const w = window.open('', '_blank');
  if (!w) return false; // 팝업 차단
  w.document.open();
  w.document.write(html);
  w.document.close();
  return true;
}
