/**
 * APARTMENT VISITOR MANAGEMENT SYSTEM
 * Frontend Application Core Script
 */

class App {
  constructor() {
    this.currentView = 'dashboard';
    this.residents = [];
    this.visitors = [];
    this.visits = [];
    this.insideVisits = [];
    this.deleteContext = null; // { type: 'resident'|'visitor'|'visit', id: number, label: string }
    this.searchTimeouts = {};

    this.init();
  }

  init() {
    this.setupNavigation();
    this.setupClock();
    this.setupHashRouting();
    this.checkHealth();
    this.loadDashboard();
    this.setupModalDismissal();

    // Auto refresh dashboard data every 30 seconds
    setInterval(() => {
      if (this.currentView === 'dashboard') {
        this.loadDashboard(true);
      } else if (this.currentView === 'exit') {
        this.loadExitView(true);
      }
    }, 30000);
  }

  // ==========================================
  // NAVIGATION & VIEW SWITCHING
  // ==========================================

  setupNavigation() {
    // Sidebar nav clicks
    document.querySelectorAll('.sidebar-nav .nav-item').forEach(button => {
      button.addEventListener('click', () => {
        const view = button.getAttribute('data-view');
        this.switchView(view);
      });
    });

    // Mobile menu toggle
    const menuToggle = document.getElementById('menuToggle');
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('mobileOverlay');

    if (menuToggle && sidebar && overlay) {
      menuToggle.addEventListener('click', () => {
        sidebar.classList.toggle('open');
        overlay.classList.toggle('active');
      });

      overlay.addEventListener('click', () => {
        sidebar.classList.remove('open');
        overlay.classList.remove('active');
      });
    }

    // Modal background click
    document.querySelectorAll('.modal').forEach(modal => {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          this.closeModal(modal.id);
        }
      });
    });

    // Delete confirmation button click
    const btnConfirmDelete = document.getElementById('btnConfirmDeleteAction');
    if (btnConfirmDelete) {
      btnConfirmDelete.addEventListener('click', () => this.executeDelete());
    }
  }

  setupHashRouting() {
    const handleHash = () => {
      const hash = window.location.hash.replace('#', '') || 'dashboard';
      const validViews = ['dashboard', 'residents', 'visitors', 'visits', 'entry', 'exit'];
      if (validViews.includes(hash)) {
        this.switchView(hash, false);
      }
    };

    window.addEventListener('hashchange', handleHash);
    handleHash();
  }

  switchView(viewName, updateHash = true) {
    this.currentView = viewName;
    if (updateHash) {
      window.location.hash = viewName;
    }

    // Update active nav item
    document.querySelectorAll('.sidebar-nav .nav-item').forEach(btn => {
      if (btn.getAttribute('data-view') === viewName) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    // Update visible view section
    document.querySelectorAll('.page-view').forEach(view => {
      view.classList.remove('active');
    });

    const targetView = document.getElementById(`view-${viewName}`);
    if (targetView) {
      targetView.classList.add('active');
    }

    // Update Header Titles
    const titles = {
      dashboard: { title: 'Dashboard Overview', subtitle: 'Real-time statistics and apartment security control' },
      residents: { title: 'Residents Management', subtitle: 'Directory of apartment flats, owners, and contact details' },
      visitors: { title: 'Visitors Directory', subtitle: 'Manage regular guests, service providers, and contact cards' },
      visits: { title: 'Visits Management Log', subtitle: 'Complete chronological history of entry and exit records' },
      entry: { title: 'Visitor Entry Gate', subtitle: 'Authorize and check-in incoming guests with live timestamps' },
      exit: { title: 'Visitor Exit & Checkout Desk', subtitle: 'Manage visitors currently inside and record exit timestamps' }
    };

    if (titles[viewName]) {
      document.getElementById('pageTitle').textContent = titles[viewName].title;
      document.getElementById('pageSubtitle').textContent = titles[viewName].subtitle;
    }

    // Close mobile sidebar if open
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('mobileOverlay');
    if (sidebar) sidebar.classList.remove('open');
    if (overlay) overlay.classList.remove('active');

    // Trigger view-specific loads
    switch (viewName) {
      case 'dashboard':
        this.loadDashboard();
        break;
      case 'residents':
        this.loadResidents();
        break;
      case 'visitors':
        this.loadVisitors();
        break;
      case 'visits':
        this.loadVisits();
        break;
      case 'entry':
        this.loadEntryView();
        break;
      case 'exit':
        this.loadExitView();
        break;
    }
  }

  setupClock() {
    const updateTime = () => {
      const now = new Date();
      const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      const clockEl = document.getElementById('currentTime');
      if (clockEl) clockEl.textContent = timeStr;
    };
    updateTime();
    setInterval(updateTime, 1000);
  }

  async checkHealth() {
    try {
      const res = await fetch('/api/health');
      const data = await res.json();
      const statusText = document.getElementById('dbStatusText');
      if (statusText) {
        statusText.textContent = data.status === 'healthy' ? 'Connected' : 'Degraded';
      }
    } catch {
      const statusText = document.getElementById('dbStatusText');
      if (statusText) statusText.textContent = 'Disconnected';
    }
  }

  // ==========================================
  // VIEW 1: DASHBOARD
  // ==========================================

  async loadDashboard(silent = false) {
    try {
      const res = await fetch('/api/stats');
      const result = await res.json();

      if (!result.success) throw new Error(result.message);

      const stats = result.data;

      // Update KPI Cards
      document.getElementById('kpiTotalResidents').textContent = stats.totalResidents;
      document.getElementById('kpiTotalVisitors').textContent = stats.totalVisitors;
      document.getElementById('kpiInsideVisitors').textContent = stats.visitorsInside;
      document.getElementById('kpiCompletedVisits').textContent = stats.completedVisits;
      document.getElementById('kpiTotalVisits').textContent = stats.totalVisits;

      // Update sidebar & top badges
      const sidebarBadge = document.getElementById('sidebarInsideBadge');
      if (sidebarBadge) sidebarBadge.textContent = stats.visitorsInside;

      const dashInsideBadge = document.getElementById('dashInsideBadge');
      if (dashInsideBadge) dashInsideBadge.textContent = `${stats.visitorsInside} Active`;

      // Render Recent Visits Table
      this.renderRecentVisitsTable(stats.recentVisits);

      // Render Inside Mini List
      const insideVisitors = stats.recentVisits.filter(v => v.status === 'Inside');
      this.renderInsideMiniList(insideVisitors);

      if (!silent) {
        // Pre-fetch dropdown records in background
        this.fetchResidentsForDropdowns();
        this.fetchVisitorsForDropdowns();
      }
    } catch (err) {
      if (!silent) this.showToast('Failed to load dashboard statistics: ' + err.message, 'error');
    }
  }

  renderRecentVisitsTable(visits) {
    const tbody = document.getElementById('dashboardRecentVisitsBody');
    if (!tbody) return;

    if (!visits || visits.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" class="text-center py-4 text-muted">No visit activity recorded yet.</td></tr>`;
      return;
    }

    tbody.innerHTML = visits.map(v => `
      <tr>
        <td><strong>#${v.visit_id}</strong></td>
        <td>
          <div class="user-meta">
            <span class="user-name">${this.escapeHtml(v.visitor_name)}</span>
            <span class="user-sub">${v.visitor_phone || 'No phone'}</span>
          </div>
        </td>
        <td>
          <div class="user-meta">
            <span class="badge-flat">${this.escapeHtml(v.flat_no)}</span>
            <span class="user-sub">${this.escapeHtml(v.resident_name)}</span>
          </div>
        </td>
        <td>
          <div class="user-meta">
            <span>${this.escapeHtml(v.purpose || 'General')}</span>
            <span class="user-sub">${v.vehicle_no ? `<i class="fa-solid fa-car"></i> ${this.escapeHtml(v.vehicle_no)}` : 'Walk-in'}</span>
          </div>
        </td>
        <td>
          <small class="text-muted">${this.formatDateTime(v.entry_time)}</small>
        </td>
        <td>
          ${v.status === 'Inside'
            ? `<span class="badge badge-green">Inside</span>`
            : `<span class="badge badge-blue">Completed</span>`
          }
        </td>
        <td>
          ${v.status === 'Inside'
            ? `<button class="btn btn-warning btn-sm" onclick="app.quickExitVisit(${v.visit_id}, '${this.escapeJs(v.visitor_name)}')">
                <i class="fa-solid fa-door-closed"></i> Check Out
               </button>`
            : `<button class="btn btn-outline btn-sm" onclick="app.viewVisitDetails(${v.visit_id})">
                <i class="fa-solid fa-eye"></i> View
               </button>`
          }
        </td>
      </tr>
    `).join('');
  }

  renderInsideMiniList(insideList) {
    const container = document.getElementById('dashboardInsideMiniList');
    if (!container) return;

    if (!insideList || insideList.length === 0) {
      container.innerHTML = `<p class="text-muted text-sm text-center py-3">No visitors currently inside premises.</p>`;
      return;
    }

    container.innerHTML = insideList.slice(0, 5).map(v => `
      <div class="mini-visitor-item">
        <div class="mini-visitor-info">
          <strong>${this.escapeHtml(v.visitor_name)}</strong>
          <span>Visiting ${this.escapeHtml(v.flat_no)} (${this.escapeHtml(v.resident_name)})</span>
        </div>
        <button class="btn btn-sm btn-outline text-amber" onclick="app.quickExitVisit(${v.visit_id}, '${this.escapeJs(v.visitor_name)}')">
          <i class="fa-solid fa-right-from-bracket"></i> Exit
        </button>
      </div>
    `).join('');
  }

  // ==========================================
  // VIEW 2: RESIDENTS MANAGEMENT
  // ==========================================

  async loadResidents(query = '') {
    const tbody = document.getElementById('residentsTableBody');
    if (tbody) tbody.innerHTML = `<tr><td colspan="7" class="text-center py-4 text-muted">Loading residents...</td></tr>`;

    try {
      const url = query ? `/api/residents?q=${encodeURIComponent(query)}` : '/api/residents';
      const res = await fetch(url);
      const result = await res.json();

      if (!result.success) throw new Error(result.message);

      this.residents = result.data;
      this.renderResidentsTable(this.residents);
    } catch (err) {
      this.showToast('Failed to load residents: ' + err.message, 'error');
    }
  }

  searchResidentsDebounced() {
    clearTimeout(this.searchTimeouts.residents);
    this.searchTimeouts.residents = setTimeout(() => {
      const query = document.getElementById('searchResidents').value;
      this.loadResidents(query);
    }, 250);
  }

  renderResidentsTable(residents) {
    const tbody = document.getElementById('residentsTableBody');
    if (!tbody) return;

    if (!residents || residents.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" class="text-center py-4 text-muted">No residents found matching your search.</td></tr>`;
      return;
    }

    tbody.innerHTML = residents.map(r => `
      <tr>
        <td><strong>#${r.resident_id}</strong></td>
        <td><strong class="user-name">${this.escapeHtml(r.name)}</strong></td>
        <td><span class="badge-flat">${this.escapeHtml(r.flat_no)}</span></td>
        <td>${r.phone ? `<a href="tel:${r.phone}">${this.escapeHtml(r.phone)}</a>` : '<span class="text-muted">-</span>'}</td>
        <td>${r.email ? `<a href="mailto:${r.email}">${this.escapeHtml(r.email)}</a>` : '<span class="text-muted">-</span>'}</td>
        <td><span class="badge badge-amber">${r.total_visits || 0} visits</span></td>
        <td class="text-right">
          <div class="table-actions">
            <button class="btn-icon" title="View Details & Visits" onclick="app.viewResidentDetails(${r.resident_id})">
              <i class="fa-solid fa-eye"></i>
            </button>
            <button class="btn-icon" title="Edit Resident" onclick="app.openEditResidentModal(${r.resident_id})">
              <i class="fa-solid fa-pen-to-square"></i>
            </button>
            <button class="btn-icon text-danger" title="Delete Resident" onclick="app.confirmDelete('resident', ${r.resident_id}, '${this.escapeJs(r.name)} (${this.escapeJs(r.flat_no)})')">
              <i class="fa-solid fa-trash-can"></i>
            </button>
          </div>
        </td>
      </tr>
    `).join('');
  }

  openResidentModal() {
    document.getElementById('modalResidentTitle').textContent = 'Add New Resident';
    document.getElementById('residentId').value = '';
    document.getElementById('formResident').reset();
    this.showModal('modalResident');
  }

  async openEditResidentModal(id) {
    try {
      const res = await fetch(`/api/residents/${id}`);
      const result = await res.json();
      if (!result.success) throw new Error(result.message);

      const r = result.data;
      document.getElementById('modalResidentTitle').textContent = 'Edit Resident Information';
      document.getElementById('residentId').value = r.resident_id;
      document.getElementById('residentName').value = r.name;
      document.getElementById('residentFlat').value = r.flat_no;
      document.getElementById('residentPhone').value = r.phone || '';
      document.getElementById('residentEmail').value = r.email || '';

      this.showModal('modalResident');
    } catch (err) {
      this.showToast('Could not load resident details: ' + err.message, 'error');
    }
  }

  async handleResidentSubmit(e) {
    e.preventDefault();
    const id = document.getElementById('residentId').value;
    const name = document.getElementById('residentName').value.trim();
    const flat_no = document.getElementById('residentFlat').value.trim();
    const phone = document.getElementById('residentPhone').value.trim();
    const email = document.getElementById('residentEmail').value.trim();

    if (!name || !flat_no) {
      this.showToast('Name and Flat Number are required.', 'error');
      return;
    }

    try {
      const url = id ? `/api/residents/${id}` : '/api/residents';
      const method = id ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, flat_no, phone, email })
      });

      const result = await res.json();
      if (!result.success) throw new Error(result.message);

      this.showToast(result.message, 'success');
      this.closeModal('modalResident');
      this.loadResidents();
      this.fetchResidentsForDropdowns();
    } catch (err) {
      this.showToast('Error saving resident: ' + err.message, 'error');
    }
  }

  async viewResidentDetails(id) {
    try {
      const res = await fetch(`/api/residents/${id}`);
      const result = await res.json();
      if (!result.success) throw new Error(result.message);

      const r = result.data;
      document.getElementById('modalDetailsTitle').textContent = `Resident: ${r.name}`;

      let visitsHtml = '';
      if (r.visits && r.visits.length > 0) {
        visitsHtml = `
          <h4 class="mt-4 mb-2">Visit History (${r.visits.length})</h4>
          <div class="table-responsive">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Visitor</th>
                  <th>Purpose / Vehicle</th>
                  <th>Entry Time</th>
                  <th>Exit Time</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                ${r.visits.map(v => `
                  <tr>
                    <td><strong>${this.escapeHtml(v.visitor_name)}</strong><br><small class="text-muted">${v.visitor_phone || ''}</small></td>
                    <td>${this.escapeHtml(v.purpose || '-')}<br><small class="text-muted">${v.vehicle_no || ''}</small></td>
                    <td><small>${this.formatDateTime(v.entry_time)}</small></td>
                    <td><small>${v.exit_time ? this.formatDateTime(v.exit_time) : '-'}</small></td>
                    <td>${v.status === 'Inside' ? '<span class="badge badge-green">Inside</span>' : '<span class="badge badge-blue">Completed</span>'}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        `;
      } else {
        visitsHtml = `<p class="text-muted mt-3">No visits recorded for this resident yet.</p>`;
      }

      document.getElementById('modalDetailsContent').innerHTML = `
        <div class="details-grid">
          <div class="details-item"><label>Resident Name</label><span>${this.escapeHtml(r.name)}</span></div>
          <div class="details-item"><label>Flat / Apartment No</label><span class="badge-flat">${this.escapeHtml(r.flat_no)}</span></div>
          <div class="details-item"><label>Phone Number</label><span>${r.phone || 'N/A'}</span></div>
          <div class="details-item"><label>Email Address</label><span>${r.email || 'N/A'}</span></div>
          <div class="details-item"><label>Created At</label><span>${this.formatDateTime(r.created_at)}</span></div>
          <div class="details-item"><label>Total Registered Visits</label><span>${r.visits ? r.visits.length : 0}</span></div>
        </div>
        ${visitsHtml}
      `;

      this.showModal('modalDetails');
    } catch (err) {
      this.showToast('Failed to load resident details: ' + err.message, 'error');
    }
  }

  // ==========================================
  // VIEW 3: VISITORS MANAGEMENT
  // ==========================================

  async loadVisitors(query = '') {
    const tbody = document.getElementById('visitorsTableBody');
    if (tbody) tbody.innerHTML = `<tr><td colspan="8" class="text-center py-4 text-muted">Loading visitors...</td></tr>`;

    try {
      const url = query ? `/api/visitors?q=${encodeURIComponent(query)}` : '/api/visitors';
      const res = await fetch(url);
      const result = await res.json();

      if (!result.success) throw new Error(result.message);

      this.visitors = result.data;
      this.renderVisitorsTable(this.visitors);
    } catch (err) {
      this.showToast('Failed to load visitors: ' + err.message, 'error');
    }
  }

  searchVisitorsDebounced() {
    clearTimeout(this.searchTimeouts.visitors);
    this.searchTimeouts.visitors = setTimeout(() => {
      const query = document.getElementById('searchVisitors').value;
      this.loadVisitors(query);
    }, 250);
  }

  renderVisitorsTable(visitors) {
    const tbody = document.getElementById('visitorsTableBody');
    if (!tbody) return;

    if (!visitors || visitors.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" class="text-center py-4 text-muted">No visitors found matching your search.</td></tr>`;
      return;
    }

    tbody.innerHTML = visitors.map(v => `
      <tr>
        <td><strong>#${v.visitor_id}</strong></td>
        <td><strong class="user-name">${this.escapeHtml(v.name)}</strong></td>
        <td>${v.phone ? `<a href="tel:${v.phone}">${this.escapeHtml(v.phone)}</a>` : '<span class="text-muted">-</span>'}</td>
        <td>${v.vehicle_no ? `<span class="badge-flat"><i class="fa-solid fa-car"></i> ${this.escapeHtml(v.vehicle_no)}</span>` : '<span class="text-muted">None</span>'}</td>
        <td>${this.escapeHtml(v.purpose || '-')}</td>
        <td><span class="badge badge-amber">${v.total_visits || 0} visits</span></td>
        <td>
          ${v.currently_inside > 0
            ? `<span class="badge badge-green">Currently Inside</span>`
            : `<span class="badge badge-blue">Out</span>`
          }
        </td>
        <td class="text-right">
          <div class="table-actions">
            <button class="btn-icon" title="View Details & Visits" onclick="app.viewVisitorDetails(${v.visitor_id})">
              <i class="fa-solid fa-eye"></i>
            </button>
            <button class="btn-icon" title="Edit Visitor" onclick="app.openEditVisitorModal(${v.visitor_id})">
              <i class="fa-solid fa-pen-to-square"></i>
            </button>
            <button class="btn-icon text-danger" title="Delete Visitor" onclick="app.confirmDelete('visitor', ${v.visitor_id}, '${this.escapeJs(v.name)}')">
              <i class="fa-solid fa-trash-can"></i>
            </button>
          </div>
        </td>
      </tr>
    `).join('');
  }

  openVisitorModal() {
    document.getElementById('modalVisitorTitle').textContent = 'Register New Visitor';
    document.getElementById('visitorId').value = '';
    document.getElementById('formVisitor').reset();
    this.showModal('modalVisitor');
  }

  async openEditVisitorModal(id) {
    try {
      const res = await fetch(`/api/visitors/${id}`);
      const result = await res.json();
      if (!result.success) throw new Error(result.message);

      const v = result.data;
      document.getElementById('modalVisitorTitle').textContent = 'Edit Visitor Information';
      document.getElementById('visitorId').value = v.visitor_id;
      document.getElementById('visitorName').value = v.name;
      document.getElementById('visitorPhone').value = v.phone || '';
      document.getElementById('visitorVehicle').value = v.vehicle_no || '';
      document.getElementById('visitorPurpose').value = v.purpose || '';

      this.showModal('modalVisitor');
    } catch (err) {
      this.showToast('Could not load visitor details: ' + err.message, 'error');
    }
  }

  async handleVisitorSubmit(e) {
    e.preventDefault();
    const id = document.getElementById('visitorId').value;
    const name = document.getElementById('visitorName').value.trim();
    const phone = document.getElementById('visitorPhone').value.trim();
    const vehicle_no = document.getElementById('visitorVehicle').value.trim();
    const purpose = document.getElementById('visitorPurpose').value.trim();

    if (!name) {
      this.showToast('Visitor name is required.', 'error');
      return;
    }

    try {
      const url = id ? `/api/visitors/${id}` : '/api/visitors';
      const method = id ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, phone, vehicle_no, purpose })
      });

      const result = await res.json();
      if (!result.success) throw new Error(result.message);

      this.showToast(result.message, 'success');
      this.closeModal('modalVisitor');
      this.loadVisitors();
      this.fetchVisitorsForDropdowns();
    } catch (err) {
      this.showToast('Error saving visitor: ' + err.message, 'error');
    }
  }

  async viewVisitorDetails(id) {
    try {
      const res = await fetch(`/api/visitors/${id}`);
      const result = await res.json();
      if (!result.success) throw new Error(result.message);

      const v = result.data;
      document.getElementById('modalDetailsTitle').textContent = `Visitor: ${v.name}`;

      let visitsHtml = '';
      if (v.visits && v.visits.length > 0) {
        visitsHtml = `
          <h4 class="mt-4 mb-2">Apartment Visit History (${v.visits.length})</h4>
          <div class="table-responsive">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Host Resident</th>
                  <th>Flat No</th>
                  <th>Entry Time</th>
                  <th>Exit Time</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                ${v.visits.map(vt => `
                  <tr>
                    <td><strong>${this.escapeHtml(vt.resident_name)}</strong></td>
                    <td><span class="badge-flat">${this.escapeHtml(vt.flat_no)}</span></td>
                    <td><small>${this.formatDateTime(vt.entry_time)}</small></td>
                    <td><small>${vt.exit_time ? this.formatDateTime(vt.exit_time) : '-'}</small></td>
                    <td>${vt.status === 'Inside' ? '<span class="badge badge-green">Inside</span>' : '<span class="badge badge-blue">Completed</span>'}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        `;
      } else {
        visitsHtml = `<p class="text-muted mt-3">No visits recorded for this visitor yet.</p>`;
      }

      document.getElementById('modalDetailsContent').innerHTML = `
        <div class="details-grid">
          <div class="details-item"><label>Visitor Name</label><span>${this.escapeHtml(v.name)}</span></div>
          <div class="details-item"><label>Phone Number</label><span>${v.phone || 'N/A'}</span></div>
          <div class="details-item"><label>Vehicle Number</label><span>${v.vehicle_no || 'None'}</span></div>
          <div class="details-item"><label>Standard Purpose</label><span>${v.purpose || 'General'}</span></div>
          <div class="details-item"><label>Registered Since</label><span>${this.formatDateTime(v.created_at)}</span></div>
          <div class="details-item"><label>Total Visits</label><span>${v.visits ? v.visits.length : 0}</span></div>
        </div>
        ${visitsHtml}
      `;

      this.showModal('modalDetails');
    } catch (err) {
      this.showToast('Failed to load visitor details: ' + err.message, 'error');
    }
  }

  // ==========================================
  // VIEW 4: VISITS MANAGEMENT
  // ==========================================

  async loadVisits(query = '') {
    const tbody = document.getElementById('visitsTableBody');
    if (tbody) tbody.innerHTML = `<tr><td colspan="8" class="text-center py-4 text-muted">Loading visit logs...</td></tr>`;

    try {
      const status = document.getElementById('filterVisitStatus')?.value || 'All';
      const search = query || document.getElementById('searchVisits')?.value || '';

      const params = new URLSearchParams();
      if (status && status !== 'All') params.append('status', status);
      if (search && search.trim()) params.append('q', search.trim());

      const res = await fetch(`/api/visits?${params.toString()}`);
      const result = await res.json();

      if (!result.success) throw new Error(result.message);

      this.visits = result.data;
      this.renderVisitsTable(this.visits);
    } catch (err) {
      this.showToast('Failed to load visit records: ' + err.message, 'error');
    }
  }

  searchVisitsDebounced() {
    clearTimeout(this.searchTimeouts.visits);
    this.searchTimeouts.visits = setTimeout(() => {
      this.loadVisits();
    }, 250);
  }

  renderVisitsTable(visits) {
    const tbody = document.getElementById('visitsTableBody');
    if (!tbody) return;

    if (!visits || visits.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" class="text-center py-4 text-muted">No visit records found matching your filter.</td></tr>`;
      return;
    }

    tbody.innerHTML = visits.map(v => `
      <tr>
        <td><strong>#${v.visit_id}</strong></td>
        <td>
          <div class="user-meta">
            <strong class="user-name">${this.escapeHtml(v.visitor_name)}</strong>
            <span class="user-sub">${v.visitor_phone || 'No phone'}</span>
          </div>
        </td>
        <td>
          <div class="user-meta">
            <span class="badge-flat">${this.escapeHtml(v.flat_no)}</span>
            <span class="user-sub">${this.escapeHtml(v.resident_name)}</span>
          </div>
        </td>
        <td>
          <div class="user-meta">
            <span>${this.escapeHtml(v.purpose || '-')}</span>
            <span class="user-sub">${v.vehicle_no ? `<i class="fa-solid fa-car"></i> ${this.escapeHtml(v.vehicle_no)}` : 'Walk-in'}</span>
          </div>
        </td>
        <td><small>${this.formatDateTime(v.entry_time)}</small></td>
        <td><small>${v.exit_time ? this.formatDateTime(v.exit_time) : '<span class="text-muted">Still Inside</span>'}</small></td>
        <td>
          ${v.status === 'Inside'
            ? `<span class="badge badge-green">Inside</span>`
            : `<span class="badge badge-blue">Completed</span>`
          }
        </td>
        <td class="text-right">
          <div class="table-actions">
            ${v.status === 'Inside'
              ? `<button class="btn btn-warning btn-sm" title="Record Exit" onclick="app.quickExitVisit(${v.visit_id}, '${this.escapeJs(v.visitor_name)}')">
                  <i class="fa-solid fa-door-closed"></i> Exit
                 </button>`
              : ''
            }
            <button class="btn-icon" title="Edit Visit Record" onclick="app.openEditVisitModal(${v.visit_id})">
              <i class="fa-solid fa-pen-to-square"></i>
            </button>
            <button class="btn-icon text-danger" title="Delete Record" onclick="app.confirmDelete('visit', ${v.visit_id}, 'Visit #${v.visit_id} (${this.escapeJs(v.visitor_name)})')">
              <i class="fa-solid fa-trash-can"></i>
            </button>
          </div>
        </td>
      </tr>
    `).join('');
  }

  async openEditVisitModal(id) {
    try {
      await this.fetchResidentsForDropdowns();
      await this.fetchVisitorsForDropdowns();

      const res = await fetch(`/api/visits/${id}`);
      const result = await res.json();
      if (!result.success) throw new Error(result.message);

      const v = result.data;
      document.getElementById('editVisitId').value = v.visit_id;

      // Populate resident dropdown
      const resSelect = document.getElementById('editVisitResident');
      resSelect.innerHTML = this.residents.map(r => `
        <option value="${r.resident_id}" ${r.resident_id === v.resident_id ? 'selected' : ''}>
          ${this.escapeHtml(r.flat_no)} - ${this.escapeHtml(r.name)}
        </option>
      `).join('');

      // Populate visitor dropdown
      const visSelect = document.getElementById('editVisitVisitor');
      visSelect.innerHTML = this.visitors.map(vt => `
        <option value="${vt.visitor_id}" ${vt.visitor_id === v.visitor_id ? 'selected' : ''}>
          ${this.escapeHtml(vt.name)} (${vt.phone || 'No phone'})
        </option>
      `).join('');

      // Form timestamps
      document.getElementById('editVisitEntryTime').value = this.toInputDateTime(v.entry_time);
      document.getElementById('editVisitExitTime').value = v.exit_time ? this.toInputDateTime(v.exit_time) : '';
      document.getElementById('editVisitStatus').value = v.status;

      this.showModal('modalEditVisit');
    } catch (err) {
      this.showToast('Failed to load visit details: ' + err.message, 'error');
    }
  }

  async handleEditVisitSubmit(e) {
    e.preventDefault();
    const id = document.getElementById('editVisitId').value;
    const resident_id = document.getElementById('editVisitResident').value;
    const visitor_id = document.getElementById('editVisitVisitor').value;
    const entry_time = document.getElementById('editVisitEntryTime').value;
    const exit_time = document.getElementById('editVisitExitTime').value || null;
    const status = document.getElementById('editVisitStatus').value;

    try {
      const res = await fetch(`/api/visits/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resident_id,
          visitor_id,
          entry_time: entry_time ? entry_time.replace('T', ' ') : null,
          exit_time: exit_time ? exit_time.replace('T', ' ') : null,
          status
        })
      });

      const result = await res.json();
      if (!result.success) throw new Error(result.message);

      this.showToast(result.message, 'success');
      this.closeModal('modalEditVisit');
      this.loadVisits();
      this.loadDashboard(true);
    } catch (err) {
      this.showToast('Error updating visit: ' + err.message, 'error');
    }
  }

  // ==========================================
  // VIEW 5: VISITOR ENTRY (CHECK-IN)
  // ==========================================

  async loadEntryView() {
    await this.fetchResidentsForDropdowns();
    await this.fetchVisitorsForDropdowns();
    this.populateEntryDropdowns();

    // Default current time in entryTime field
    const nowInput = this.toInputDateTime(new Date());
    const entryTimeInput = document.getElementById('entryTime');
    if (entryTimeInput) entryTimeInput.value = nowInput;
  }

  toggleVisitorEntryType() {
    const isNew = document.querySelector('input[name="visitorType"]:checked').value === 'new';
    const groupExisting = document.getElementById('groupExistingVisitor');
    const groupNew = document.getElementById('groupNewVisitor');

    if (isNew) {
      groupExisting.classList.add('hidden');
      groupNew.classList.remove('hidden');
      document.getElementById('entryVisitorSelect').required = false;
      document.getElementById('entryNewName').required = true;
    } else {
      groupExisting.classList.remove('hidden');
      groupNew.classList.add('hidden');
      document.getElementById('entryVisitorSelect').required = true;
      document.getElementById('entryNewName').required = false;
    }
  }

  handleVisitorSelectChange() {
    const select = document.getElementById('entryVisitorSelect');
    const visitorId = parseInt(select.value, 10);
    const visitor = this.visitors.find(v => v.visitor_id === visitorId);

    if (visitor) {
      if (visitor.vehicle_no) document.getElementById('entryVehicleNo').value = visitor.vehicle_no;
      if (visitor.purpose) document.getElementById('entryPurpose').value = visitor.purpose;
    }
  }

  async handleEntrySubmit(e) {
    e.preventDefault();
    const isNew = document.querySelector('input[name="visitorType"]:checked').value === 'new';
    const resident_id = document.getElementById('entryResidentSelect').value;
    const vehicle_no = document.getElementById('entryVehicleNo').value.trim();
    const purpose = document.getElementById('entryPurpose').value.trim();
    const entryTimeRaw = document.getElementById('entryTime').value;

    let payload = {
      resident_id,
      vehicle_no: vehicle_no || null,
      purpose: purpose || 'Visit',
      entry_time: entryTimeRaw ? entryTimeRaw.replace('T', ' ') : null
    };

    if (isNew) {
      const visitor_name = document.getElementById('entryNewName').value.trim();
      const visitor_phone = document.getElementById('entryNewPhone').value.trim();
      if (!visitor_name) {
        this.showToast('Visitor name is required.', 'error');
        return;
      }
      payload.visitor_name = visitor_name;
      payload.visitor_phone = visitor_phone;
    } else {
      const visitor_id = document.getElementById('entryVisitorSelect').value;
      if (!visitor_id) {
        this.showToast('Please select a registered visitor.', 'error');
        return;
      }
      payload.visitor_id = visitor_id;
    }

    try {
      const res = await fetch('/api/visits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const result = await res.json();
      if (!result.success) throw new Error(result.message);

      this.showToast(`Visitor ${result.data.visitor_name} checked in successfully!`, 'success');
      this.resetEntryForm();

      // Refresh cached visitors and return to dashboard or exit screen
      this.fetchVisitorsForDropdowns();
      this.loadDashboard(true);
      setTimeout(() => this.switchView('dashboard'), 800);
    } catch (err) {
      this.showToast('Entry check-in failed: ' + err.message, 'error');
    }
  }

  resetEntryForm() {
    document.getElementById('formVisitorEntry').reset();
    document.querySelector('input[name="visitorType"][value="existing"]').checked = true;
    this.toggleVisitorEntryType();
    const nowInput = this.toInputDateTime(new Date());
    document.getElementById('entryTime').value = nowInput;
  }

  // Quick Check-in modal
  async handleModalEntrySubmit(e) {
    e.preventDefault();
    const resident_id = document.getElementById('modalEntryResidentSelect').value;
    const visitor_id = document.getElementById('modalEntryVisitorSelect').value;
    const visitor_name = document.getElementById('modalEntryVisitorName').value.trim();
    const visitor_phone = document.getElementById('modalEntryVisitorPhone').value.trim();
    const vehicle_no = document.getElementById('modalEntryVehicle').value.trim();
    const purpose = document.getElementById('modalEntryPurpose').value.trim();

    if (!resident_id) {
      this.showToast('Please select a resident flat.', 'error');
      return;
    }

    if (!visitor_id && !visitor_name) {
      this.showToast('Please select an existing visitor or type new visitor name.', 'error');
      return;
    }

    const payload = {
      resident_id,
      visitor_id: visitor_id || undefined,
      visitor_name: !visitor_id ? visitor_name : undefined,
      visitor_phone: !visitor_id ? visitor_phone : undefined,
      vehicle_no: vehicle_no || null,
      purpose: purpose || 'Visit'
    };

    try {
      const res = await fetch('/api/visits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const result = await res.json();
      if (!result.success) throw new Error(result.message);

      this.showToast(`Checked in ${result.data.visitor_name} to Flat ${result.data.flat_no}!`, 'success');
      this.closeModal('modalVisitorEntry');
      document.getElementById('formModalVisitorEntry').reset();

      this.loadDashboard();
      this.fetchVisitorsForDropdowns();
    } catch (err) {
      this.showToast('Check-in failed: ' + err.message, 'error');
    }
  }

  // ==========================================
  // VIEW 6: VISITOR EXIT & CHECKOUT DESK
  // ==========================================

  async loadExitView(silent = false) {
    const tbody = document.getElementById('exitTableBody');
    if (tbody && !silent) {
      tbody.innerHTML = `<tr><td colspan="8" class="text-center py-4 text-muted">Loading currently inside visitors...</td></tr>`;
    }

    try {
      const res = await fetch('/api/visits?status=Inside');
      const result = await res.json();
      if (!result.success) throw new Error(result.message);

      this.insideVisits = result.data;

      // Update badge
      const countBadge = document.getElementById('exitCountBadge');
      if (countBadge) countBadge.textContent = this.insideVisits.length;

      const sidebarBadge = document.getElementById('sidebarInsideBadge');
      if (sidebarBadge) sidebarBadge.textContent = this.insideVisits.length;

      this.renderExitTable(this.insideVisits);
    } catch (err) {
      if (!silent) this.showToast('Failed to load active inside visits: ' + err.message, 'error');
    }
  }

  filterExitTable() {
    const query = (document.getElementById('searchExitInside')?.value || '').toLowerCase().trim();
    if (!query) {
      this.renderExitTable(this.insideVisits);
      return;
    }

    const filtered = this.insideVisits.filter(v => {
      return (
        (v.visitor_name && v.visitor_name.toLowerCase().includes(query)) ||
        (v.flat_no && v.flat_no.toLowerCase().includes(query)) ||
        (v.resident_name && v.resident_name.toLowerCase().includes(query)) ||
        (v.vehicle_no && v.vehicle_no.toLowerCase().includes(query)) ||
        (v.purpose && v.purpose.toLowerCase().includes(query))
      );
    });

    this.renderExitTable(filtered);
  }

  renderExitTable(insideList) {
    const tbody = document.getElementById('exitTableBody');
    if (!tbody) return;

    if (!insideList || insideList.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" class="text-center py-5 text-muted">No visitors currently inside the premises. All clear!</td></tr>`;
      return;
    }

    tbody.innerHTML = insideList.map(v => {
      const elapsedStr = this.calculateElapsedTime(v.entry_time);
      return `
        <tr>
          <td><strong>#${v.visit_id}</strong></td>
          <td>
            <div class="user-meta">
              <strong class="user-name">${this.escapeHtml(v.visitor_name)}</strong>
              <span class="user-sub">${v.visitor_phone || 'No phone'}</span>
            </div>
          </td>
          <td>
            <div class="user-meta">
              <span class="badge-flat">${this.escapeHtml(v.flat_no)}</span>
              <span class="user-sub">${this.escapeHtml(v.resident_name)}</span>
            </div>
          </td>
          <td>${v.vehicle_no ? `<span class="badge-flat"><i class="fa-solid fa-car"></i> ${this.escapeHtml(v.vehicle_no)}</span>` : '<span class="text-muted">None</span>'}</td>
          <td>${this.escapeHtml(v.purpose || '-')}</td>
          <td><small>${this.formatDateTime(v.entry_time)}</small></td>
          <td><span class="badge badge-amber"><i class="fa-regular fa-clock"></i> ${elapsedStr}</span></td>
          <td class="text-right">
            <button class="btn btn-warning" onclick="app.quickExitVisit(${v.visit_id}, '${this.escapeJs(v.visitor_name)}')">
              <i class="fa-solid fa-door-closed"></i> Record Exit
            </button>
          </td>
        </tr>
      `;
    }).join('');
  }

  async quickExitVisit(visitId, visitorName) {
    try {
      const res = await fetch(`/api/visits/${visitId}/exit`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });

      const result = await res.json();
      if (!result.success) throw new Error(result.message);

      this.showToast(`Exit logged for ${visitorName || 'Visitor'}! Status: Completed.`, 'success');

      // Refresh current view
      if (this.currentView === 'exit') {
        this.loadExitView();
      } else if (this.currentView === 'visits') {
        this.loadVisits();
      } else {
        this.loadDashboard();
      }
    } catch (err) {
      this.showToast('Failed to record exit: ' + err.message, 'error');
    }
  }

  // ==========================================
  // DROPDOWN DATA HELPERS
  // ==========================================

  async fetchResidentsForDropdowns() {
    try {
      const res = await fetch('/api/residents');
      const result = await res.json();
      if (result.success) {
        this.residents = result.data;
        this.populateEntryDropdowns();
      }
    } catch (e) {
      console.warn('Failed to pre-fetch residents', e);
    }
  }

  async fetchVisitorsForDropdowns() {
    try {
      const res = await fetch('/api/visitors');
      const result = await res.json();
      if (result.success) {
        this.visitors = result.data;
        this.populateEntryDropdowns();
      }
    } catch (e) {
      console.warn('Failed to pre-fetch visitors', e);
    }
  }

  populateEntryDropdowns() {
    // 1. Entry Resident Select
    const entryRes = document.getElementById('entryResidentSelect');
    if (entryRes) {
      entryRes.innerHTML = `<option value="">-- Choose Resident Flat --</option>` +
        this.residents.map(r => `
          <option value="${r.resident_id}">${this.escapeHtml(r.flat_no)} - ${this.escapeHtml(r.name)}</option>
        `).join('');
    }

    // 2. Entry Visitor Select
    const entryVis = document.getElementById('entryVisitorSelect');
    if (entryVis) {
      entryVis.innerHTML = `<option value="">-- Choose a Visitor --</option>` +
        this.visitors.map(v => `
          <option value="${v.visitor_id}">${this.escapeHtml(v.name)} (${v.phone || 'No phone'})</option>
        `).join('');
    }

    // 3. Modal Entry Resident Select
    const modalEntryRes = document.getElementById('modalEntryResidentSelect');
    if (modalEntryRes) {
      modalEntryRes.innerHTML = `<option value="">-- Choose Resident Flat --</option>` +
        this.residents.map(r => `
          <option value="${r.resident_id}">${this.escapeHtml(r.flat_no)} - ${this.escapeHtml(r.name)}</option>
        `).join('');
    }

    // 4. Modal Entry Visitor Select
    const modalEntryVis = document.getElementById('modalEntryVisitorSelect');
    if (modalEntryVis) {
      modalEntryVis.innerHTML = `<option value="">-- Choose Existing Visitor (Or type below) --</option>` +
        this.visitors.map(v => `
          <option value="${v.visitor_id}">${this.escapeHtml(v.name)} (${v.phone || 'No phone'})</option>
        `).join('');
    }
  }

  // ==========================================
  // CONFIRM DELETION LOGIC
  // ==========================================

  confirmDelete(type, id, label) {
    this.deleteContext = { type, id, label };
    const msg = document.getElementById('deleteConfirmMessage');
    if (msg) {
      msg.textContent = `Are you sure you want to delete ${type} "${label}"? This action cannot be undone.`;
    }
    this.showModal('modalConfirmDelete');
  }

  async executeDelete() {
    if (!this.deleteContext) return;
    const { type, id, label } = this.deleteContext;

    try {
      let endpoint = '';
      if (type === 'resident') endpoint = `/api/residents/${id}`;
      else if (type === 'visitor') endpoint = `/api/visitors/${id}`;
      else if (type === 'visit') endpoint = `/api/visits/${id}`;

      const res = await fetch(endpoint, { method: 'DELETE' });
      const result = await res.json();
      if (!result.success) throw new Error(result.message);

      this.showToast(`${type.charAt(0).toUpperCase() + type.slice(1)} deleted successfully.`, 'success');
      this.closeModal('modalConfirmDelete');
      this.deleteContext = null;

      // Reload respective view
      if (type === 'resident') this.loadResidents();
      else if (type === 'visitor') this.loadVisitors();
      else if (type === 'visit') this.loadVisits();

      this.loadDashboard(true);
    } catch (err) {
      this.showToast('Delete operation failed: ' + err.message, 'error');
    }
  }

  // ==========================================
  // MODAL UTILITIES
  // ==========================================

  showModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.classList.add('active');
      document.body.style.overflow = 'hidden';
    }
  }

  closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.classList.remove('active');
      document.body.style.overflow = '';
    }
  }

  setupModalDismissal() {
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        document.querySelectorAll('.modal.active').forEach(m => this.closeModal(m.id));
      }
    });
  }

  // ==========================================
  // TOAST NOTIFICATION SYSTEM
  // ==========================================

  showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    let icon = 'fa-circle-info';
    if (type === 'success') icon = 'fa-circle-check';
    if (type === 'error') icon = 'fa-triangle-exclamation';

    toast.innerHTML = `
      <i class="fa-solid ${icon}"></i>
      <span class="toast-message">${this.escapeHtml(message)}</span>
      <button class="toast-close" onclick="this.parentElement.remove()">&times;</button>
    `;

    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(100%)';
      setTimeout(() => toast.remove(), 250);
    }, 4000);
  }

  // ==========================================
  // FORMATTING & TIME UTILITIES
  // ==========================================

  formatDateTime(isoOrSqlString) {
    if (!isoOrSqlString) return '-';
    // Format "YYYY-MM-DD HH:MM:SS"
    const date = new Date(isoOrSqlString);
    if (isNaN(date.getTime())) return isoOrSqlString;

    return date.toLocaleDateString([], {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    }) + ' ' + date.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  toInputDateTime(dateObj) {
    const d = new Date(dateObj);
    if (isNaN(d.getTime())) return '';
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  calculateElapsedTime(entryString) {
    if (!entryString) return '';
    const entry = new Date(entryString).getTime();
    const now = Date.now();
    const diffMs = now - entry;
    if (diffMs < 0) return 'Just now';

    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 60) return `${diffMins} min${diffMins === 1 ? '' : 's'} ago`;

    const diffHours = Math.floor(diffMins / 60);
    const remainMins = diffMins % 60;
    return `${diffHours} hr ${remainMins} min ago`;
  }

  escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  escapeJs(str) {
    if (!str) return '';
    return String(str)
      .replace(/\\/g, '\\\\')
      .replace(/'/g, "\\'")
      .replace(/"/g, '\\"')
      .replace(/\n/g, '\\n');
  }
}

// Global App Instance
const app = new App();
