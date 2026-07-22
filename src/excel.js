// 엑셀 내보내기/가져오기 모듈 (SheetJS)
// xlsx는 용량이 크므로 실제 사용 시점에 동적 import 한다.
const TAX_RATE = 0.033;

async function xlsx() {
  return import('xlsx');
}

// ─── 급여 명세 엑셀 다운로드 ───
// month: 'YYYY-MM', monthRecords: 해당 월 payroll_records, partners: 전체 파트너
export async function exportPayroll(month, monthRecords, partners) {
  const XLSX = await xlsx();
  const nameOf = (id) => (partners.find((p) => p.id === id) || {}).name || '알 수 없음';

  // 1) 파트너별 요약 시트
  const byPartner = {};
  monthRecords.forEach((r) => {
    const b = (byPartner[r.partner_id] = byPartner[r.partner_id] || {
      count: 0, hours: 0, amount: 0, rates: [],
    });
    b.count++;
    b.hours += Number(r.hours_worked) || 0;
    b.amount += Number(r.total_amount) || 0;
    b.rates.push(Number(r.hourly_rate) || 0);
  });

  const summary = Object.entries(byPartner)
    .map(([pid, b]) => {
      const deduction = Math.round(b.amount * TAX_RATE);
      return {
        파트너: nameOf(pid),
        '근무 건수': b.count,
        '총 근무시간': b.hours,
        '평균 시급': Math.round(b.rates.reduce((s, r) => s + r, 0) / b.rates.length),
        '총 급여(세전)': b.amount,
        '공제액(3.3%)': deduction,
        '차인지급액': b.amount - deduction,
      };
    })
    .sort((a, b) => b['총 급여(세전)'] - a['총 급여(세전)']);

  // 합계 행
  const totals = summary.reduce(
    (t, r) => {
      t['총 급여(세전)'] += r['총 급여(세전)'];
      t['공제액(3.3%)'] += r['공제액(3.3%)'];
      t['차인지급액'] += r['차인지급액'];
      t['근무 건수'] += r['근무 건수'];
      return t;
    },
    { 파트너: '합계', '근무 건수': 0, '총 근무시간': '', '평균 시급': '', '총 급여(세전)': 0, '공제액(3.3%)': 0, '차인지급액': 0 }
  );
  summary.push(totals);

  // 2) 상세 시트 (레코드별)
  const detail = monthRecords
    .slice()
    .sort((a, b) => (a.work_date || '').localeCompare(b.work_date || ''))
    .map((r) => {
      const gross = Number(r.total_amount) || 0;
      const deduction = Math.round(gross * TAX_RATE);
      return {
        근무일: r.work_date || '',
        파트너: nameOf(r.partner_id),
        시급: Number(r.hourly_rate) || 0,
        근무시간: Number(r.hours_worked) || 0,
        역할수당: Number(r.bonus) || 0,
        현장수당: Number(r.field_bonus) || 0,
        '총 급여(세전)': gross,
        '공제액(3.3%)': deduction,
        차인지급액: gross - deduction,
      };
    });

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summary), '급여요약');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detail), '급여상세');
  XLSX.writeFile(wb, `급여명세_${month}.xlsx`);
}

// ─── 파트너 대량 등록용 엑셀 양식 다운로드 ───
export async function downloadPartnerTemplate() {
  const XLSX = await xlsx();
  const rows = [
    { 이름: '홍길동', 전화번호: '010-1234-5678', 활동지역: '서울/경기', 전문분야: '정리수납' },
    { 이름: '(예시행 — 지우고 입력하세요)', 전화번호: '', 활동지역: '', 전문분야: '' },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), '파트너');
  XLSX.writeFile(wb, '파트너_대량등록_양식.xlsx');
}

// ─── 파트너 엑셀 파싱 → [{name, phone, region, specialty}] ───
export async function parsePartnerFile(file) {
  const XLSX = await xlsx();
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

  const pick = (row, keys) => {
    // 매칭되는 컬럼 중 값이 비어있지 않은 첫 번째를 반환 (헤더 변형·빈 컬럼 대응)
    for (const k of Object.keys(row)) {
      const norm = k.replace(/\s/g, '');
      if (keys.includes(norm)) {
        const v = String(row[k]).trim();
        if (v) return v;
      }
    }
    return '';
  };

  const out = [];
  for (const row of rows) {
    const name = pick(row, ['이름', '성명', 'name', 'Name']);
    if (!name || name.includes('예시행')) continue;
    out.push({
      name,
      phone: pick(row, ['전화번호', '연락처', 'phone', 'Phone']),
      region: pick(row, ['활동지역', '지역', 'region', 'Region']) || '서울/경기',
      specialty: pick(row, ['전문분야', '분야', 'specialty', 'Specialty']) || '정리수납',
    });
  }
  return out;
}
