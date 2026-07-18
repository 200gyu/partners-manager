import { supabase } from './supabase.js';
import { getSession, onAuthStateChange, signIn, signUp, signOut } from './auth.js';

// ─── 상태 ───
let partners = [];
let assignments = [];
let currentTab = 'partners';

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
  loadPartners();
  loadAssignments();
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
  populatePartnerSelect();
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
    .select('*, partners(name, region)')
    .order('assignment_date', { ascending: false });

  if (error) {
    showToast('배정 목록 로딩 실패: ' + error.message, 'error');
    return;
  }
  assignments = data || [];
  renderAssignments();
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
      (a) => `
    <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-5 hover:shadow-md transition-shadow">
      <div class="flex items-start justify-between">
        <div class="flex-1">
          <div class="flex items-center gap-2">
            <h3 class="text-lg font-semibold text-gray-800">${esc(a.client_name)}</h3>
            ${statusBadge(a.status)}
          </div>
          <p class="text-sm text-gray-500 mt-1">${esc(a.client_address)}</p>
          <p class="text-sm text-gray-500">${a.assignment_date}</p>
          <p class="text-sm text-brand-700 font-medium mt-1">담당: ${
            a.partners ? esc(a.partners.name) : '미지정'
          }</p>
          ${a.notes ? `<p class="text-sm text-gray-400 mt-1">${esc(a.notes)}</p>` : ''}
        </div>
      </div>
      <div class="mt-3 pt-3 border-t border-gray-50 flex gap-2 flex-wrap">
        ${
          a.status === '대기'
            ? `<button onclick="updateStatus('${a.id}', '완료')"
                class="text-xs px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors">
                매칭 완료
              </button>`
            : ''
        }
        ${
          a.status === '완료'
            ? `<button onclick="updateStatus('${a.id}', '종료')"
                class="text-xs px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors">
                작업 종료
              </button>`
            : ''
        }
        ${
          a.status !== '종료'
            ? `<button onclick="deleteAssignment('${a.id}')"
                class="text-xs px-3 py-1.5 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 transition-colors">
                삭제
              </button>`
            : ''
        }
      </div>
    </div>`
    )
    .join('');
}

function populatePartnerSelect() {
  const select = document.getElementById('assign-partner');
  if (!select) return;
  const activePartners = partners.filter((p) => p.is_active);
  select.innerHTML =
    '<option value="">파트너 선택</option>' +
    activePartners
      .map((p) => `<option value="${p.id}">${esc(p.name)}${p.region ? ' (' + esc(p.region) + ')' : ''}</option>`)
      .join('');
}

async function handleAddAssignment(e) {
  e.preventDefault();
  const form = e.target;
  const partner_id = form.partner.value;
  const client_name = form.client_name.value.trim();
  const client_address = form.client_address.value.trim();
  const assignment_date = form.assignment_date.value;
  const notes = form.notes.value.trim();

  if (!partner_id) {
    showToast('담당 파트너를 선택하세요', 'error');
    return;
  }

  const { error } = await supabase
    .from('assignments')
    .insert([{ partner_id, client_name, client_address, assignment_date, notes }]);

  if (error) {
    showToast('배정 등록 실패: ' + error.message, 'error');
    return;
  }

  showToast('새 배정이 등록되었습니다');
  form.reset();
  await loadAssignments();
}

window.updateStatus = async function (id, newStatus) {
  const { error } = await supabase
    .from('assignments')
    .update({ status: newStatus })
    .eq('id', id);

  if (error) {
    showToast('상태 변경 실패: ' + error.message, 'error');
    return;
  }
  const label = { '완료': '매칭 완료', '종료': '작업 종료' };
  showToast(`${label[newStatus] || newStatus} 처리되었습니다`);
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
};

// ═══════════════════════════════════════
//  유틸리티
// ═══════════════════════════════════════

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
