import { supabase } from './supabase.js';
import { getSession, onAuthStateChange, signIn, signUp, signOut } from './auth.js';
import { exportPayroll, downloadPartnerTemplate, parsePartnerFile } from './excel.js';

// ─── Mock Data 모드 ───
// 로컬 개발(vite dev)에서만 활성화. mockData.js는 실명 포함으로 gitignore 처리되어
// 운영 빌드에는 존재하지 않으며, 운영은 항상 Supabase(인증+RLS)를 사용한다.
let MOCK_PARTNERS = [], MOCK_ASSIGNMENTS = [], MOCK_PAYROLL_RECORDS = [];
let USE_MOCK_DATA = false;
// top-level await는 DOMContentLoaded보다 늦게 끝날 수 있으므로 Promise로 로드하고
// DOMContentLoaded 핸들러에서 await 한다.
const mockReady = import.meta.env.DEV
  ? import(/* @vite-ignore */ '/src/mockData.js')
      .then((m) => {
        MOCK_PARTNERS = m.MOCK_PARTNERS;
        MOCK_ASSIGNMENTS = m.MOCK_ASSIGNMENTS;
        MOCK_PAYROLL_RECORDS = m.MOCK_PAYROLL_RECORDS;
        USE_MOCK_DATA = MOCK_PARTNERS.length > 0;
      })
      .catch(() => { /* mockData.js 미존재 시 Supabase 모드 */ })
  : Promise.resolve();

// ─── 상태 ───
let partners = [];
let assignments = [];
let currentTab = 'partners';
let assignmentView = 'list';
let calYear = new Date().getFullYear();
let calMonth = new Date().getMonth();
let dayOffs = [];
let dayoffCalYear = new Date().getFullYear();
let dayoffCalMonth = new Date().getMonth();
let payrollRecords = [];
let uniCalYear = new Date().getFullYear();
let uniCalMonth = new Date().getMonth();
let currentRole = 'admin';   // RBAC: admin | leader | partner
let currentProfile = null;   // { role, partner_id }

// ─── 초기화 ───
document.addEventListener('DOMContentLoaded', async () => {
  setupAuthForms();
  await mockReady;
  if (USE_MOCK_DATA) {
    showApp({ user: { email: 'mock@kjpartners.co.kr' } });
    return;
  }
  const session = await getSession();
  if (session) {
    showApp(session);
  }
  onAuthStateChange((session) => {
    if (session) {
      showApp(session);
    } else {
      showLogin();
    }
  });
});

// ═══════════════════════════════════════
//  인증 UI
// ═══════════════════════════════════════

function setupAuthForms() {
  document.getElementById('form-login').addEventListener('submit', handleLogin);
  document.getElementById('form-signup').addEventListener('submit', handleSignup);

  document.getElementById('toggle-signup').addEventListener('click', () => {
    document.getElementById('form-login').classList.add('hidden');
    document.getElementById('toggle-signup').classList.add('hidden');
    document.getElementById('form-signup').classList.remove('hidden');
  });

  document.getElementById('toggle-login').addEventListener('click', () => {
    document.getElementById('form-login').classList.remove('hidden');
    document.getElementById('toggle-signup').classList.remove('hidden');
    document.getElementById('form-signup').classList.add('hidden');
  });

  document.getElementById('btn-logout').addEventListener('click', handleLogout);
}

async function handleLogin(e) {
  e.preventDefault();
  const form = e.target;
  const email = form.email.value.trim();
  const password = form.password.value;
  const errEl = document.getElementById('login-error');
  const btn = document.getElementById('btn-login');

  errEl.classList.add('hidden');
  btn.disabled = true;
  btn.textContent = '로그인 중...';

  try {
    await signIn(email, password);
  } catch (err) {
    errEl.textContent = err.message === 'Invalid login credentials'
      ? '이메일 또는 비밀번호가 올바르지 않습니다.'
      : err.message;
    errEl.classList.remove('hidden');
  } finally {
    btn.disabled = false;
    btn.textContent = '로그인';
  }
}

async function handleSignup(e) {
  e.preventDefault();
  const form = e.target;
  const email = form.email.value.trim();
  const password = form.password.value;
  const errEl = document.getElementById('signup-error');
  const successEl = document.getElementById('signup-success');
  const btn = document.getElementById('btn-signup');

  errEl.classList.add('hidden');
  successEl.classList.add('hidden');
  btn.disabled = true;
  btn.textContent = '생성 중...';

  try {
    const data = await signUp(email, password);
    if (data.user && !data.session) {
      successEl.textContent = '확인 이메일이 전송되었습니다. 이메일을 확인해 주세요.';
      successEl.classList.remove('hidden');
    }
  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.remove('hidden');
  } finally {
    btn.disabled = false;
    btn.textContent = '계정 생성';
  }
}

async function handleLogout() {
  try {
    await signOut();
  } catch (err) {
    showToast('로그아웃 실패: ' + err.message, 'error');
  }
}

async function showApp(session) {
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('app-screen').classList.remove('hidden');
  document.getElementById('user-email').textContent = session.user.email;

  // RBAC: 역할 조회 후 관리자/파트너 라우팅
  currentProfile = await fetchProfile(session);
  currentRole = currentProfile?.role || 'admin';

  if (currentRole === 'admin') {
    showAdminApp();
  } else {
    showPartnerApp(session);
  }
}

// 로그인 계정의 역할·연결 파트너 조회. 실패(테이블 미생성 등) 시 null → 관리자 취급.
async function fetchProfile(session) {
  if (USE_MOCK_DATA) {
    // 로컬 테스트: ?role=manager(또는 partner/leader) 로 매니저 포털 시뮬레이션
    const params = new URLSearchParams(location.search);
    const simRole = params.get('role');
    if (['manager', 'partner', 'leader'].includes(simRole)) {
      const first = MOCK_PARTNERS[0];
      return { role: simRole, partner_id: first ? first.id : null };
    }
    return { role: 'admin', partner_id: null };
  }
  try {
    const { data } = await supabase
      .from('profiles')
      .select('role, partner_id')
      .eq('id', session.user.id)
      .maybeSingle();
    return data; // null이면 상위에서 admin fallback
  } catch {
    return null; // profiles 테이블 미생성(마이그레이션 전) → admin
  }
}

function showAdminApp() {
  document.getElementById('admin-nav').classList.remove('hidden');
  document.getElementById('panel-mypage').classList.add('hidden');
  setupTabs();
  setupForms();
  setupDayOffForm();
  setupPayrollEvents();
  setupExcelEvents();
  loadPartners();
  loadAssignments();
  loadDayOffs();
  loadPayrollRecords();
  setupPartnerSearch();
  setupManagerAdmin();
}

// ═══════════════════════════════════════
//  매니저 계정 관리 (관리자 전용, RPC)
// ═══════════════════════════════════════

function populateManagerPartnerSelect() {
  const sel = document.getElementById('manager-partner-select');
  if (!sel) return;
  sel.innerHTML =
    '<option value="">정리수납사 선택…</option>' +
    partners
      .map((p) => `<option value="${p.id}">${esc(p.name)} (${esc(p.region || '')})</option>`)
      .join('');
}

function setupManagerAdmin() {
  const linkBtn = document.getElementById('manager-link-btn');
  if (!linkBtn) return;

  linkBtn.addEventListener('click', async () => {
    const email = document.getElementById('manager-email').value.trim();
    const partnerId = document.getElementById('manager-partner-select').value;
    if (!email || !partnerId) { showToast('이메일과 정리수납사를 모두 선택하세요', 'error'); return; }
    if (USE_MOCK_DATA) { showToast('데모 모드 — 운영에서 실제 연결됩니다'); return; }

    const { data, error } = await supabase.rpc('link_manager', {
      p_email: email, p_partner_id: partnerId,
    });
    if (error) { showToast('연결 실패: ' + error.message, 'error'); return; }
    if (data === 'NO_USER') {
      showToast('해당 이메일로 가입된 계정이 없습니다. 매니저가 먼저 가입해야 합니다.', 'error');
      return;
    }
    showToast('매니저 계정이 연결되었습니다');
    document.getElementById('manager-email').value = '';
    loadManagerAccounts();
  });

  loadManagerAccounts();
}

async function loadManagerAccounts() {
  const listEl = document.getElementById('manager-list');
  if (!listEl) return;
  if (USE_MOCK_DATA) {
    listEl.innerHTML = '<p class="text-gray-400">데모 모드 — 운영에서 연결된 매니저 목록이 표시됩니다.</p>';
    return;
  }
  const { data, error } = await supabase.rpc('list_manager_accounts');
  if (error) {
    listEl.innerHTML = `<p class="text-gray-400">목록을 불러오지 못했습니다 (${esc(error.message)}). v6·v7 마이그레이션 실행 여부를 확인하세요.</p>`;
    return;
  }
  listEl.innerHTML = (data || []).length
    ? data.map((m) => `
        <div class="flex items-center justify-between border-b border-gray-50 py-1.5">
          <span>👤 <b>${esc(m.partner_name || '(미연결)')}</b> · ${esc(m.email)} <span class="text-xs text-gray-400">(${esc(m.role)})</span></span>
          <button onclick="unlinkManager('${m.uid}')"
            class="text-xs px-2 py-1 rounded-lg text-red-600 border border-red-200 hover:bg-red-50">연결 해제</button>
        </div>`).join('')
    : '<p class="text-gray-400">연결된 매니저 계정이 없습니다.</p>';
}

window.unlinkManager = async function (uid) {
  if (!confirm('이 매니저 계정 연결을 해제하시겠습니까? (일반 파트너로 되돌아갑니다)')) return;
  const { error } = await supabase.rpc('unlink_manager', { p_uid: uid });
  if (error) { showToast('해제 실패: ' + error.message, 'error'); return; }
  showToast('연결이 해제되었습니다');
  loadManagerAccounts();
};

function showPartnerApp(session) {
  // 관리자 UI 전부 숨기고 마이페이지만 노출
  document.getElementById('admin-nav').classList.add('hidden');
  ['panel-partners', 'panel-assignments', 'panel-payroll', 'panel-schedule'].forEach((id) => {
    document.getElementById(id).classList.add('hidden');
  });
  document.getElementById('panel-mypage').classList.remove('hidden');
  renderMyPage(session);
}

function showLogin() {
  document.getElementById('app-screen').classList.add('hidden');
  document.getElementById('login-screen').classList.remove('hidden');
  partners = [];
  assignments = [];
}

// ═══════════════════════════════════════
//  파트너 마이페이지 (RBAC)
// ═══════════════════════════════════════

async function renderMyPage(session) {
  const pid = currentProfile?.partner_id;
  const monthStr = new Date().toISOString().slice(0, 7);
  document.getElementById('mypage-month').textContent = monthStr;

  if (!pid) {
    document.getElementById('mypage-name').textContent = session.user.email;
    document.getElementById('mypage-meta').textContent =
      '아직 파트너 정보와 연결되지 않은 계정입니다. 관리자에게 연결을 요청하세요.';
    return;
  }

  // 데이터 수집 (mock: 메모리 배열 / 운영: Supabase — RLS가 본인 것만 반환)
  let me, myRecords, myAssigns, myDayoffs;
  if (USE_MOCK_DATA) {
    me = MOCK_PARTNERS.find((p) => p.id === pid);
    myRecords = MOCK_PAYROLL_RECORDS.filter((r) => r.partner_id === pid);
    myAssigns = MOCK_ASSIGNMENTS.filter(
      (a) => a.leader_id === pid || (a.member_ids || []).includes(pid)
    );
    myDayoffs = [];
  } else {
    const [pRes, payRes, asRes, doRes] = await Promise.all([
      supabase.from('partners').select('name, region, specialty').eq('id', pid).maybeSingle(),
      supabase.from('payroll_records').select('*').eq('partner_id', pid),
      supabase.from('assignments').select('*').or(`leader_id.eq.${pid}`),
      supabase.from('partner_day_offs').select('*').eq('partner_id', pid),
    ]);
    me = pRes.data;
    myRecords = payRes.data || [];
    // 팀원 배열 포함 배정은 별도 필터 (or contains)
    const memberAs = await supabase.from('assignments').select('*').contains('member_ids', [pid]);
    myAssigns = [...(asRes.data || []), ...((memberAs.data) || [])];
    myDayoffs = doRes.data || [];
  }

  document.getElementById('mypage-name').textContent = me ? me.name : session.user.email;
  document.getElementById('mypage-meta').textContent = me
    ? `${me.region || ''} · ${me.specialty || ''}`.trim()
    : '';

  // 이번 달 예상 급여
  const monthRec = (myRecords || []).filter((r) => r.work_date && r.work_date.startsWith(monthStr));
  const gross = monthRec.reduce((s, r) => s + (Number(r.total_amount) || 0), 0);
  const deduction = Math.round(gross * 0.033);
  document.getElementById('mypage-gross').textContent = '₩' + gross.toLocaleString();
  document.getElementById('mypage-deduction').textContent = '-₩' + deduction.toLocaleString();
  document.getElementById('mypage-net').textContent = '₩' + (gross - deduction).toLocaleString();

  // 내 배정 (다가오는 순)
  const asEl = document.getElementById('mypage-assignments');
  const sorted = (myAssigns || []).slice().sort((a, b) =>
    (b.assignment_date || '').localeCompare(a.assignment_date || '')
  );
  asEl.innerHTML = sorted.length
    ? sorted.slice(0, 20).map((a) => {
        const when = `${esc(a.assignment_date)}${a.visit_time ? ' ' + esc(String(a.visit_time).slice(0, 5)) : ''}`;
        const work = a.notes ? `<span class="block text-xs text-gray-400 mt-0.5">📝 ${esc(a.notes)}</span>` : '';
        return `
        <div class="flex justify-between border-b border-gray-50 py-1.5">
          <span>${when} · ${esc(a.client_name)} (${esc(a.client_address || '')})${work}</span>
          <span class="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 shrink-0">${esc(a.status || '')}</span>
        </div>`;
      }).join('')
    : '<p class="text-gray-400">배정 내역이 없습니다.</p>';

  // 당월 급여 건별 지급 상태 요약 (payment_status 컬럼 있을 때만)
  const paidCount = monthRec.filter((r) => r.payment_status === '완료').length;
  const netEl = document.getElementById('mypage-net-note');
  if (netEl) {
    netEl.textContent = monthRec.length
      ? `당월 ${monthRec.length}건 중 지급완료 ${paidCount}건 · 예정 ${monthRec.length - paidCount}건`
      : '';
  }

  // 내 휴무
  const doEl = document.getElementById('mypage-dayoffs');
  doEl.innerHTML = (myDayoffs || []).length
    ? myDayoffs.map((d) => `<div class="py-1">🛌 ${esc(d.start_date)} ~ ${esc(d.end_date)}</div>`).join('')
    : '<p class="text-gray-400">신청한 휴무가 없습니다.</p>';

  // 휴무 신청 폼
  const form = document.getElementById('mypage-dayoff-form');
  form.onsubmit = async (e) => {
    e.preventDefault();
    const start = document.getElementById('mypage-dayoff-start').value;
    const end = document.getElementById('mypage-dayoff-end').value;
    if (!start || !end || end < start) { showToast('날짜를 확인하세요', 'error'); return; }
    if (USE_MOCK_DATA) { showToast('휴무 신청됨 (데모 모드)'); return; }
    const { error } = await supabase
      .from('partner_day_offs')
      .insert([{ partner_id: pid, start_date: start, end_date: end }]);
    if (error) { showToast('휴무 신청 실패: ' + error.message, 'error'); return; }
    showToast('휴무가 신청되었습니다');
    renderMyPage(session);
  };
}

// ═══════════════════════════════════════
//  탭 전환
// ═══════════════════════════════════════

function setupTabs() {
  document.querySelectorAll('[data-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      currentTab = btn.dataset.tab;
      document.querySelectorAll('[data-tab]').forEach((b) => {
        b.classList.toggle('tab-active', b.dataset.tab === currentTab);
        b.classList.toggle('tab-inactive', b.dataset.tab !== currentTab);
      });
      document.getElementById('panel-partners').classList.toggle('hidden', currentTab !== 'partners');
      document.getElementById('panel-assignments').classList.toggle('hidden', currentTab !== 'assignments');
      document.getElementById('panel-payroll').classList.toggle('hidden', currentTab !== 'payroll');
      document.getElementById('panel-schedule').classList.toggle('hidden', currentTab !== 'schedule');
      if (currentTab === 'payroll') {
        initPayrollPanel();
      }
      if (currentTab === 'schedule') {
        renderUnifiedCalendar();
      }
    });
  });
}

// ─── 폼 이벤트 ───
function setupForms() {
  const partnerForm = document.getElementById('form-partner');
  const assignmentForm = document.getElementById('form-assignment');
  partnerForm.removeEventListener('submit', handleAddPartner);
  assignmentForm.removeEventListener('submit', handleAddAssignment);
  partnerForm.addEventListener('submit', handleAddPartner);
  assignmentForm.addEventListener('submit', handleAddAssignment);

  const phoneInput = partnerForm.querySelector('input[name="phone"]');
  phoneInput.addEventListener('input', () => {
    phoneInput.value = formatPhoneNumber(phoneInput.value);
  });
}

function setupDayOffForm() {
  const form = document.getElementById('form-dayoff');
  if (!form) return;
  form.addEventListener('submit', handleAddDayOff);

  const startInput = document.getElementById('dayoff-start');
  startInput.addEventListener('change', () => {
    const endInput = document.getElementById('dayoff-end');
    if (!endInput.value || endInput.value < startInput.value) {
      endInput.value = startInput.value;
    }
    endInput.min = startInput.value;
  });
}

// ─── 파트너 검색 ───
function setupPartnerSearch() {
  const searchInput = document.getElementById('partner-search');
  searchInput.addEventListener('input', () => {
    renderPartners(searchInput.value.trim());
  });
}

// ─── 엑셀 내보내기/가져오기 ───
function setupExcelEvents() {
  // 급여 명세 다운로드 (현재 선택된 월)
  const exportBtn = document.getElementById('payroll-export-btn');
  if (exportBtn) {
    exportBtn.addEventListener('click', async () => {
      const month = document.getElementById('payroll-stat-month')?.value;
      if (!month) { showToast('조회할 월을 먼저 선택하세요', 'error'); return; }
      const monthRecords = payrollRecords.filter(
        (r) => r.work_date && r.work_date.startsWith(month)
      );
      if (monthRecords.length === 0) { showToast('해당 월의 급여 데이터가 없습니다', 'error'); return; }
      try {
        await exportPayroll(month, monthRecords, partners);
        showToast(`${month} 급여 명세를 다운로드했습니다`);
      } catch (err) {
        showToast('엑셀 생성 실패: ' + err.message, 'error');
      }
    });
  }

  // 파트너 양식 다운로드
  const tplBtn = document.getElementById('partner-template-btn');
  if (tplBtn) {
    tplBtn.addEventListener('click', async () => {
      try { await downloadPartnerTemplate(); } catch (err) { showToast('양식 생성 실패: ' + err.message, 'error'); }
    });
  }

  // 파트너 대량 등록 (파일 선택 → 파싱 → insert)
  const importBtn = document.getElementById('partner-import-btn');
  const fileInput = document.getElementById('partner-import-file');
  const status = document.getElementById('partner-import-status');
  if (importBtn && fileInput) {
    importBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', async () => {
      const file = fileInput.files[0];
      if (!file) return;
      if (status) status.textContent = '파일 읽는 중…';
      try {
        const rows = await parsePartnerFile(file);
        if (rows.length === 0) {
          showToast('등록할 파트너가 없습니다. 양식을 확인하세요', 'error');
          if (status) status.textContent = '';
          return;
        }
        const { error } = await supabase.from('partners').insert(
          rows.map((r) => ({
            name: r.name, phone: r.phone || '', region: r.region || '', specialty: r.specialty || '정리수납',
          }))
        );
        if (error) {
          showToast('대량 등록 실패: ' + error.message, 'error');
          if (status) status.textContent = '';
          return;
        }
        showToast(`${rows.length}명의 파트너가 등록되었습니다`);
        if (status) status.textContent = `✅ ${rows.length}명 등록 완료`;
        await loadPartners();
      } catch (err) {
        showToast('엑셀 처리 실패: ' + err.message, 'error');
        if (status) status.textContent = '';
      } finally {
        fileInput.value = '';
      }
    });
  }
}

// ═══════════════════════════════════════
//  대시보드 통계
// ═══════════════════════════════════════

function updateDashboard() {
  const total = partners.length;
  const active = partners.filter(p => p.is_active).length;
  const pending = assignments.filter(a => a.status === '대기').length;
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const completed = assignments.filter(a =>
    (a.status === '완료' || a.status === '종료') && a.assignment_date >= monthStart
  ).length;

  document.getElementById('stat-total').textContent = total;
  document.getElementById('stat-active').textContent = active;
  document.getElementById('stat-pending').textContent = pending;
  document.getElementById('stat-completed').textContent = completed;
}

// ═══════════════════════════════════════
//  파트너 CRUD
// ═══════════════════════════════════════

async function loadPartners() {
  if (USE_MOCK_DATA) {
    partners = MOCK_PARTNERS.map(p => ({ ...p, phone: '', created_at: '2026-07-01T00:00:00Z' }));
  } else {
    const { data, error } = await supabase
      .from('partners')
      .select('*')
      .order('name', { ascending: true });
    if (error) { showToast('파트너 목록 로딩 실패: ' + error.message, 'error'); return; }
    partners = data || [];
  }
  renderPartners();
  populateTeamSelect();
  populateDayOffSelect();
  populateManagerPartnerSelect();
  updateDashboard();
}

function renderPartners(searchQuery = '') {
  const container = document.getElementById('partner-list');
  let filtered = partners;
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    filtered = partners.filter(p => p.name.toLowerCase().includes(q));
  }

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="text-center py-12 text-gray-400 sm:col-span-2 lg:col-span-3">
        <p class="text-lg">${searchQuery ? '검색 결과가 없습니다' : '등록된 파트너가 없습니다'}</p>
        <p class="text-sm mt-1">${searchQuery ? '다른 검색어를 입력하세요' : '위 양식에서 새 파트너를 등록하세요'}</p>
      </div>`;
    return;
  }

  container.innerHTML = filtered
    .map(
      (p) => `
    <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-5 hover:shadow-md transition-shadow" data-partner-id="${p.id}">
      <div class="flex items-start justify-between">
        <div class="flex-1 min-w-0">
          <h3 class="text-lg font-semibold text-gray-800">${esc(p.name)}</h3>
          <p class="text-sm text-gray-500 mt-1">${p.region ? esc(p.region) : '<span class=&quot;text-gray-300&quot;>지역 미입력</span>'}</p>
          <p class="text-sm text-gray-500">${p.phone ? esc(p.phone) : '<span class=&quot;text-gray-300&quot;>연락처 미입력</span>'}</p>
          <p class="text-sm text-gray-400">${esc(p.specialty)}</p>
        </div>
        <span class="px-3 py-1 text-xs font-medium rounded-full shrink-0 ${
          p.is_active
            ? 'bg-emerald-50 text-emerald-700'
            : 'bg-gray-100 text-gray-500'
        }">
          ${p.is_active ? '활동중' : '비활동'}
        </span>
      </div>
      <div class="mt-3 pt-3 border-t border-gray-50 flex gap-2">
        <button onclick="editPartner('${p.id}')"
          class="text-xs px-3 py-1.5 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors">
          수정
        </button>
        <button onclick="togglePartnerActive('${p.id}', ${!p.is_active})"
          class="text-xs px-3 py-1.5 rounded-lg ${
            p.is_active
              ? 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
          } transition-colors">
          ${p.is_active ? '비활성화' : '활성화'}
        </button>
        <button onclick="deletePartner('${p.id}', '${esc(p.name)}')"
          class="text-xs px-3 py-1.5 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 transition-colors">
          삭제
        </button>
      </div>
    </div>`
    )
    .join('');
}

async function handleAddPartner(e) {
  e.preventDefault();
  const form = e.target;
  const name = form.name.value.trim();
  const phone = form.phone.value.trim();
  const region = form.region.value.trim();
  const specialty = form.specialty.value.trim() || '정리수납';

  if (phone && !validatePhone(phone)) {
    showToast('전화번호 형식이 올바르지 않습니다 (예: 010-1234-5678)', 'error');
    return;
  }

  const { error } = await supabase
    .from('partners')
    .insert([{ name, phone: phone || '', region: region || '', specialty }]);

  if (error) {
    showToast('등록 실패: ' + error.message, 'error');
    return;
  }

  showToast(`${name} 파트너가 등록되었습니다`);
  form.reset();
  form.specialty.value = '정리수납';
  await loadPartners();
}

window.togglePartnerActive = async function (id, isActive) {
  const { error } = await supabase
    .from('partners')
    .update({ is_active: isActive })
    .eq('id', id);

  if (error) {
    showToast('상태 변경 실패: ' + error.message, 'error');
    return;
  }
  showToast(isActive ? '파트너가 활성화되었습니다' : '파트너가 비활성화되었습니다');
  await loadPartners();
};

window.deletePartner = async function (id, name) {
  if (!confirm(`"${name}" 파트너를 삭제하시겠습니까?\n관련 배정 기록도 함께 삭제됩니다.`)) return;

  const { error } = await supabase
    .from('partners')
    .delete()
    .eq('id', id);

  if (error) {
    showToast('삭제 실패: ' + error.message, 'error');
    return;
  }
  showToast(`${name} 파트너가 삭제되었습니다`);
  await loadPartners();
  await loadAssignments();
};

window.editPartner = function (id) {
  const p = partners.find(x => x.id === id);
  if (!p) return;
  const card = document.querySelector(`#partner-list [data-partner-id="${id}"]`);
  if (!card) return;

  card.innerHTML = `
    <div class="space-y-3">
      <h3 class="text-lg font-semibold text-gray-800">${esc(p.name)}</h3>
      <div>
        <label class="block text-xs font-medium text-gray-500 mb-1">전화번호</label>
        <input type="tel" id="edit-phone-${id}" value="${p.phone || ''}"
          class="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm
                 focus:ring-2 focus:ring-brand-200 focus:border-brand-500 outline-none transition"
          placeholder="010-1234-5678" />
      </div>
      <div>
        <label class="block text-xs font-medium text-gray-500 mb-1">활동 지역</label>
        <input type="text" id="edit-region-${id}" value="${p.region || ''}"
          class="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm
                 focus:ring-2 focus:ring-brand-200 focus:border-brand-500 outline-none transition"
          placeholder="제주시" />
      </div>
      <div class="flex gap-2">
        <button onclick="savePartnerEdit('${id}')"
          class="text-xs px-4 py-2 bg-brand-700 text-white rounded-xl hover:bg-brand-800 transition-all font-semibold">
          저장
        </button>
        <button onclick="cancelPartnerEdit()"
          class="text-xs px-4 py-2 bg-gray-100 text-gray-600 rounded-xl hover:bg-gray-200 transition-colors">
          취소
        </button>
      </div>
    </div>`;

  const editPhone = document.getElementById(`edit-phone-${id}`);
  editPhone.addEventListener('input', () => {
    editPhone.value = formatPhoneNumber(editPhone.value);
  });
};

window.savePartnerEdit = async function (id) {
  const phone = document.getElementById(`edit-phone-${id}`).value.trim();
  const region = document.getElementById(`edit-region-${id}`).value.trim();

  if (phone && !validatePhone(phone)) {
    showToast('전화번호 형식이 올바르지 않습니다 (예: 010-1234-5678)', 'error');
    return;
  }

  const { error } = await supabase
    .from('partners')
    .update({ phone: phone || '', region: region || '' })
    .eq('id', id);

  if (error) {
    showToast('수정 실패: ' + error.message, 'error');
    return;
  }

  showToast('파트너 정보가 수정되었습니다');
  await loadPartners();
};

window.cancelPartnerEdit = function () {
  renderPartners();
};

// ═══════════════════════════════════════
//  배정(Assignment) CRUD
// ═══════════════════════════════════════

async function loadAssignments() {
  if (USE_MOCK_DATA) {
    assignments = MOCK_ASSIGNMENTS.map(a => {
      const leaderP = partners.find(p => p.id === a.leader_id);
      return { ...a, leader: leaderP ? { name: leaderP.name, region: leaderP.region } : null };
    });
  } else {
    const { data, error } = await supabase
      .from('assignments')
      .select('*, leader:partners!leader_id(name, region)')
      .order('assignment_date', { ascending: false });
    if (error) { showToast('배정 목록 로딩 실패: ' + error.message, 'error'); return; }
    assignments = data || [];
  }
  renderAssignments();
  if (assignmentView === 'calendar') renderCalendar();
  updateDashboard();
}

function renderAssignments() {
  const container = document.getElementById('assignment-list');

  const filterStatus = document.getElementById('filter-status')?.value || 'all';
  const filtered =
    filterStatus === 'all'
      ? assignments
      : assignments.filter((a) => a.status === filterStatus);

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="text-center py-12 text-gray-400 sm:col-span-2">
        <p class="text-lg">배정 내역이 없습니다</p>
        <p class="text-sm mt-1">${filterStatus !== 'all' ? '다른 필터를 선택하거나 ' : ''}새 배정을 등록하세요</p>
      </div>`;
    return;
  }

  container.innerHTML = filtered
    .map(
      (a) => {
      const leaderName = a.leader ? esc(a.leader.name) : '미지정';
      const memberNames = getMemberNames(a.member_ids);
      const teamHtml = memberNames.length > 0
        ? `<p class="text-sm text-brand-700 font-medium mt-1">👑 팀장: ${leaderName}</p>
           <p class="text-sm text-brand-500 mt-0.5">👥 팀원: ${memberNames.map(n => esc(n)).join(', ')}</p>`
        : `<p class="text-sm text-brand-700 font-medium mt-1">담당: ${leaderName}</p>`;
      return `
    <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-5 hover:shadow-md transition-shadow">
      <div class="flex items-start justify-between">
        <div class="flex-1">
          <div class="flex items-center gap-2">
            <h3 class="text-lg font-semibold text-gray-800">${esc(a.client_name)}</h3>
            ${memberNames.length > 0 ? `<span class="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">${memberNames.length + 1}명</span>` : ''}
          </div>
          <p class="text-sm text-gray-500 mt-1">${esc(a.client_address)}</p>
          <p class="text-sm text-gray-500">${a.assignment_date}</p>
          ${teamHtml}
          ${a.notes ? `<p class="text-sm text-gray-400 mt-1">${esc(a.notes)}</p>` : ''}
        </div>
      </div>
      <div class="mt-3 pt-3 border-t border-gray-50 flex items-center gap-2 flex-wrap">
        <select onchange="updateStatus('${a.id}', this.value)"
          class="text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 font-medium outline-none
                 focus:ring-2 focus:ring-brand-200 focus:border-brand-500 transition
                 ${a.status === '대기' ? 'bg-amber-50 text-amber-700 border-amber-200' : a.status === '완료' ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-gray-100 text-gray-500 border-gray-300'}">
          <option value="대기" ${a.status === '대기' ? 'selected' : ''}>⏳ 대기</option>
          <option value="완료" ${a.status === '완료' ? 'selected' : ''}>✅ 완료</option>
          <option value="종료" ${a.status === '종료' ? 'selected' : ''}>🏁 종료</option>
        </select>
        <button onclick="deleteAssignment('${a.id}')"
          class="text-xs px-3 py-1.5 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 transition-colors">
          삭제
        </button>
      </div>
    </div>`}
    )
    .join('');
}

function populateTeamSelect() {
  const leaderSelect = document.getElementById('assign-leader');
  if (!leaderSelect) return;
  const activePartners = partners.filter((p) => p.is_active);

  leaderSelect.innerHTML =
    '<option value="">팀장 선택</option>' +
    activePartners
      .map((p) => `<option value="${p.id}">${esc(p.name)}${p.region ? ' (' + esc(p.region) + ')' : ''}</option>`)
      .join('');

  const container = document.getElementById('member-checkboxes');
  if (!container) return;

  if (activePartners.length === 0) {
    container.innerHTML = '<p class="text-xs text-gray-400 py-2 text-center">활동 중인 파트너가 없습니다</p>';
    return;
  }

  container.innerHTML = activePartners
    .map((p) => `
      <label class="member-item" data-partner-id="${p.id}">
        <input type="checkbox" name="members" value="${p.id}"
          class="w-3.5 h-3.5 rounded border-gray-300 text-brand-600 focus:ring-brand-500">
        <span class="text-xs text-gray-700">${esc(p.name)}</span>
        ${p.region ? `<span class="text-[10px] text-gray-400">(${esc(p.region)})</span>` : ''}
      </label>`)
    .join('');

  updateMemberCount();

  leaderSelect.onchange = () => {
    const leaderId = leaderSelect.value;
    container.querySelectorAll('label[data-partner-id]').forEach((label) => {
      const cb = label.querySelector('input[type="checkbox"]');
      const isLeader = label.dataset.partnerId === leaderId;
      cb.disabled = isLeader;
      if (isLeader) cb.checked = false;
      label.classList.toggle('disabled', isLeader);
    });
    updateMemberCount();
  };

  container.onchange = updateMemberCount;
}

function updateMemberCount() {
  const checked = document.querySelectorAll('#member-checkboxes input[type="checkbox"]:checked');
  const el = document.getElementById('member-count');
  if (el) el.textContent = `선택된 팀원: ${checked.length}명`;
}

function getSelectedMemberIds() {
  return Array.from(document.querySelectorAll('#member-checkboxes input[type="checkbox"]:checked'))
    .map((cb) => cb.value);
}

function getMemberNames(memberIds) {
  if (!memberIds || memberIds.length === 0) return [];
  return memberIds
    .map((id) => partners.find((p) => p.id === id))
    .filter(Boolean)
    .map((p) => p.name);
}

async function handleAddAssignment(e) {
  e.preventDefault();
  const form = e.target;
  const leader_id = form.leader.value;
  const member_ids = getSelectedMemberIds();
  const client_name = form.client_name.value.trim();
  const client_address = form.client_address.value.trim();
  const assignment_date = form.assignment_date.value;
  const notes = form.notes.value.trim();
  const visit_time = form.visit_time?.value || null;

  if (!leader_id) {
    showToast('팀장을 선택하세요', 'error');
    return;
  }

  const allTeamIds = [leader_id, ...member_ids];
  const conflicting = getConflictingPartners(allTeamIds, assignment_date);
  if (conflicting.length > 0) {
    const names = conflicting.map(c => c.name).join(', ');
    showToast(`휴무일 충돌: ${names}님이 ${assignment_date}에 휴무입니다`, 'error');
    return;
  }

  // 이중 배정 검사 — 같은 날 다른 현장에 이미 배정된 파트너 경고 (실수 방지, 필요 시 override)
  const doubleBooked = getDoubleBookedPartners(allTeamIds, assignment_date);
  if (doubleBooked.length > 0) {
    const detail = doubleBooked.map(d => `${d.name}(${d.site})`).join(', ');
    if (!confirm(
      `⚠️ 이중 배정 주의\n${assignment_date}에 이미 다른 현장에 배정된 파트너가 있습니다:\n\n${detail}\n\n그래도 배정하시겠습니까?`
    )) {
      return;
    }
  }

  const row = { leader_id, member_ids, client_name, client_address, assignment_date, notes };
  if (visit_time) row.visit_time = visit_time; // v6 컬럼. 값 없으면 참조 안 함(마이그레이션 전 안전)
  const { error } = await supabase.from('assignments').insert([row]);

  if (error) {
    showToast('배정 등록 실패: ' + error.message, 'error');
    return;
  }

  const teamSize = 1 + member_ids.length;
  showToast(`새 배정이 등록되었습니다 (${teamSize}명 배정)`);
  form.reset();
  populateTeamSelect();
  await loadAssignments();
}

window.updateStatus = async function (id, newStatus) {
  const current = assignments.find(a => a.id === id);
  if (current && current.status === newStatus) return;

  const { error } = await supabase
    .from('assignments')
    .update({ status: newStatus })
    .eq('id', id);

  if (error) {
    showToast('상태 변경 실패: ' + error.message, 'error');
    return;
  }
  const labels = { '대기': '대기 상태로', '완료': '매칭 완료', '종료': '작업 종료' };
  showToast(`${labels[newStatus] || newStatus} 처리되었습니다`);
  await loadAssignments();
};

window.deleteAssignment = async function (id) {
  if (!confirm('이 배정을 삭제하시겠습니까?')) return;

  const { error } = await supabase
    .from('assignments')
    .delete()
    .eq('id', id);

  if (error) {
    showToast('삭제 실패: ' + error.message, 'error');
    return;
  }
  showToast('배정이 삭제되었습니다');
  await loadAssignments();
};

window.filterAssignments = function () {
  renderAssignments();
  renderCalendar();
};

// ═══════════════════════════════════════
//  달력 뷰
// ═══════════════════════════════════════

window.switchAssignmentView = function (view) {
  assignmentView = view;
  const btnList = document.getElementById('btn-view-list');
  const btnCal = document.getElementById('btn-view-calendar');
  const listEl = document.getElementById('assignment-list');
  const calEl = document.getElementById('assignment-calendar');

  if (view === 'list') {
    btnList.className = 'view-toggle-active px-3 py-1 text-xs font-medium transition-all';
    btnCal.className = 'view-toggle-inactive px-3 py-1 text-xs font-medium transition-all';
    listEl.classList.remove('hidden');
    calEl.classList.add('hidden');
  } else {
    btnCal.className = 'view-toggle-active px-3 py-1 text-xs font-medium transition-all';
    btnList.className = 'view-toggle-inactive px-3 py-1 text-xs font-medium transition-all';
    calEl.classList.remove('hidden');
    listEl.classList.add('hidden');
    renderCalendar();
  }
};

window.calendarPrevMonth = function () {
  calMonth--;
  if (calMonth < 0) { calMonth = 11; calYear--; }
  renderCalendar();
};

window.calendarNextMonth = function () {
  calMonth++;
  if (calMonth > 11) { calMonth = 0; calYear++; }
  renderCalendar();
};

window.calendarGoToday = function () {
  const now = new Date();
  calYear = now.getFullYear();
  calMonth = now.getMonth();
  renderCalendar();
};

function renderCalendar() {
  const titleEl = document.getElementById('calendar-title');
  const gridEl = document.getElementById('calendar-grid');
  if (!titleEl || !gridEl) return;

  titleEl.textContent = `${calYear}년 ${calMonth + 1}월`;

  const filterStatus = document.getElementById('filter-status')?.value || 'all';
  const filtered = filterStatus === 'all'
    ? assignments
    : assignments.filter(a => a.status === filterStatus);

  const byDate = {};
  filtered.forEach(a => {
    const d = a.assignment_date;
    if (!d) return;
    if (!byDate[d]) byDate[d] = [];
    byDate[d].push(a);
  });

  const firstDay = new Date(calYear, calMonth, 1).getDay();
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  const totalCells = Math.ceil((firstDay + daysInMonth) / 7) * 7;
  let html = '';

  for (let i = 0; i < totalCells; i++) {
    const dayNum = i - firstDay + 1;
    const isCurrentMonth = dayNum >= 1 && dayNum <= daysInMonth;
    const dateStr = isCurrentMonth
      ? `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`
      : '';
    const isToday = dateStr === todayStr;
    const dayOfWeek = i % 7;
    const isSunday = dayOfWeek === 0;
    const isSaturday = dayOfWeek === 6;

    const cellBg = isCurrentMonth ? (isToday ? 'bg-brand-50' : 'bg-white') : 'bg-gray-50';
    const entries = isCurrentMonth && byDate[dateStr] ? byDate[dateStr] : [];

    html += `<div class="cal-cell ${cellBg} p-1 flex flex-col">`;

    if (isCurrentMonth) {
      const dayColor = isSunday ? 'text-red-500' : isSaturday ? 'text-blue-500' : 'text-gray-700';
      const todayRing = isToday ? 'bg-brand-700 text-white rounded-full w-6 h-6 flex items-center justify-center' : '';
      html += `<div class="text-xs font-semibold ${dayColor} mb-0.5 flex items-center justify-between">`;
      html += todayRing
        ? `<span class="${todayRing}">${dayNum}</span>`
        : `<span>${dayNum}</span>`;
      if (entries.length > 0) {
        html += `<span class="text-[9px] font-normal text-gray-400">${entries.length}건</span>`;
      }
      html += `</div>`;

      html += `<div class="flex-1 overflow-y-auto space-y-px" style="max-height:90px;">`;
      entries.forEach(a => {
        const leaderName = a.leader ? a.leader.name : '?';
        const memberCount = (a.member_ids || []).length;
        const region = extractRegion(a.client_address);
        const teamSuffix = memberCount > 0 ? ` 외 ${memberCount}명` : '';
        const label = `${a.client_name}${region ? '_' + region : ''}_${leaderName}${teamSuffix}`;
        const statusStyles = {
          '대기': 'bg-amber-50 text-amber-800 border-l-2 border-amber-400',
          '완료': 'bg-blue-50 text-blue-800 border-l-2 border-blue-400',
          '종료': 'bg-gray-100 text-gray-500 border-l-2 border-gray-300',
        };
        const style = statusStyles[a.status] || 'bg-gray-50 text-gray-600';
        const fullMembers = getMemberNames(a.member_ids);
        const tooltip = memberCount > 0
          ? `[${a.status}] ${a.client_name} / 팀장: ${leaderName} / 팀원: ${fullMembers.join(', ')}`
          : `[${a.status}] ${a.client_name} / 담당: ${leaderName}`;
        html += `<div class="cal-entry ${style}" title="${esc(tooltip)}" onclick="openAssignmentModal('${a.id}')">${esc(label)}</div>`;
      });
      html += `</div>`;
    }

    html += `</div>`;
  }

  gridEl.innerHTML = html;
}

// ═══════════════════════════════════════
//  배정 상세 모달
// ═══════════════════════════════════════

window.openAssignmentModal = function (id) {
  const a = assignments.find(x => x.id === id);
  if (!a) return;

  const modal = document.getElementById('assignment-modal');
  document.getElementById('modal-client-name').textContent = a.client_name;
  document.getElementById('modal-address').textContent = a.client_address;
  document.getElementById('modal-date').textContent = a.assignment_date;

  const statusBarColors = { '대기': 'bg-amber-400', '완료': 'bg-blue-500', '종료': 'bg-gray-400' };
  document.getElementById('modal-status-bar').className = `h-1.5 ${statusBarColors[a.status] || 'bg-gray-300'}`;

  const statusEl = document.getElementById('modal-status');
  const statusBadgeStyles = { '대기': 'bg-amber-50 text-amber-700', '완료': 'bg-blue-50 text-blue-700', '종료': 'bg-gray-100 text-gray-500' };
  statusEl.className = `px-2.5 py-0.5 text-xs font-medium rounded-full ${statusBadgeStyles[a.status] || ''}`;
  statusEl.textContent = a.status;

  const leaderName = a.leader ? a.leader.name : '미지정';
  const leaderRegion = a.leader && a.leader.region ? ` (${a.leader.region})` : '';
  const memberNames = getMemberNames(a.member_ids);
  let teamHtml = `<div class="flex items-center gap-2">
    <span class="text-sm">👑</span>
    <span class="text-sm font-medium text-gray-800">${esc(leaderName)}${esc(leaderRegion)}</span>
    <span class="text-[10px] text-gray-400">팀장</span>
  </div>`;
  memberNames.forEach(name => {
    teamHtml += `<div class="flex items-center gap-2">
      <span class="text-sm">👤</span>
      <span class="text-sm text-gray-700">${esc(name)}</span>
      <span class="text-[10px] text-gray-400">팀원</span>
    </div>`;
  });
  document.getElementById('modal-team').innerHTML = teamHtml;

  const notesSection = document.getElementById('modal-notes-section');
  if (a.notes) {
    document.getElementById('modal-notes').textContent = a.notes;
    notesSection.classList.remove('hidden');
  } else {
    notesSection.classList.add('hidden');
  }

  modal.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
};

window.closeAssignmentModal = function () {
  document.getElementById('assignment-modal').classList.add('hidden');
  document.body.style.overflow = '';
};

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    const modal = document.getElementById('assignment-modal');
    if (modal && !modal.classList.contains('hidden')) {
      closeAssignmentModal();
    }
  }
});

// ═══════════════════════════════════════
//  휴무일 관리
// ═══════════════════════════════════════

function populateDayOffSelect() {
  const select = document.getElementById('dayoff-partner');
  if (!select) return;
  const activePartners = partners.filter(p => p.is_active);
  select.innerHTML =
    '<option value="">파트너 선택</option>' +
    activePartners
      .map(p => `<option value="${p.id}">${esc(p.name)}${p.region ? ' (' + esc(p.region) + ')' : ''}</option>`)
      .join('');
}

async function loadDayOffs() {
  if (USE_MOCK_DATA) {
    dayOffs = [];
  } else {
    const { data, error } = await supabase
      .from('partner_day_offs')
      .select('*')
      .order('start_date', { ascending: true });
    if (error) { showToast('휴무일 로딩 실패: ' + error.message, 'error'); return; }
    dayOffs = data || [];
  }
  renderDayOffCalendar();
}

async function handleAddDayOff(e) {
  e.preventDefault();
  const partnerId = document.getElementById('dayoff-partner').value;
  const startDate = document.getElementById('dayoff-start').value;
  const endDate = document.getElementById('dayoff-end').value;
  const reason = document.getElementById('dayoff-reason').value.trim();

  if (!partnerId) {
    showToast('파트너를 선택하세요', 'error');
    return;
  }
  if (endDate < startDate) {
    showToast('종료일은 시작일 이후여야 합니다', 'error');
    return;
  }

  const { error } = await supabase
    .from('partner_day_offs')
    .insert([{ partner_id: partnerId, start_date: startDate, end_date: endDate, reason }]);

  if (error) {
    showToast('휴무일 등록 실패: ' + error.message, 'error');
    return;
  }

  const partner = partners.find(p => p.id === partnerId);
  showToast(`${partner ? partner.name : ''} 휴무일이 등록되었습니다 (${startDate} ~ ${endDate})`);
  document.getElementById('form-dayoff').reset();
  await loadDayOffs();
}

function getConflictingPartners(partnerIds, dateStr) {
  const results = [];
  for (const pid of partnerIds) {
    const isOff = dayOffs.some(d =>
      d.partner_id === pid && dateStr >= d.start_date && dateStr <= d.end_date
    );
    if (isOff) {
      const partner = partners.find(p => p.id === pid);
      if (partner) results.push(partner);
    }
  }
  return results;
}

// 같은 날짜에 이미 다른 배정(현장)에 포함된 파트너 찾기 (이중 배정 방지)
// excludeAssignmentId: 수정 시 자기 자신 배정은 제외
function getDoubleBookedPartners(partnerIds, dateStr, excludeAssignmentId = null) {
  const idSet = new Set(partnerIds);
  const results = [];
  const seen = new Set();
  for (const a of assignments) {
    if (a.assignment_date !== dateStr) continue;
    if (excludeAssignmentId && a.id === excludeAssignmentId) continue;
    const assigned = [a.leader_id, ...(a.member_ids || [])];
    for (const pid of assigned) {
      if (idSet.has(pid) && !seen.has(pid)) {
        seen.add(pid);
        const partner = partners.find(p => p.id === pid);
        results.push({ name: partner ? partner.name : '알 수 없음', site: a.client_name });
      }
    }
  }
  return results;
}

window.dayoffCalPrev = function () {
  dayoffCalMonth--;
  if (dayoffCalMonth < 0) { dayoffCalMonth = 11; dayoffCalYear--; }
  renderDayOffCalendar();
};

window.dayoffCalNext = function () {
  dayoffCalMonth++;
  if (dayoffCalMonth > 11) { dayoffCalMonth = 0; dayoffCalYear++; }
  renderDayOffCalendar();
};

window.dayoffCalToday = function () {
  const now = new Date();
  dayoffCalYear = now.getFullYear();
  dayoffCalMonth = now.getMonth();
  renderDayOffCalendar();
};

window.deleteDayOff = async function (id) {
  if (!confirm('이 휴무일을 삭제하시겠습니까?')) return;
  const { error } = await supabase
    .from('partner_day_offs')
    .delete()
    .eq('id', id);
  if (error) {
    showToast('삭제 실패: ' + error.message, 'error');
    return;
  }
  showToast('휴무일이 삭제되었습니다');
  await loadDayOffs();
};

function renderDayOffCalendar() {
  const titleEl = document.getElementById('dayoff-cal-title');
  const gridEl = document.getElementById('dayoff-cal-grid');
  if (!titleEl || !gridEl) return;

  titleEl.textContent = `${dayoffCalYear}년 ${dayoffCalMonth + 1}월`;

  const byDate = {};
  dayOffs.forEach(d => {
    const start = new Date(d.start_date + 'T00:00:00');
    const end = new Date(d.end_date + 'T00:00:00');
    for (let cur = new Date(start); cur <= end; cur.setDate(cur.getDate() + 1)) {
      const dateStr = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-${String(cur.getDate()).padStart(2, '0')}`;
      if (!byDate[dateStr]) byDate[dateStr] = [];
      byDate[dateStr].push(d);
    }
  });

  const firstDay = new Date(dayoffCalYear, dayoffCalMonth, 1).getDay();
  const daysInMonth = new Date(dayoffCalYear, dayoffCalMonth + 1, 0).getDate();
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  const totalCells = Math.ceil((firstDay + daysInMonth) / 7) * 7;
  let html = '';

  for (let i = 0; i < totalCells; i++) {
    const dayNum = i - firstDay + 1;
    const isCurrentMonth = dayNum >= 1 && dayNum <= daysInMonth;
    const dateStr = isCurrentMonth
      ? `${dayoffCalYear}-${String(dayoffCalMonth + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`
      : '';
    const isToday = dateStr === todayStr;
    const dayOfWeek = i % 7;
    const isSunday = dayOfWeek === 0;
    const isSaturday = dayOfWeek === 6;

    const entries = isCurrentMonth && byDate[dateStr] ? byDate[dateStr] : [];
    const hasDayOff = entries.length > 0;
    const cellBg = isCurrentMonth ? (isToday ? 'bg-brand-50' : hasDayOff ? 'bg-rose-50' : 'bg-white') : 'bg-gray-50';

    html += `<div class="cal-cell ${cellBg} p-1 flex flex-col">`;

    if (isCurrentMonth) {
      const dayColor = isSunday ? 'text-red-500' : isSaturday ? 'text-blue-500' : 'text-gray-700';
      const todayRing = isToday ? 'bg-brand-700 text-white rounded-full w-6 h-6 flex items-center justify-center' : '';
      html += `<div class="text-xs font-semibold ${dayColor} mb-0.5 flex items-center justify-between">`;
      html += todayRing
        ? `<span class="${todayRing}">${dayNum}</span>`
        : `<span>${dayNum}</span>`;
      if (entries.length > 0) {
        html += `<span class="text-[9px] font-normal text-rose-400">${entries.length}명</span>`;
      }
      html += `</div>`;

      html += `<div class="flex-1 overflow-y-auto space-y-px" style="max-height:90px;">`;
      const seen = new Set();
      entries.forEach(d => {
        if (seen.has(d.id)) return;
        seen.add(d.id);
        const partner = partners.find(p => p.id === d.partner_id);
        const name = partner ? partner.name : '?';
        const tooltip = d.reason
          ? `${name} 휴무 (${d.start_date} ~ ${d.end_date}) — ${d.reason}`
          : `${name} 휴무 (${d.start_date} ~ ${d.end_date})`;
        html += `<div class="dayoff-entry cursor-pointer" title="${esc(tooltip)}" onclick="deleteDayOff('${d.id}')">${esc(name)}</div>`;
      });
      html += `</div>`;
    }

    html += `</div>`;
  }

  gridEl.innerHTML = html;
}

// ═══════════════════════════════════════
//  통합 달력 (일정 관리)
// ═══════════════════════════════════════

window.uniCalPrev = function () {
  uniCalMonth--;
  if (uniCalMonth < 0) { uniCalMonth = 11; uniCalYear--; }
  renderUnifiedCalendar();
};

window.uniCalNext = function () {
  uniCalMonth++;
  if (uniCalMonth > 11) { uniCalMonth = 0; uniCalYear++; }
  renderUnifiedCalendar();
};

window.uniCalToday = function () {
  const now = new Date();
  uniCalYear = now.getFullYear();
  uniCalMonth = now.getMonth();
  renderUnifiedCalendar();
};

window.showDayOffDetail = function (dayOffId) {
  const d = dayOffs.find(x => x.id === dayOffId);
  if (!d) return;
  const partner = partners.find(p => p.id === d.partner_id);
  const name = partner ? partner.name : '알 수 없음';
  const reason = d.reason ? d.reason : '사유 없음';
  alert(`🗓️ 휴무 상세\n\n파트너: ${name}\n기간: ${d.start_date} ~ ${d.end_date}\n사유: ${reason}`);
};

function renderUnifiedCalendar() {
  const titleEl = document.getElementById('unified-cal-title');
  const gridEl = document.getElementById('unified-calendar-grid');
  if (!titleEl || !gridEl) return;

  titleEl.textContent = `${uniCalYear}년 ${uniCalMonth + 1}월`;

  const dayOffByDate = {};
  dayOffs.forEach(d => {
    const start = new Date(d.start_date + 'T00:00:00');
    const end = new Date(d.end_date + 'T00:00:00');
    for (let cur = new Date(start); cur <= end; cur.setDate(cur.getDate() + 1)) {
      const dateStr = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-${String(cur.getDate()).padStart(2, '0')}`;
      if (!dayOffByDate[dateStr]) dayOffByDate[dateStr] = [];
      dayOffByDate[dateStr].push(d);
    }
  });

  const assignByDate = {};
  assignments.forEach(a => {
    const d = a.assignment_date;
    if (!d) return;
    if (!assignByDate[d]) assignByDate[d] = [];
    assignByDate[d].push(a);
  });

  const firstDay = new Date(uniCalYear, uniCalMonth, 1).getDay();
  const daysInMonth = new Date(uniCalYear, uniCalMonth + 1, 0).getDate();
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  const totalCells = Math.ceil((firstDay + daysInMonth) / 7) * 7;
  let html = '';

  for (let i = 0; i < totalCells; i++) {
    const dayNum = i - firstDay + 1;
    const isCurrentMonth = dayNum >= 1 && dayNum <= daysInMonth;
    const dateStr = isCurrentMonth
      ? `${uniCalYear}-${String(uniCalMonth + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`
      : '';
    const isToday = dateStr === todayStr;
    const dayOfWeek = i % 7;
    const isSunday = dayOfWeek === 0;
    const isSaturday = dayOfWeek === 6;

    const dayOffEntries = isCurrentMonth && dayOffByDate[dateStr] ? dayOffByDate[dateStr] : [];
    const assignEntries = isCurrentMonth && assignByDate[dateStr] ? assignByDate[dateStr] : [];
    const totalEntries = dayOffEntries.length + assignEntries.length;

    const cellBg = isCurrentMonth ? (isToday ? 'bg-brand-50' : 'bg-white') : 'bg-gray-50';

    html += `<div class="cal-cell ${cellBg} p-1 flex flex-col">`;

    if (isCurrentMonth) {
      const dayColor = isSunday ? 'text-red-500' : isSaturday ? 'text-blue-500' : 'text-gray-700';
      const todayRing = isToday ? 'bg-brand-700 text-white rounded-full w-6 h-6 flex items-center justify-center' : '';
      html += `<div class="text-xs font-semibold ${dayColor} mb-0.5 flex items-center justify-between">`;
      html += todayRing
        ? `<span class="${todayRing}">${dayNum}</span>`
        : `<span>${dayNum}</span>`;
      if (totalEntries > 0) {
        html += `<span class="text-[9px] font-normal text-gray-400">${totalEntries}건</span>`;
      }
      html += `</div>`;

      html += `<div class="flex-1 overflow-y-auto space-y-px" style="max-height:90px;">`;

      const seenDayOff = new Set();
      dayOffEntries.forEach(d => {
        if (seenDayOff.has(d.id)) return;
        seenDayOff.add(d.id);
        const partner = partners.find(p => p.id === d.partner_id);
        const name = partner ? partner.name : '?';
        const tooltip = d.reason
          ? `[휴무] ${name} (${d.start_date} ~ ${d.end_date}) — ${d.reason}`
          : `[휴무] ${name} (${d.start_date} ~ ${d.end_date})`;
        html += `<div class="dayoff-entry cursor-pointer" title="${esc(tooltip)}" onclick="showDayOffDetail('${d.id}')">[휴무] ${esc(name)}</div>`;
      });

      assignEntries.forEach(a => {
        const leaderName = a.leader ? a.leader.name : '?';
        const region = extractRegion(a.client_address);
        const label = `[${a.status}] ${a.client_name}${region ? ' - ' + region : ''}`;
        const statusStyles = {
          '대기': 'bg-amber-50 text-amber-800 border-l-2 border-amber-400',
          '완료': 'bg-blue-50 text-blue-800 border-l-2 border-blue-400',
          '종료': 'bg-gray-100 text-gray-500 border-l-2 border-gray-300',
        };
        const style = statusStyles[a.status] || 'bg-gray-50 text-gray-600';
        const memberNames = getMemberNames(a.member_ids);
        const memberCount = (a.member_ids || []).length;
        const tooltip = memberCount > 0
          ? `[${a.status}] ${a.client_name} / 팀장: ${leaderName} / 팀원: ${memberNames.join(', ')}`
          : `[${a.status}] ${a.client_name} / 담당: ${leaderName}`;
        html += `<div class="cal-entry ${style}" title="${esc(tooltip)}" onclick="openAssignmentModal('${a.id}')">${esc(label)}</div>`;
      });

      html += `</div>`;
    }

    html += `</div>`;
  }

  gridEl.innerHTML = html;
}

// ═══════════════════════════════════════
//  유틸리티
// ═══════════════════════════════════════

function extractRegion(address) {
  if (!address) return '';
  const guMatch = address.match(/([가-힣]{1,4})구(?:\s|$|[^가-힣])/);
  if (guMatch) return guMatch[1];
  const stripped = address.replace(/^(?:서울특별시|부산광역시|대구광역시|인천광역시|광주광역시|대전광역시|울산광역시|세종특별자치시|제주특별자치도|경기도|충청북도|충청남도|전라북도|전북특별자치도|전라남도|경상북도|경상남도|강원특별자치도|강원도)\s*/, '');
  const siMatch = stripped.match(/([가-힣]{1,4})시(?:\s|$|[^가-힣])/);
  if (siMatch) return siMatch[1];
  const metroMatch = address.match(/^(서울|부산|대구|인천|광주|대전|울산|세종|제주)/);
  if (metroMatch) return metroMatch[1];
  return '';
}

function validatePhone(phone) {
  return /^\d{2,3}-\d{3,4}-\d{4}$/.test(phone);
}

function formatPhoneNumber(value) {
  const digits = value.replace(/\D/g, '');
  if (digits.length <= 3) return digits;
  if (digits.length <= 7) return digits.slice(0, 3) + '-' + digits.slice(3);
  return digits.slice(0, 3) + '-' + digits.slice(3, 7) + '-' + digits.slice(7, 11);
}

function esc(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function statusBadge(status) {
  const styles = {
    '대기': 'bg-amber-50 text-amber-700',
    '완료': 'bg-blue-50 text-blue-700',
    '종료': 'bg-gray-100 text-gray-500',
  };
  return `<span class="px-2.5 py-0.5 text-xs font-medium rounded-full ${styles[status] || ''}">${status}</span>`;
}

function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `
    px-4 py-3 rounded-xl shadow-lg text-sm font-medium
    transform transition-all duration-300 translate-y-2 opacity-0
    ${type === 'error' ? 'bg-red-600 text-white' : 'bg-gray-800 text-white'}
  `;
  toast.textContent = message;
  container.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.remove('translate-y-2', 'opacity-0');
  });

  setTimeout(() => {
    toast.classList.add('translate-y-2', 'opacity-0');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// ═══════════════════════════════════════
//  급여 정산 관리
// ═══════════════════════════════════════

function setupPayrollEvents() {
  const btn = document.getElementById('btn-payroll-search');
  if (btn) btn.addEventListener('click', searchPayrollAssignments);

  const monthSelect = document.getElementById('payroll-stat-month');
  if (monthSelect) monthSelect.addEventListener('change', renderPayrollDashboard);
}

function initPayrollPanel() {
  const startEl = document.getElementById('payroll-date-start');
  const endEl = document.getElementById('payroll-date-end');
  if (startEl && !startEl.value) {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    startEl.value = `${y}-${m}-01`;
    endEl.value = `${y}-${m}-${String(new Date(y, now.getMonth() + 1, 0).getDate()).padStart(2, '0')}`;
  }
  populatePayrollMonthSelect();
  renderPayrollDashboard();
}

function populatePayrollMonthSelect() {
  const select = document.getElementById('payroll-stat-month');
  if (!select) return;

  const months = new Set();
  const now = new Date();
  months.add(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);

  payrollRecords.forEach(r => {
    if (r.work_date) months.add(r.work_date.slice(0, 7));
  });

  const sorted = [...months].sort().reverse();
  select.innerHTML = sorted
    .map(m => {
      const [y, mo] = m.split('-');
      return `<option value="${m}">${y}년 ${parseInt(mo)}월</option>`;
    })
    .join('');
}

async function loadPayrollRecords() {
  if (USE_MOCK_DATA) {
    payrollRecords = [...MOCK_PAYROLL_RECORDS];
  } else {
    const { data, error } = await supabase
      .from('payroll_records')
      .select('*')
      .order('work_date', { ascending: false });
    if (error) { showToast('급여 데이터 로딩 실패: ' + error.message, 'error'); return; }
    payrollRecords = data || [];
  }
}

function searchPayrollAssignments() {
  const startDate = document.getElementById('payroll-date-start').value;
  const endDate = document.getElementById('payroll-date-end').value;

  if (!startDate || !endDate) {
    showToast('날짜를 선택하세요', 'error');
    return;
  }

  const completed = assignments.filter(a =>
    (a.status === '완료' || a.status === '종료') &&
    a.assignment_date >= startDate &&
    a.assignment_date <= endDate
  );

  renderPayrollAssignments(completed);
}

function renderPayrollAssignments(filtered) {
  const container = document.getElementById('payroll-assignment-list');

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="text-center py-8 text-gray-400">
        <p class="text-sm">해당 기간에 완료/종료된 배정이 없습니다</p>
      </div>`;
    return;
  }

  container.innerHTML = filtered.map(a => {
    const leaderName = a.leader ? a.leader.name : '미지정';
    const allIds = [a.leader_id, ...(a.member_ids || [])];
    const allNames = allIds.map(id => {
      const p = partners.find(x => x.id === id);
      return p ? p.name : '?';
    });

    const existingRecords = payrollRecords.filter(r => r.assignment_id === a.id);
    const isSaved = existingRecords.length > 0;
    const savedTotal = existingRecords.reduce((sum, r) => sum + r.total_amount, 0);

    const workerRows = allIds.map((id, idx) => {
      const name = allNames[idx];
      const isLeader = id === a.leader_id;
      const existing = existingRecords.find(r => r.partner_id === id);
      const rate = existing ? existing.hourly_rate : '';
      const hours = existing ? existing.hours_worked : '';
      const roleBonus = existing ? (existing.bonus || 0) : '';
      const fieldBonus = existing ? (existing.field_bonus || 0) : '';
      const total = existing ? existing.total_amount : 0;
      const rowDeduction = Math.round(total * 0.033);
      const rowNet = total - rowDeduction;
      const roleBonusLabel = isLeader ? '팀장수당' : '역할수당';

      return `
        <div class="flex items-center gap-3 py-2 ${idx > 0 ? 'border-t border-gray-50' : ''}" data-worker-row data-partner-id="${id}" data-assignment-id="${a.id}">
          <div class="w-24 shrink-0">
            <span class="text-sm font-medium text-gray-800">${isLeader ? '👑 ' : '👤 '}${esc(name)}</span>
          </div>
          <div class="flex items-center gap-2 flex-1 flex-wrap">
            <div class="flex items-center gap-1">
              <input type="number" class="payroll-rate w-20 px-2 py-1.5 rounded-lg border border-gray-200 text-sm text-right
                     focus:ring-2 focus:ring-brand-200 focus:border-brand-500 outline-none transition"
                placeholder="시급" min="1" step="1000" value="${rate}"
                oninput="calcPayrollRow(this)" />
              <span class="text-xs text-gray-400">원</span>
            </div>
            <span class="text-gray-300">×</span>
            <div class="flex items-center gap-1">
              <input type="number" class="payroll-hours w-16 px-2 py-1.5 rounded-lg border border-gray-200 text-sm text-right
                     focus:ring-2 focus:ring-brand-200 focus:border-brand-500 outline-none transition"
                placeholder="시간" min="0.5" step="0.5" value="${hours}"
                oninput="calcPayrollRow(this)" />
              <span class="text-xs text-gray-400">h</span>
            </div>
            <span class="text-gray-300">+</span>
            <div class="flex items-center gap-1">
              <input type="number" class="payroll-bonus w-20 px-2 py-1.5 rounded-lg border border-gray-200 text-sm text-right
                     focus:ring-2 focus:ring-brand-200 focus:border-brand-500 outline-none transition
                     ${isLeader ? 'bg-amber-50 border-amber-200' : ''}"
                placeholder="${roleBonusLabel}" min="0" step="1000" value="${roleBonus}"
                oninput="calcPayrollRow(this)" />
              <span class="text-xs text-gray-400">원</span>
            </div>
            <span class="text-gray-300">+</span>
            <div class="flex items-center gap-1">
              <input type="number" class="payroll-field-bonus w-20 px-2 py-1.5 rounded-lg border border-gray-200 text-sm text-right
                     focus:ring-2 focus:ring-brand-200 focus:border-brand-500 outline-none transition"
                placeholder="현장수당" min="0" step="1000" value="${fieldBonus}"
                oninput="calcPayrollRow(this)" />
              <span class="text-xs text-gray-400">원</span>
            </div>
            <span class="text-gray-300">=</span>
            <div class="w-32 text-right">
              <span class="payroll-row-total text-sm font-bold text-brand-700 block">${total ? '₩' + total.toLocaleString() : '₩0'}</span>
              <span class="payroll-row-net text-[10px] text-emerald-600 block">실지급 ₩${rowNet.toLocaleString()} <span class="text-red-400">(-₩${rowDeduction.toLocaleString()})</span></span>
            </div>
          </div>
        </div>`;
    }).join('');

    const statusBg = isSaved ? 'border-emerald-200 bg-emerald-50/30' : 'border-gray-100';

    return `
      <div class="bg-white rounded-xl shadow-sm border ${statusBg} p-5 payroll-card" data-assignment-id="${a.id}">
        <div class="flex items-center justify-between mb-3">
          <div>
            <div class="flex items-center gap-2">
              <h3 class="text-base font-bold text-gray-800">${esc(a.client_name)}</h3>
              ${isSaved ? '<span class="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-medium">저장됨</span>' : ''}
            </div>
            <p class="text-xs text-gray-500 mt-0.5">${esc(a.client_address)} · ${a.assignment_date}</p>
          </div>
          <div class="text-right">
            <p class="text-[10px] text-gray-400">배정 합계</p>
            <p class="payroll-card-total text-lg font-bold text-brand-800">${isSaved ? '₩' + savedTotal.toLocaleString() : '₩0'}</p>
            <p class="payroll-card-net text-[10px] text-emerald-600">실지급 ₩${(savedTotal - Math.round(savedTotal * 0.033)).toLocaleString()}</p>
          </div>
        </div>
        <div class="bg-gray-50 rounded-lg p-3">
          ${workerRows}
        </div>
        <div class="mt-3 flex justify-end">
          <button onclick="savePayrollForAssignment('${a.id}')"
            class="px-5 py-2 bg-brand-700 text-white text-sm font-semibold rounded-xl
                   hover:bg-brand-800 active:scale-[0.98] transition-all">
            ${isSaved ? '💾 수정 저장' : '💾 급여 저장'}
          </button>
        </div>
      </div>`;
  }).join('');
}

window.calcPayrollRow = function (input) {
  const row = input.closest('[data-worker-row]');
  const rate = parseFloat(row.querySelector('.payroll-rate').value) || 0;
  const hours = parseFloat(row.querySelector('.payroll-hours').value) || 0;
  const roleBonus = parseFloat(row.querySelector('.payroll-bonus').value) || 0;
  const fieldBonus = parseFloat(row.querySelector('.payroll-field-bonus').value) || 0;
  const total = Math.round(rate * hours) + Math.round(roleBonus) + Math.round(fieldBonus);
  const deduction = Math.round(total * 0.033);
  row.querySelector('.payroll-row-total').textContent = '₩' + total.toLocaleString();
  const netEl = row.querySelector('.payroll-row-net');
  if (netEl) {
    netEl.innerHTML = `실지급 ₩${(total - deduction).toLocaleString()} <span class="text-red-400">(-₩${deduction.toLocaleString()})</span>`;
  }

  const card = input.closest('.payroll-card');
  let cardTotal = 0;
  card.querySelectorAll('[data-worker-row]').forEach(r => {
    const rt = parseFloat(r.querySelector('.payroll-rate').value) || 0;
    const hr = parseFloat(r.querySelector('.payroll-hours').value) || 0;
    const rb = parseFloat(r.querySelector('.payroll-bonus').value) || 0;
    const fb = parseFloat(r.querySelector('.payroll-field-bonus').value) || 0;
    cardTotal += Math.round(rt * hr) + Math.round(rb) + Math.round(fb);
  });
  card.querySelector('.payroll-card-total').textContent = '₩' + cardTotal.toLocaleString();
  const cardNetEl = card.querySelector('.payroll-card-net');
  if (cardNetEl) {
    const cardDeduction = Math.round(cardTotal * 0.033);
    cardNetEl.textContent = '실지급 ₩' + (cardTotal - cardDeduction).toLocaleString();
  }
};

window.savePayrollForAssignment = async function (assignmentId) {
  const card = document.querySelector(`.payroll-card[data-assignment-id="${assignmentId}"]`);
  if (!card) return;

  const assignment = assignments.find(a => a.id === assignmentId);
  if (!assignment) return;

  const rows = card.querySelectorAll('[data-worker-row]');
  const records = [];
  let hasError = false;

  rows.forEach(row => {
    const partnerId = row.dataset.partnerId;
    const rate = parseFloat(row.querySelector('.payroll-rate').value);
    const hours = parseFloat(row.querySelector('.payroll-hours').value);
    const roleBonus = parseFloat(row.querySelector('.payroll-bonus').value) || 0;
    const fieldBonus = parseFloat(row.querySelector('.payroll-field-bonus').value) || 0;

    if (!rate || !hours) {
      hasError = true;
      return;
    }

    records.push({
      assignment_id: assignmentId,
      partner_id: partnerId,
      hourly_rate: Math.round(rate),
      hours_worked: hours,
      bonus: Math.round(roleBonus),
      field_bonus: Math.round(fieldBonus),
      total_amount: Math.round(rate * hours) + Math.round(roleBonus) + Math.round(fieldBonus),
      work_date: assignment.assignment_date,
    });
  });

  if (hasError || records.length === 0) {
    showToast('모든 근무자의 시급과 근무시간을 입력하세요', 'error');
    return;
  }

  const { error: delError } = await supabase
    .from('payroll_records')
    .delete()
    .eq('assignment_id', assignmentId);

  if (delError) {
    showToast('기존 데이터 삭제 실패: ' + delError.message, 'error');
    return;
  }

  const { error: insError } = await supabase
    .from('payroll_records')
    .insert(records);

  if (insError) {
    showToast('급여 저장 실패: ' + insError.message, 'error');
    return;
  }

  const totalAmount = records.reduce((s, r) => s + r.total_amount, 0);
  showToast(`급여가 저장되었습니다 (총 ₩${totalAmount.toLocaleString()})`);
  await loadPayrollRecords();
  searchPayrollAssignments();
  populatePayrollMonthSelect();
  renderPayrollDashboard();
};

function renderPayrollDashboard() {
  const monthSelect = document.getElementById('payroll-stat-month');
  if (!monthSelect) return;
  const selectedMonth = monthSelect.value;
  if (!selectedMonth) return;

  const monthRecords = payrollRecords.filter(r => r.work_date && r.work_date.startsWith(selectedMonth));

  const totalAmount = monthRecords.reduce((s, r) => s + r.total_amount, 0);
  const totalCount = monthRecords.length;
  const uniqueWorkers = new Set(monthRecords.map(r => r.partner_id)).size;
  const avgRate = totalCount > 0
    ? Math.round(monthRecords.reduce((s, r) => s + r.hourly_rate, 0) / totalCount)
    : 0;

  document.getElementById('payroll-stat-total').textContent = '₩' + totalAmount.toLocaleString();
  const netStatEl = document.getElementById('payroll-stat-net');
  if (netStatEl) {
    const totalDeduction = Math.round(totalAmount * 0.033);
    netStatEl.textContent = '실지급 ₩' + (totalAmount - totalDeduction).toLocaleString();
  }
  document.getElementById('payroll-stat-count').textContent = totalCount + '건';
  document.getElementById('payroll-stat-workers').textContent = uniqueWorkers + '명';
  document.getElementById('payroll-stat-avg-rate').textContent = '₩' + avgRate.toLocaleString();

  const byPartner = {};
  monthRecords.forEach(r => {
    if (!byPartner[r.partner_id]) {
      byPartner[r.partner_id] = { count: 0, totalHours: 0, totalAmount: 0, totalRoleBonus: 0, totalFieldBonus: 0, rates: [] };
    }
    byPartner[r.partner_id].count++;
    byPartner[r.partner_id].totalHours += parseFloat(r.hours_worked);
    byPartner[r.partner_id].totalAmount += r.total_amount;
    byPartner[r.partner_id].totalRoleBonus += (r.bonus || 0);
    byPartner[r.partner_id].totalFieldBonus += (r.field_bonus || 0);
    byPartner[r.partner_id].rates.push(r.hourly_rate);
  });

  const tableBody = document.getElementById('payroll-stat-table');
  const cardContainer = document.getElementById('payroll-stat-cards');
  const entries = Object.entries(byPartner)
    .sort((a, b) => b[1].totalAmount - a[1].totalAmount);

  if (entries.length === 0) {
    tableBody.innerHTML = '<tr><td colspan="7" class="text-center py-8 text-gray-400">해당 월의 급여 데이터가 없습니다</td></tr>';
    if (cardContainer) cardContainer.innerHTML = '<p class="text-center py-8 text-gray-400 text-sm">해당 월의 급여 데이터가 없습니다</p>';
    return;
  }

  tableBody.innerHTML = entries.map(([pid, data]) => {
    const partner = partners.find(p => p.id === pid);
    const name = partner ? partner.name : '알 수 없음';
    const avgPartnerRate = Math.round(data.rates.reduce((s, r) => s + r, 0) / data.rates.length);
    const deduction = Math.round(data.totalAmount * 0.033);
    const netPay = data.totalAmount - deduction;
    return `
      <tr class="hover:bg-gray-50 transition-colors">
        <td class="py-3 px-3 font-medium text-gray-800">${esc(name)}</td>
        <td class="py-3 px-3 text-center text-gray-600">${data.count}건</td>
        <td class="py-3 px-3 text-center text-gray-600">${data.totalHours}h</td>
        <td class="py-3 px-3 text-center text-gray-600">₩${avgPartnerRate.toLocaleString()}</td>
        <td class="py-3 px-3 text-right font-bold text-brand-700">₩${data.totalAmount.toLocaleString()}</td>
        <td class="py-3 px-3 text-right text-red-500">-₩${deduction.toLocaleString()}</td>
        <td class="py-3 px-3 text-right font-bold text-emerald-700">₩${netPay.toLocaleString()}</td>
      </tr>`;
  }).join('');

  if (cardContainer) {
    cardContainer.innerHTML = entries.map(([pid, data]) => {
      const partner = partners.find(p => p.id === pid);
      const name = partner ? partner.name : '알 수 없음';
      const avgPartnerRate = Math.round(data.rates.reduce((s, r) => s + r, 0) / data.rates.length);
      const basePay = data.totalAmount - data.totalRoleBonus - data.totalFieldBonus;
      const deduction = Math.round(data.totalAmount * 0.033);
      const netPay = data.totalAmount - deduction;
      return `
        <div class="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
          <div class="flex items-center justify-between mb-2">
            <span class="text-sm font-bold text-gray-800">${esc(name)}</span>
            <span class="text-base font-bold text-brand-700">₩${data.totalAmount.toLocaleString()}</span>
          </div>
          <div class="grid grid-cols-2 gap-2 text-xs">
            <div class="flex justify-between bg-gray-50 rounded-lg px-3 py-2">
              <span class="text-gray-500">근무 건수</span>
              <span class="font-semibold text-gray-700">${data.count}건</span>
            </div>
            <div class="flex justify-between bg-gray-50 rounded-lg px-3 py-2">
              <span class="text-gray-500">총 근무시간</span>
              <span class="font-semibold text-gray-700">${data.totalHours}h</span>
            </div>
            <div class="flex justify-between bg-gray-50 rounded-lg px-3 py-2">
              <span class="text-gray-500">평균 시급</span>
              <span class="font-semibold text-gray-700">₩${avgPartnerRate.toLocaleString()}</span>
            </div>
            <div class="flex justify-between bg-gray-50 rounded-lg px-3 py-2">
              <span class="text-gray-500">기본급</span>
              <span class="font-semibold text-gray-700">₩${basePay.toLocaleString()}</span>
            </div>
            ${data.totalRoleBonus > 0 ? `
            <div class="flex justify-between bg-amber-50 rounded-lg px-3 py-2">
              <span class="text-amber-600">역할수당</span>
              <span class="font-semibold text-amber-700">₩${data.totalRoleBonus.toLocaleString()}</span>
            </div>` : ''}
            ${data.totalFieldBonus > 0 ? `
            <div class="flex justify-between bg-blue-50 rounded-lg px-3 py-2">
              <span class="text-blue-600">현장수당</span>
              <span class="font-semibold text-blue-700">₩${data.totalFieldBonus.toLocaleString()}</span>
            </div>` : ''}
            <div class="flex justify-between bg-red-50 rounded-lg px-3 py-2">
              <span class="text-red-500">공제액 (3.3%)</span>
              <span class="font-semibold text-red-600">-₩${deduction.toLocaleString()}</span>
            </div>
            <div class="flex justify-between bg-emerald-50 rounded-lg px-3 py-2">
              <span class="text-emerald-600">차인지급액</span>
              <span class="font-semibold text-emerald-700">₩${netPay.toLocaleString()}</span>
            </div>
          </div>
        </div>`;
    }).join('');
  }
}
