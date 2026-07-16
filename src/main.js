import { supabase } from './supabase.js';

// ─── 상태 ───
let partners = [];
let assignments = [];
let currentTab = 'partners';

// ─── 초기화 ───
document.addEventListener('DOMContentLoaded', () => {
  setupTabs();
  setupForms();
  loadPartners();
  loadAssignments();
});

// ─── 탭 전환 ───
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
  document.getElementById('form-partner').addEventListener('submit', handleAddPartner);
  document.getElementById('form-assignment').addEventListener('submit', handleAddAssignment);
}

// ═══════════════════════════════════════
//  파트너 CRUD
// ═══════════════════════════════════════

async function loadPartners() {
  const { data, error } = await supabase
    .from('partners')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    showToast('파트너 목록 로딩 실패: ' + error.message, 'error');
    return;
  }
  partners = data || [];
  renderPartners();
  populatePartnerSelect();
}

function renderPartners() {
  const container = document.getElementById('partner-list');
  if (partners.length === 0) {
    container.innerHTML = `
      <div class="text-center py-12 text-gray-400">
        <p class="text-lg">등록된 파트너가 없습니다</p>
        <p class="text-sm mt-1">위 양식에서 새 파트너를 등록하세요</p>
      </div>`;
    return;
  }

  container.innerHTML = partners
    .map(
      (p) => `
    <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-5 hover:shadow-md transition-shadow">
      <div class="flex items-start justify-between">
        <div>
          <h3 class="text-lg font-semibold text-gray-800">${esc(p.name)}</h3>
          <p class="text-sm text-gray-500 mt-1">📍 ${esc(p.region)}</p>
          <p class="text-sm text-gray-500">📞 ${esc(p.phone)}</p>
          <p class="text-sm text-gray-500">🏷️ ${esc(p.specialty)}</p>
        </div>
        <span class="px-3 py-1 text-xs font-medium rounded-full ${
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

  if (!validatePhone(phone)) {
    showToast('전화번호 형식이 올바르지 않습니다 (예: 010-1234-5678)', 'error');
    return;
  }

  const { error } = await supabase
    .from('partners')
    .insert([{ name, phone, region, specialty }]);

  if (error) {
    showToast('등록 실패: ' + error.message, 'error');
    return;
  }

  showToast(`${name} 파트너가 등록되었습니다`);
  form.reset();
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
      <div class="text-center py-12 text-gray-400">
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
          <p class="text-sm text-gray-500 mt-1">📍 ${esc(a.client_address)}</p>
          <p class="text-sm text-gray-500">📅 ${a.assignment_date}</p>
          <p class="text-sm text-indigo-600 font-medium mt-1">👤 담당: ${
            a.partners ? esc(a.partners.name) : '미지정'
          }</p>
          ${a.notes ? `<p class="text-sm text-gray-400 mt-1">💬 ${esc(a.notes)}</p>` : ''}
        </div>
      </div>
      <div class="mt-3 pt-3 border-t border-gray-50 flex gap-2 flex-wrap">
        ${
          a.status === '대기'
            ? `<button onclick="updateStatus('${a.id}', '완료')"
                class="text-xs px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors">
                ✅ 매칭 완료
              </button>`
            : ''
        }
        ${
          a.status === '완료'
            ? `<button onclick="updateStatus('${a.id}', '종료')"
                class="text-xs px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors">
                🏁 작업 종료
              </button>`
            : ''
        }
        ${
          a.status !== '종료'
            ? `<button onclick="deleteAssignment('${a.id}')"
                class="text-xs px-3 py-1.5 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 transition-colors">
                🗑️ 삭제
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
      .map((p) => `<option value="${p.id}">${esc(p.name)} (${esc(p.region)})</option>`)
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
