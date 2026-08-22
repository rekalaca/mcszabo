(function () {
  'use strict';

  let token = localStorage.getItem('ks_admin_token') || null;
  let adminUsername = localStorage.getItem('ks_admin_user') || 'admin';
  let matrixData = null;

  // DOM Elements
  const loginScreen = document.getElementById('login-screen');
  const dashboardScreen = document.getElementById('dashboard-screen');
  const loginForm = document.getElementById('login-form');
  const loginAlert = document.getElementById('login-alert');
  const logoutBtn = document.getElementById('logout-btn');
  const adminUserNameSpan = document.getElementById('admin-user-name');

  // Check auth state on load
  if (token) {
    showDashboard();
  } else {
    showLogin();
  }

  function showLogin() {
    loginScreen.style.display = 'flex';
    dashboardScreen.style.display = 'none';
  }

  function showDashboard() {
    loginScreen.style.display = 'none';
    dashboardScreen.style.display = 'flex';
    if (adminUserNameSpan) adminUserNameSpan.innerText = adminUsername;

    loadMatrixData();
    loadApplications();
    loadStats();
  }

  // Handle Login Form Submit
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    loginAlert.innerHTML = '';

    const username = document.getElementById('login-username').value;
    const password = document.getElementById('login-password').value;

    try {
      const response = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Hibás bejelentkezés');

      token = data.token;
      adminUsername = data.username;
      localStorage.setItem('ks_admin_token', token);
      localStorage.setItem('ks_admin_user', adminUsername);

      showDashboard();
    } catch (err) {
      loginAlert.innerHTML = `<div style="color: #da291c; font-size: 14px; margin-bottom: 15px;">❌ ${err.message}</div>`;
    }
  });

  // Handle Logout
  logoutBtn.addEventListener('click', () => {
    token = null;
    localStorage.removeItem('ks_admin_token');
    localStorage.removeItem('ks_admin_user');
    showLogin();
  });

  // Tab Navigation
  const navItems = document.querySelectorAll('.nav-item');
  const tabContents = document.querySelectorAll('.tab-content');

  navItems.forEach(item => {
    item.addEventListener('click', () => {
      const targetTab = item.dataset.tab;
      navItems.forEach(i => i.classList.remove('active'));
      tabContents.forEach(c => c.classList.remove('active'));

      item.classList.add('active');
      document.getElementById(`tab-${targetTab}`).classList.add('active');
    });
  });

  // -------------------------------------------------------------
  // TAB 1: MATRIX (OPEN POSITIONS PER RESTAURANT)
  // -------------------------------------------------------------
  async function loadMatrixData() {
    try {
      const response = await fetch('/api/admin/matrix', {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.status === 401 || response.status === 403) {
        logoutBtn.click();
        return;
      }

      matrixData = await response.json();
      renderMatrixTable();
      populateFilterDropdowns();
    } catch (err) {
      console.error('Failed to load matrix:', err);
    }
  }

  function renderMatrixTable() {
    const table = document.getElementById('matrix-table');
    const { restaurants, positions, matrix } = matrixData;

    // Build Header
    let thead = `<tr><th>Munkakör / Étterem</th>`;
    restaurants.forEach(r => {
      thead += `<th>${r.name}</th>`;
    });
    thead += `</tr>`;
    table.querySelector('thead').innerHTML = thead;

    // Build Body
    let tbody = '';
    positions.forEach(p => {
      tbody += `<tr><td><strong>${p.title}</strong></td>`;
      restaurants.forEach(r => {
        const matrixEntry = matrix.find(m => m.restaurant_id === r.id && m.position_id === p.id);
        const isOpen = matrixEntry ? matrixEntry.is_open === 1 : false;

        tbody += `
          <td>
            <label class="toggle-switch">
              <input type="checkbox" data-restaurant="${r.id}" data-position="${p.id}" ${isOpen ? 'checked' : ''} onchange="window.toggleMatrixPosition(${r.id}, ${p.id}, this.checked)">
              <span class="toggle-slider"></span>
            </label>
          </td>
        `;
      });
      tbody += `</tr>`;
    });
    table.querySelector('tbody').innerHTML = tbody;
  }

  window.toggleMatrixPosition = async function (restaurantId, positionId, isOpen) {
    try {
      const response = await fetch('/api/admin/matrix/toggle', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          restaurant_id: restaurantId,
          position_id: positionId,
          is_open: isOpen
        })
      });
      if (!response.ok) throw new Error('Nem sikerült frissíteni a pozíciót');
    } catch (err) {
      alert('Hiba történt a pozíció frissítésekor: ' + err.message);
      loadMatrixData(); // revert UI on failure
    }
  };

  document.getElementById('refresh-matrix-btn').addEventListener('click', loadMatrixData);

  function populateFilterDropdowns() {
    const restSelect = document.getElementById('filter-restaurant');
    const posSelect = document.getElementById('filter-position');

    restSelect.innerHTML = `<option value="">Összes Étterem</option>` +
      matrixData.restaurants.map(r => `<option value="${r.id}">${r.name}</option>`).join('');

    posSelect.innerHTML = `<option value="">Összes Munkakör</option>` +
      matrixData.positions.map(p => `<option value="${p.id}">${p.title}</option>`).join('');
  }

  // -------------------------------------------------------------
  // TAB 2: APPLICATIONS LIST
  // -------------------------------------------------------------
  async function loadApplications() {
    const search = document.getElementById('filter-search').value;
    const restaurant_id = document.getElementById('filter-restaurant').value;
    const position_id = document.getElementById('filter-position').value;
    const form_type = document.getElementById('filter-formtype').value;

    const params = new URLSearchParams();
    if (search) params.append('search', search);
    if (restaurant_id) params.append('restaurant_id', restaurant_id);
    if (position_id) params.append('position_id', position_id);
    if (form_type) params.append('form_type', form_type);

    try {
      const response = await fetch(`/api/admin/applications?${params.toString()}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();
      renderApplicationsTable(data.applications || []);
    } catch (err) {
      console.error('Error loading applications:', err);
    }
  }

  function renderApplicationsTable(applications) {
    const tbody = document.querySelector('#applications-table tbody');
    if (applications.length === 0) {
      tbody.innerHTML = `<tr><td colspan="9" style="text-align: center; color: #888; padding: 30px; font-family: 'Montserrat', sans-serif;">Nincs a szűrésnek megfelelő jelentkezés.</td></tr>`;
      return;
    }

    tbody.innerHTML = applications.map(a => {
      const d = new Date(a.created_at);
      const datePart = d.toLocaleDateString('hu-HU', { year: 'numeric', month: '2-digit', day: '2-digit' });
      const timePart = d.toLocaleTimeString('hu-HU', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      const formBadge = a.form_type === 'disability' 
        ? `<span class="badge disability">Megváltozott</span>` 
        : `<span class="badge standard">Normál</span>`;

      const isIntezve = a.status === 'intezve';
      const rowClass = isIntezve ? 'app-row-handled' : 'app-row-pending';
      const cleanPhone = (a.phone || '').replace(/[^0-9+]/g, '');

      return `
        <tr class="${rowClass}" id="app-row-${a.id}">
          <td style="white-space: nowrap; font-size: 13px; width: 110px;">
            <strong>${datePart}</strong><br>
            <span style="color: #666; font-size: 12px;">${timePart}</span><br>
            ${formBadge}
          </td>
          <td>
            <strong>${escapeHtml(a.full_name)}</strong><br>
            <span style="font-size: 12px; color: #666;">Szül: ${a.birth_year}</span>
          </td>
          <td>${escapeHtml(a.restaurant_name)}</td>
          <td><strong>${escapeHtml(a.position_title)}</strong></td>
          <td style="font-size: 13px;">
            <a href="mailto:${encodeURIComponent(a.email)}" class="admin-contact-link" title="Email küldése levelezőprogrammal">📧 ${escapeHtml(a.email)}</a><br>
            <a href="tel:${cleanPhone}" class="admin-contact-link" title="Hívás indítása telefonon">📞 ${escapeHtml(a.phone)}</a>
          </td>
          <td style="font-size: 13px; max-width: 140px; word-break: break-word; line-height: 1.3;">
            ${escapeHtml(a.education_level)}
          </td>
          <td style="text-align: center;">${a.is_student ? '✅ Igen' : '❌ Nem'}</td>
          <td style="white-space: nowrap; width: 180px;">
            <div style="display: flex; gap: 6px; align-items: center;">
              <a href="/uploads/${a.cv_filename}" target="_blank" class="admin-btn secondary" style="padding: 5px 9px; font-size: 12px; text-decoration: none;" title="Önéletrajz megnyitása">
                📄 Önéletrajz
              </a>
              <button onclick="window.confirmDeleteApplication(${a.id}, '${escapeHtml(a.full_name)}')" class="admin-btn" style="background-color: #fee2e2; color: #dc2626; border: 1px solid #fca5a5; padding: 5px 9px; font-size: 12px;" title="Jelentkezés törlése">
                🗑️ Törlés
              </button>
            </div>
          </td>
          <td style="text-align: center; width: 100px;">
            <label class="status-toggle-wrap" title="Kattintson az állapot módosításához">
              <input type="checkbox" ${isIntezve ? 'checked' : ''} onchange="window.toggleApplicationStatus(${a.id}, this.checked)">
              <span class="status-badge-chip ${isIntezve ? 'handled' : 'pending'}" id="status-chip-${a.id}">
                ${isIntezve ? 'Intézve' : 'Új'}
              </span>
            </label>
          </td>
        </tr>
      `;
    }).join('');
  }

  // Toggle Application Handled/Pending Status
  window.toggleApplicationStatus = async function(id, isChecked) {
    const newStatus = isChecked ? 'intezve' : 'uj';
    const row = document.getElementById(`app-row-${id}`);
    const chip = document.getElementById(`status-chip-${id}`);

    if (row) {
      row.className = isChecked ? 'app-row-handled' : 'app-row-pending';
    }
    if (chip) {
      chip.className = `status-badge-chip ${isChecked ? 'handled' : 'pending'}`;
      chip.innerText = isChecked ? 'Intézve' : 'Új';
    }

    try {
      const res = await fetch(`/api/admin/applications/${id}/status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ status: newStatus })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        showAdminAlertModal({ type: 'error', title: 'Hiba', message: data.error || 'Nem sikerült az állapot mentése!' });
        loadApplications();
      }
    } catch (err) {
      showAdminAlertModal({ type: 'error', title: 'Hálózati hiba', message: err.message });
      loadApplications();
    }
  };

  // Delete Application Confirmation with Montserrat Custom Modal
  window.confirmDeleteApplication = function(id, name) {
    showAdminConfirmModal({
      title: 'Jelentkezés törlése',
      message: `Biztosan véglegesen törölni szeretné <strong>${name || 'ezt a'}</strong> jelentkezést az adatbázisból?`,
      confirmText: '🗑️ Igen, törlöm',
      cancelText: 'Mégse',
      onConfirm: async () => {
        try {
          const res = await fetch(`/api/admin/applications/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
          });
          const data = await res.json();
          if (res.ok && data.success) {
            loadApplications();
            if (typeof loadStats === 'function') loadStats();
            showAdminAlertModal({ type: 'success', title: 'Sikeres törlés', message: 'A jelentkezés sikeresen el lett távolítva.' });
          } else {
            showAdminAlertModal({ type: 'error', title: 'Hiba történt', message: data.error || 'Nem sikerült törölni a jelentkezést!' });
          }
        } catch (err) {
          showAdminAlertModal({ type: 'error', title: 'Hiba', message: 'Hálózati hiba a törlés során: ' + err.message });
        }
      }
    });
  };

  // Custom Admin Modal Handlers (Montserrat Typography)
  window.showAdminConfirmModal = function({ title, message, confirmText = 'Igen', cancelText = 'Mégse', onConfirm }) {
    const overlay = document.getElementById('admin-modal-overlay');
    const icon = document.getElementById('admin-modal-icon');
    const titleEl = document.getElementById('admin-modal-title');
    const bodyEl = document.getElementById('admin-modal-body');
    const actionsEl = document.getElementById('admin-modal-actions');

    if (!overlay) return;

    icon.className = 'admin-modal-icon-wrap danger';
    icon.innerText = '🗑️';
    titleEl.innerText = title;
    bodyEl.innerHTML = message;

    actionsEl.innerHTML = `
      <button class="admin-modal-btn cancel" id="admin-modal-cancel-btn">${cancelText}</button>
      <button class="admin-modal-btn danger" id="admin-modal-confirm-btn">${confirmText}</button>
    `;

    overlay.classList.add('active');

    const close = () => overlay.classList.remove('active');
    document.getElementById('admin-modal-cancel-btn').onclick = close;
    document.getElementById('admin-modal-confirm-btn').onclick = () => {
      close();
      if (onConfirm) onConfirm();
    };
  };

  window.showAdminAlertModal = function({ type = 'success', title, message, buttonText = 'Rendben', onClose }) {
    const overlay = document.getElementById('admin-modal-overlay');
    const icon = document.getElementById('admin-modal-icon');
    const titleEl = document.getElementById('admin-modal-title');
    const bodyEl = document.getElementById('admin-modal-body');
    const actionsEl = document.getElementById('admin-modal-actions');

    if (!overlay) return;

    icon.className = `admin-modal-icon-wrap ${type}`;
    icon.innerText = type === 'success' ? '✓' : (type === 'error' ? '✕' : 'ℹ');
    titleEl.innerText = title;
    bodyEl.innerHTML = message;

    actionsEl.innerHTML = `
      <button class="admin-modal-btn primary" id="admin-modal-ok-btn">${buttonText}</button>
    `;

    overlay.classList.add('active');

    const close = () => {
      overlay.classList.remove('active');
      if (onClose) onClose();
    };

    document.getElementById('admin-modal-ok-btn').onclick = close;
  };

  document.getElementById('apply-filters-btn').addEventListener('click', loadApplications);
  const refreshAppsBtn = document.getElementById('refresh-applications-btn');
  if (refreshAppsBtn) {
    refreshAppsBtn.addEventListener('click', () => {
      refreshAppsBtn.innerText = '⏳ Frissítés...';
      loadApplications().finally(() => {
        setTimeout(() => { refreshAppsBtn.innerText = '🔄 Frissítés'; }, 400);
      });
    });
  }
  document.getElementById('filter-search').addEventListener('keyup', (e) => {
    if (e.key === 'Enter') loadApplications();
  });

  // -------------------------------------------------------------
  // TAB 3: STATISTICS & CSV EXPORT
  // -------------------------------------------------------------
  async function loadStats() {
    try {
      const response = await fetch('/api/admin/stats', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const stats = await response.json();

      // Top Stats Cards Calculation
      const monthly = stats.monthlySummary || [];
      const restaurants = stats.restaurantSummary || [];
      const positions = stats.positionSummary || [];

      const totalAll = monthly.reduce((acc, curr) => acc + parseInt(curr.total_count || 0, 10), 0);
      document.getElementById('stat-total-count').innerText = totalAll;

      const topRest = restaurants.find(r => parseInt(r.count, 10) > 0) || restaurants[0];
      document.getElementById('stat-top-restaurant').innerText = topRest && parseInt(topRest.count, 10) > 0 
        ? `${topRest.restaurant_name} (${topRest.count})` 
        : '-';

      const topPos = positions.find(p => parseInt(p.count, 10) > 0) || positions[0];
      document.getElementById('stat-top-position').innerText = topPos && parseInt(topPos.count, 10) > 0 
        ? `${topPos.position_title} (${topPos.count})` 
        : '-';

      // Render Monthly Stats Table
      const monthlyTbody = document.querySelector('#monthly-stats-table tbody');
      if (monthly.length === 0) {
        monthlyTbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: #888; padding: 20px;">Még nem érkeztek jelentkezések.</td></tr>`;
      } else {
        monthlyTbody.innerHTML = monthly.map(m => `
          <tr>
            <td><strong>${m.month}</strong></td>
            <td>${m.standard_count || 0}</td>
            <td>${m.disability_count || 0}</td>
            <td><strong>${m.total_count || 0}</strong></td>
            <td>
              <button class="admin-btn secondary" style="padding: 4px 10px; font-size: 12px;" onclick="window.downloadCSV('${m.month}')">
                📥 CSV Letöltés
              </button>
            </td>
          </tr>
        `).join('');
      }

      // Render Restaurant Stats Table
      const restTbody = document.querySelector('#restaurant-stats-table tbody');
      restTbody.innerHTML = restaurants.map(r => `
        <tr>
          <td>${escapeHtml(r.restaurant_name)}</td>
          <td><strong>${r.count || 0} fő</strong></td>
        </tr>
      `).join('');

    } catch (err) {
      console.error('Error loading stats:', err);
    }
  }

  window.downloadCSV = function (month) {
    window.location.href = `/api/admin/stats/export?month=${month}&token=${token}`;
  };

  function escapeHtml(text) {
    if (!text) return '';
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

})();
