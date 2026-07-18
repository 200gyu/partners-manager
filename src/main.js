import { supabase } from './supabase.js';
import { getSession, onAuthStateChange, signIn, signUp, signOut } from './auth.js';

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

// ─── 초기화 ───
document.addEventListener('DOMContentLoaded', async () => {
  setupAuthForms();
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

function showApp(session) {
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('app-screen').classList.remove('hidden');
  document.getElementById('user-email').textContent = session.user.email;
  setupTabs();
  setupForms();
  setupDayOffForm();
  loadPartners();
  loadAssignments();
  loadDayOffs();
  setupPartnerSearch();
}

function showLogin() {
  document.getElementById('app-screen').classList.add('hidden');
  document.getElementById('login-screen').classList.remove('hidden');
  partners = [];
  assignments = [];
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
  const { data, error } = await supabase
    .from('partners')
    .select('*')
    .order('name', { ascending: true });

  if (error) {
    showToast('파트너 목록 로딩 실패: ' + error.message, 'error');
    return;
  }
  partners = data || [];
  renderPartners();
  populateTeamSelect();
  populateDayOffSelect();
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
    <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-5 hover:shadow-md transition-shadow">
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

// ═══════════════════════════════════════
//  배정(Assignment) CRUD
// ═══════════════════════════════════════

async function loadAssignments() {
  const { data, error } = await supabase
    .from('assignments')
    .select('*, leader:partners!leader_id(name, region)')
    .order('assignment_date', { ascending: false });

  if (error) {
    showToast('배정 목록 로딩 실패: ' + error.message, 'error');
    return;
  }
  assignments = data || [];
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

  const { error } = await supabase
    .from('assignments')
    .insert([{ leader_id, member_ids, client_name, client_address, assignment_date, notes }]);

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
  const { data, error } = await supabase
    .from('partner_day_offs')
    .select('*')
    .order('start_date', { ascending: true });

  if (error) {
    showToast('휴무일 로딩 실패: ' + error.message, 'error');
    return;
  }
  dayOffs = data || [];
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
