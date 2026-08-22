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
      tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: #888; padding: 30px;">Nincs a szűrésnek megfelelő jelentkezés.</td></tr>`;
      return;
    }

    tbody.innerHTML = applications.map(a => {
      const dateStr = new Date(a.created_at).toLocaleString('hu-HU');
      const formBadge = a.form_type === 'disability' 
        ? `<span class="badge disability">Megváltozott</span>` 
        : `<span class="badge standard">Normál</span>`;

      return `
        <tr>
          <td style="white-space: nowrap; font-size: 13px;">${dateStr}<br>${formBadge}</td>
          <td><strong>${escapeHtml(a.full_name)}</strong><br><span style="font-size: 12px; color: #666;">Szül: ${a.birth_year}</span></td>
          <td>${escapeHtml(a.restaurant_name)}</td>
          <td><strong>${escapeHtml(a.position_title)}</strong></td>
          <td style="font-size: 13px;">📧 ${escapeHtml(a.email)}<br>📞 ${escapeHtml(a.phone)}</td>
          <td style="font-size: 13px;">${escapeHtml(a.education_level)}</td>
          <td style="text-align: center;">${a.is_student ? '✅ Igen' : '❌ Nem'}</td>
          <td style="white-space: nowrap;">
            <div style="display: flex; gap: 6px; align-items: center;">
              <a href="/uploads/${a.cv_filename}" target="_blank" class="admin-btn secondary" style="padding: 4px 8px; font-size: 12px; text-decoration: none;" title="Önéletrajz megnyitása">
                📥 CV
              </a>
              <button onclick="window.deleteApplication(${a.id}, '${escapeHtml(a.full_name)}')" class="admin-btn" style="background-color: #fee2e2; color: #dc2626; border: 1px solid #fca5a5; padding: 4px 8px; font-size: 12px;" title="Jelentkezés törlése">
                🗑️ Törlés
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }

  // Global Delete Handler
  window.deleteApplication = async function(id, name) {
    if (!confirm(`Biztosan véglegesen törölni szeretné ${name || 'ezt a'} jelentkezést?`)) {
      return;
    }

    try {
      const res = await fetch(`/api/admin/applications/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok && data.success) {
        loadApplications();
        if (typeof loadStats === 'function') loadStats();
      } else {
        alert(data.error || 'Hiba történt a törlés során!');
      }
    } catch (err) {
      alert('Hálózati hiba a törlés során: ' + err.message);
    }
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

      // Top Stats Cards
      const totalAll = stats.monthlySummary.reduce((acc, curr) => acc + curr.total_count, 0);
      document.getElementById('stat-total-count').innerText = totalAll;

      const topRest = stats.restaurantSummary[0];
      document.getElementById('stat-top-restaurant').innerText = topRest && topRest.count > 0 ? `${topRest.restaurant_name} (${topRest.count})` : '-';

      const topPos = stats.positionSummary[0];
      document.getElementById('stat-top-position').innerText = topPos && topPos.count > 0 ? `${topPos.position_title} (${topPos.count})` : '-';

      // Render Monthly Stats Table
      const monthlyTbody = document.querySelector('#monthly-stats-table tbody');
      if (stats.monthlySummary.length === 0) {
        monthlyTbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: #888;">Még nem érkeztek jelentkezések.</td></tr>`;
      } else {
        monthlyTbody.innerHTML = stats.monthlySummary.map(m => `
          <tr>
            <td><strong>${m.month}</strong></td>
            <td>${m.standard_count}</td>
            <td>${m.disability_count}</td>
            <td><strong>${m.total_count}</strong></td>
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
      restTbody.innerHTML = stats.restaurantSummary.map(r => `
        <tr>
          <td>${escapeHtml(r.restaurant_name)}</td>
          <td><strong>${r.count} fő</strong></td>
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
