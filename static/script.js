const simulatedCrews = [
  { id: 'CREW-01', name: 'Team Alpha', status: 'available', lat: 12.9720, lon: 77.5950, skills: ['pothole', 'crack'], eta_per_km: 3 },
  { id: 'CREW-02', name: 'Team Beta', status: 'available', lat: 12.9680, lon: 77.5900, skills: ['pothole'], eta_per_km: 4 },
  { id: 'CREW-03', name: 'Team Gamma', status: 'busy', lat: 12.9750, lon: 77.6000, skills: ['crack', 'pothole'], eta_per_km: 3 },
  { id: 'CREW-04', name: 'Team Delta', status: 'available', lat: 12.9700, lon: 77.5930, skills: ['pothole'], eta_per_km: 5 },
  { id: 'CREW-05', name: 'Team Echo', status: 'offline', lat: 12.9760, lon: 77.5910, skills: ['crack'], eta_per_km: 4 },
];

const state = {
  currentPage: '#overview',
  isConnected: false,
  refreshInterval: 8,
  refreshCountdown: 8,
  lastSyncAt: new Date(),
  detections: [],
  filteredDetections: [],
  notifications: [],
  alerts: JSON.parse(localStorage.getItem('alerts') || '[]'),
  activityFeed: JSON.parse(localStorage.getItem('activityFeed') || '[]'),
  assignments: JSON.parse(localStorage.getItem('assignments') || '{}'),
  weights: JSON.parse(localStorage.getItem('weights') || '{"severity":5,"count":3,"recency":2,"density":4}'),
  alertThreshold: Number(localStorage.getItem('alertThreshold') || 15),
  soundAlerts: JSON.parse(localStorage.getItem('soundAlerts') || 'true'),
  assignmentRoutes: {},
  zoneScores: [],
  clusters: [],
  predictions: [],
  map: null,
  clusterLayer: null,
  heatLayer: null,
  riskLayer: null,
  crewLayer: null,
  routeLayer: null,
  routeMarkers: [],
  mapMode: 'markers',
  mapToggles: { markers: true, heat: false, clusters: false, risk: false, crew: true, routes: true },
  displayCount: 0,
  lastZoneScores: {},
};

const sampleDetections = [
  { id: 'D-001', type: 'pothole', confidence: 0.87, severity: 'High', latitude: 12.9716, longitude: 77.5946, timestamp: '2026-04-24T15:41:35', z_spike: 5.2 },
  { id: 'D-002', type: 'pothole', confidence: 0.79, severity: 'Medium', latitude: 12.9724, longitude: 77.5952, timestamp: '2026-04-24T15:05:10', z_spike: 3.5 },
  { id: 'D-003', type: 'pothole', confidence: 0.92, severity: 'High', latitude: 12.9709, longitude: 77.5938, timestamp: '2026-04-24T14:55:25', z_spike: 6.1 },
  { id: 'D-004', type: 'pothole', confidence: 0.68, severity: 'Low', latitude: 12.9751, longitude: 77.6000, timestamp: '2026-04-24T14:18:14', z_spike: 2.4 },
  { id: 'D-005', type: 'pothole', confidence: 0.83, severity: 'Medium', latitude: 12.9688, longitude: 77.5992, timestamp: '2026-04-24T13:10:44', z_spike: 3.8 },
  { id: 'D-006', type: 'pothole', confidence: 0.74, severity: 'High', latitude: 12.9735, longitude: 77.5879, timestamp: '2026-04-24T12:12:05', z_spike: 5.8 },
  { id: 'D-007', type: 'pothole', confidence: 0.65, severity: 'Low', latitude: 12.9762, longitude: 77.5904, timestamp: '2026-04-24T11:05:31', z_spike: 1.9 },
  { id: 'D-008', type: 'pothole', confidence: 0.88, severity: 'Medium', latitude: 12.9704, longitude: 77.5974, timestamp: '2026-04-24T10:38:12', z_spike: 4.2 },
];

const pages = {
  '#overview': renderOverview,
  '#map': renderMap,
  '#analytics': renderAnalytics,
  '#queue': renderQueue,
  '#crew': renderCrewManagement,
  '#assets': renderAssets,
  '#maintenance': renderMaintenance,
  '#reports': renderReports,
  '#settings': renderSettings,
};

function initApp() {
  state.detections = sampleDetections.map(normalizeDetection);
  state.filteredDetections = [...state.detections];
  state.notifications = [];
  state.activityFeed = state.activityFeed || [];
  updateSyncStatus();

  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
      document.querySelectorAll('.nav-item').forEach(btn => btn.classList.remove('active'));
      item.classList.add('active');
      state.currentPage = item.dataset.page;
      window.location.hash = state.currentPage;
      updatePageTitle();
      renderCurrentPage();
    });
  });

  document.getElementById('global-search').addEventListener('input', debounce(() => applySearch(), 300));
  document.getElementById('notifications-toggle').addEventListener('click', toggleNotifications);
  document.getElementById('mark-all-read').addEventListener('click', markAllNotificationsRead);
  document.getElementById('drawer-close').addEventListener('click', closeDrawer);

  window.addEventListener('hashchange', () => {
    const target = window.location.hash || '#overview';
    const button = document.querySelector(`.nav-item[data-page="${target}"]`);
    if (button) {
      document.querySelectorAll('.nav-item').forEach(btn => btn.classList.remove('active'));
      button.classList.add('active');
      state.currentPage = target;
      updatePageTitle();
      renderCurrentPage();
    }
  });

  renderQuickActions();
  renderNotifications();
  updateSidebarBadge();
  updatePageTitle();
  renderCurrentPage();
  connectFirebase();
  startRefreshTimer();
}

function normalizeDetection(item) {
  const normalized = {
    id: item.id || `D-${Math.random().toString(36).slice(2, 8)}`,
    type: item.type || 'pothole',
    confidence: Number(item.confidence || 0.8),
    severity: item.severity || 'Medium',
    latitude: Number(item.latitude) || 12.9716,
    longitude: Number(item.longitude) || 77.5946,
    timestamp: item.timestamp || new Date().toISOString(),
    z_spike: item.z_spike || 0,
    status: item.status || 'unassigned',
    zone: `${Number(item.latitude).toFixed(3)},${Number(item.longitude).toFixed(3)}`,
  };
  normalized.priority = calculatePriority(normalized);
  return normalized;
}

function listenFirebaseDetections(callback, errorCallback) {
  try {
    const ref = firebaseDatabase.ref('detections');
    ref.on('value', snapshot => callback(snapshot.val()));
  } catch (error) {
    if (typeof errorCallback === 'function') errorCallback(error);
  }
}

function connectFirebase() {
  listenFirebaseDetections((data) => {
    if (!data) return;
    const entries = Object.entries(data).map(([id, item]) => normalizeDetection({ id, ...item }));
    state.detections = [...entries, ...sampleDetections].slice(0, 120);
    state.filteredDetections = [...state.detections];
    state.isConnected = true;
    state.firebaseError = false;
    state.lastSyncAt = new Date();
    updateSyncStatus();
    refreshAllData(true);
    showToast('Live sync restored', 'Firebase detections loaded successfully.');
  }, (err) => {
    state.firebaseError = true;
    updateSyncStatus();
    showToast('Firebase sync failed', 'Using local sample detections until connection returns.');
    console.warn('Firebase error', err);
  });
}

function updateSyncStatus() {
  const indicator = document.getElementById('sync-indicator');
  if (!indicator) return;
  if (state.firebaseError) {
    indicator.textContent = '🔴 Sync Lost — reconnecting...';
    indicator.classList.remove('pill--success');
    indicator.classList.add('pill--live');
    return;
  }
  const age = Math.max(0, Math.floor((new Date() - state.lastSyncAt) / 1000));
  indicator.textContent = `🟢 Live Sync Active — last sync ${age}s ago`;
  indicator.classList.remove('pill--live');
  indicator.classList.add('pill--success');
}

function startRefreshTimer() {
  setInterval(() => {
    state.refreshCountdown -= 1;
    if (state.refreshCountdown <= 0) {
      state.refreshCountdown = state.refreshInterval;
      if (!state.firebaseError) {
        refreshAllData(false);
        showToast('Data refreshed', 'Live dashboard calculations updated.');
      }
    }
    const countdown = document.getElementById('refresh-countdown');
    if (countdown) countdown.textContent = state.refreshCountdown;
    updateSyncStatus();
  }, 1000);
}

function refreshAllData(force) {
  updateZoneScores();
  buildClusters();
  calculatePredictions();
  renderCurrentPage();
  renderNotifications();
  updateMapIfVisible();
  evaluateAlerts();
  if (force) renderCrewManagement();
}

function renderQuickActions() {
  const container = document.getElementById('quick-actions-bar');
  if (!container) return;
  container.innerHTML = `
    <div class="quick-actions-new">
      <span class="quick-label">Quick Actions:</span>
      <button class="quick-btn primary" onclick="autoDispatchCritical()">🚀 Auto Dispatch Critical</button>
      <button class="quick-btn secondary" onclick="viewTopRiskZones()">📍 Top Risk Zones</button>
      <button class="quick-btn secondary" onclick="recalculateAllPriorities()" id="recalc-btn">🔄 Recalculate</button>
      <button class="quick-btn secondary" onclick="clearResolvedZones()">🧹 Clear Resolved</button>
      <button class="quick-btn amber" onclick="generateReportCSV()">📊 Generate Report</button>
      <div class="refresh-indicator">
        <div class="refresh-text">Auto-refresh in <span id="refresh-countdown">${state.refreshCountdown}</span>s</div>
        <svg class="refresh-circle" width="24" height="24" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="10" stroke="#E2E8F0" stroke-width="2" fill="none"/>
          <circle cx="12" cy="12" r="10" stroke="#4F46E5" stroke-width="2" fill="none" stroke-dasharray="62.8" stroke-dashoffset="62.8" class="refresh-progress"/>
        </svg>
      </div>
    </div>
  `;

  // Add recalc animation
  const recalcBtn = document.getElementById('recalc-btn');
  if (recalcBtn) {
    const originalOnClick = recalcBtn.onclick;
    recalcBtn.onclick = () => {
      recalcBtn.innerHTML = '⏳ Recalculating...';
      recalcBtn.classList.add('spinning');
      setTimeout(() => {
        originalOnClick();
        recalcBtn.innerHTML = '🔄 Recalculate';
        recalcBtn.classList.remove('spinning');
      }, 1000);
    };
  }
}

function renderCurrentPage() {
  const pageContent = document.getElementById('page-content');
  pageContent.innerHTML = '';
  pageContent.classList.add('fade-in');
  const renderFn = pages[state.currentPage] || renderOverview;
  renderFn(pageContent);
  updateSidebarBadge();
}

function updatePageTitle() {
  const pageNames = {
    '#overview': 'Overview',
    '#map': 'Live Map',
    '#analytics': 'Analytics',
    '#queue': 'Priority Queue',
    '#crew': 'Crew Management',
    '#assets': 'Asset Registry',
    '#maintenance': 'Maintenance Track',
    '#reports': 'Reports',
    '#settings': 'Settings',
  };
  const title = pageNames[state.currentPage] || 'RoadSense';
  document.getElementById('page-title').textContent = title;
  document.querySelector('.page-breadcrumb').textContent = `RoadSense / ${title}`;
}

function applySearch() {
  const query = document.getElementById('global-search').value.trim().toLowerCase();
  state.filteredDetections = state.detections.filter(item => {
    const text = `${item.id} ${item.type} ${item.severity} ${item.zone}`.toLowerCase();
    return text.includes(query);
  });
  renderCurrentPage();
}

function renderOverview(container) {
  // Check for demo mode
  const demoMode = localStorage.getItem('demoMode') !== 'false' && state.detections.length === 0;
  let demoData = [];
  if (demoMode) {
    demoData = [
      {type:"pothole",severity:"High",confidence:0.87,latitude:12.9716,longitude:77.5946,timestamp: new Date(Date.now()-300000).toISOString()},
      {type:"crack",severity:"Medium",confidence:0.72,latitude:12.9720,longitude:77.5950,timestamp: new Date(Date.now()-600000).toISOString()},
      {type:"pothole",severity:"High",confidence:0.91,latitude:12.9712,longitude:77.5940,timestamp: new Date(Date.now()-900000).toISOString()},
      {type:"pothole",severity:"Low",confidence:0.51,latitude:12.9725,longitude:77.5960,timestamp: new Date(Date.now()-1200000).toISOString()},
      {type:"crack",severity:"Medium",confidence:0.68,latitude:12.9708,longitude:77.5935,timestamp: new Date(Date.now()-1500000).toISOString()},
    ].map(normalizeDetection);
  }

  // Use demo data if no real data
  const allDetections = demoMode ? demoData : state.filteredDetections;
  const activeDetections = allDetections.filter(d => d.status !== 'resolved');
  const totalDetections = allDetections.length;
  const highCount = allDetections.filter(d => d.severity === 'High').length;
  const mediumCount = allDetections.filter(d => d.severity === 'Medium').length;
  const lowCount = allDetections.filter(d => d.severity === 'Low').length;
  const resolvedToday = Object.values(state.assignments).filter(a => a.status === 'resolved').length;
  const activeCrews = simulatedCrews.filter(c => c.status === 'available' || c.status === 'busy').length;
  const alertCount = state.alerts.length;

  // Calculate network health score
  const unresolvedRatio = activeDetections.length / Math.max(1, totalDetections);
  const networkHealth = Math.max(0, Math.min(100, 100 - (highCount * 5) - (unresolvedRatio * 20)));

  // Top zone calculation
  updateZoneScores();
  const topZone = state.zoneScores[0] || { zone: '12.972,77.595', score: 28, count: 5 };

  // Detection rate (simulated)
  const detectionRate = totalDetections > 0 ? (totalDetections / 24).toFixed(1) : '4.2';
  const avgConfidence = totalDetections > 0 ? (allDetections.reduce((sum, d) => sum + d.confidence, 0) / totalDetections * 100).toFixed(1) : '87.3';
  const resolutionRate = totalDetections > 0 ? ((resolvedToday / totalDetections) * 100).toFixed(0) : '62';

  container.innerHTML = `
    ${demoMode ? `
      <div class="demo-banner">
        <div class="demo-content">
          <span>🎮 Demo Mode — Showing sample data. Connect Firebase to see live detections.</span>
          <div class="demo-actions">
            <button class="btn btn-secondary" onclick="localStorage.setItem('demoMode', 'false'); renderCurrentPage();">Dismiss</button>
            <button class="btn btn-primary" onclick="setPage('#settings')">Add Real Data</button>
          </div>
        </div>
      </div>
    ` : ''}

    <!-- SECTION 1: COMMAND HEADER -->
    <div class="command-header">
      <div class="command-left">
        <div class="command-title">Road Intelligence Command Center</div>
        <div class="command-subtitle">AI-powered real-time monitoring — Bengaluru Network</div>
        <div class="status-pills">
          <span class="status-pill status-active">● AI Model Active</span>
          <span class="status-pill status-active">● Firebase Connected</span>
          <span class="status-pill status-active">● 30 FPS Camera</span>
        </div>
      </div>
      <div class="command-center">
        <div class="network-gauge">
          <svg width="160" height="160" viewBox="0 0 160 160">
            <circle cx="80" cy="80" r="70" fill="none" stroke="#1E3A5F" stroke-width="12"/>
            <circle cx="80" cy="80" r="70" fill="none" stroke="url(#healthGradient)" stroke-width="12" stroke-dasharray="439.6" stroke-dashoffset="${439.6 - (networkHealth / 100 * 439.6)}" class="health-ring"/>
            <defs>
              <linearGradient id="healthGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stop-color="#10B981"/>
                <stop offset="100%" stop-color="#3B82F6"/>
              </linearGradient>
            </defs>
          </svg>
          <div class="gauge-center">
            <div class="gauge-value">${Math.round(networkHealth)}</div>
            <div class="gauge-label">Network Health</div>
          </div>
        </div>
      </div>
      <div class="command-right">
        <div class="glance-title">Today at a Glance</div>
        <div class="glance-stats">
          <div class="glance-row"><span class="glance-icon">🔍</span><span class="glance-label">Scanned today</span><span class="glance-value">${totalDetections}</span></div>
          <div class="glance-row"><span class="glance-icon">🚨</span><span class="glance-label">Alerts fired</span><span class="glance-value">${alertCount}</span></div>
          <div class="glance-row"><span class="glance-icon">✅</span><span class="glance-label">Issues resolved</span><span class="glance-value">${resolvedToday}</span></div>
          <div class="glance-row"><span class="glance-icon">🚗</span><span class="glance-label">Crews active</span><span class="glance-value">${activeCrews}</span></div>
        </div>
      </div>
    </div>

    <!-- SECTION 2: LIVE METRIC STRIP -->
    <div class="metric-strip">
      <div class="metric-tile"><div class="metric-label">DETECTIONS/MIN</div><div class="metric-value count-up">${detectionRate}</div><div class="metric-trend">↑ 12%</div></div>
      <div class="metric-tile"><div class="metric-label">AVG CONFIDENCE</div><div class="metric-value count-up">${avgConfidence}%</div><div class="metric-trend">↑ 3.1%</div></div>
      <div class="metric-tile"><div class="metric-label">AVG RESPONSE</div><div class="metric-value count-up">4.2h</div><div class="metric-trend">↓ 0.8h</div></div>
      <div class="metric-tile"><div class="metric-label">RESOLVED TODAY</div><div class="metric-value count-up">${resolutionRate}%</div><div class="metric-trend">↑ 8%</div></div>
      <div class="metric-tile"><div class="metric-label">CRITICAL ZONES</div><div class="metric-value count-up">${highCount}</div><div class="metric-trend">${highCount > 0 ? '⚠ Needs attention' : '✓ All clear'}</div></div>
      <div class="metric-tile"><div class="metric-label">COVERAGE AREA</div><div class="metric-value count-up">12.4km²</div><div class="metric-trend">Bengaluru North</div></div>
    </div>

    <!-- SECTION 3: KPI CARDS ROW -->
    <div class="kpi-row">
      <div class="kpi-card-v2" onclick="scrollToSection('#overview-zone-list')">
        <div class="kpi-top-strip" style="background: linear-gradient(135deg, #4F46E5, #7C3AED);"></div>
        <div class="kpi-header">
          <div class="kpi-icon"><div class="kpi-icon-bg indigo">🛣️</div></div>
          <div class="kpi-status">Live</div>
        </div>
        <div class="kpi-main">
          <div class="kpi-number count-up">${activeDetections.length}</div>
          <div class="kpi-label">Active Detection Zones</div>
        </div>
        <div class="kpi-footer">Real-time priority engine active</div>
      </div>
      <div class="kpi-card-v2 ${highCount > 0 ? 'kpi-pulse' : ''}" onclick="scrollToSection('#overview-zone-list')">
        <div class="kpi-top-strip" style="background: linear-gradient(135deg, #EF4444, #DC2626);"></div>
        <div class="kpi-header">
          <div class="kpi-icon"><div class="kpi-icon-bg red">🚨</div></div>
          <div class="kpi-status">Critical</div>
        </div>
        <div class="kpi-main">
          <div class="kpi-number count-up">${highCount}</div>
          <div class="kpi-label">High Severity Incidents</div>
        </div>
        <div class="kpi-footer">Immediate attention required</div>
      </div>
      <div class="kpi-card-v2" onclick="scrollToSection('#overview-zone-list')">
        <div class="kpi-top-strip" style="background: linear-gradient(135deg, #F59E0B, #EA580C);"></div>
        <div class="kpi-header">
          <div class="kpi-icon"><div class="kpi-icon-bg amber">⚡</div></div>
          <div class="kpi-status">Assigned</div>
        </div>
        <div class="kpi-main">
          <div class="kpi-number count-up">${Object.values(state.assignments).filter(a => a.status === 'assigned').length}</div>
          <div class="kpi-label">Crews En Route</div>
        </div>
        <div class="kpi-footer">Auto-dispatch system active</div>
      </div>
      <div class="kpi-card-v2" onclick="scrollToSection('#overview-zone-list')">
        <div class="kpi-top-strip" style="background: linear-gradient(135deg, #10B981, #059669);"></div>
        <div class="kpi-header">
          <div class="kpi-icon"><div class="kpi-icon-bg green">✅</div></div>
          <div class="kpi-status">Today</div>
        </div>
        <div class="kpi-main">
          <div class="kpi-number count-up">${resolvedToday}</div>
          <div class="kpi-label">Resolved Today</div>
        </div>
        <div class="kpi-footer">Target: 80% resolution rate</div>
      </div>
    </div>

    <!-- SECTION 4: THREE COLUMN CONTENT -->
    <div class="three-column-grid">
      <div class="content-card">
        <div class="card-header">
          <div class="card-title">Detection Activity — Last 24 Hours</div>
          <div class="time-toggles">
            <button class="time-toggle active">Day</button>
            <button class="time-toggle">Week</button>
            <button class="time-toggle">Month</button>
          </div>
        </div>
        <div class="chart-container">
          <canvas id="detection-chart" width="400" height="220"></canvas>
        </div>
        <div class="severity-chips">
          <span class="severity-chip high">🔴 High: ${highCount}</span>
          <span class="severity-chip medium">🟠 Med: ${mediumCount}</span>
          <span class="severity-chip low">🟢 Low: ${lowCount}</span>
        </div>
      </div>

      <div class="content-card">
        <div class="card-title">Severity Distribution</div>
        <div class="donut-container">
          <canvas id="severity-chart" width="200" height="200"></canvas>
          <div class="donut-center">
            <div class="donut-value">${totalDetections}</div>
            <div class="donut-label">Total</div>
          </div>
        </div>
        <div class="legend-list">
          <div class="legend-item"><span class="legend-dot high"></span>High Severity<span class="legend-count">${highCount}</span><span class="legend-pct">(${totalDetections > 0 ? Math.round(highCount/totalDetections*100) : 0}%)</span></div>
          <div class="legend-item"><span class="legend-dot medium"></span>Medium Severity<span class="legend-count">${mediumCount}</span><span class="legend-pct">(${totalDetections > 0 ? Math.round(mediumCount/totalDetections*100) : 0}%)</span></div>
          <div class="legend-item"><span class="legend-dot low"></span>Low Severity<span class="legend-count">${lowCount}</span><span class="legend-pct">(${totalDetections > 0 ? Math.round(lowCount/totalDetections*100) : 0}%)</span></div>
        </div>
      </div>

      <div class="content-card">
        <div class="card-header">
          <div class="card-title">AI Insights</div>
          <div class="card-subtitle">Updated 30s ago</div>
        </div>
        <div class="insights-list">
          <div class="insight-card indigo">
            <div class="insight-icon">📊</div>
            <div class="insight-content">
              <div class="insight-title">Peak Detection Window</div>
              <div class="insight-value">14:00 – 15:00</div>
              <div class="insight-sub">23 incidents in this period</div>
            </div>
          </div>
          <div class="insight-card red">
            <div class="insight-icon">⚠️</div>
            <div class="insight-content">
              <div class="insight-title">Highest Risk Zone</div>
              <div class="insight-value">${topZone.zone}</div>
              <div class="insight-sub">Score: ${topZone.score} pts</div>
              <div class="insight-link" onclick="setPage('#map')">View on Map</div>
            </div>
          </div>
          <div class="insight-card green">
            <div class="insight-icon">✅</div>
            <div class="insight-content">
              <div class="insight-title">Resolution Efficiency</div>
              <div class="insight-value">${resolutionRate}% resolved today</div>
              <div class="insight-sub">Target: 80% daily resolution</div>
              <div class="progress-bar"><div class="progress-fill" style="width: ${resolutionRate}%"></div></div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- SECTION 5: PRIORITY INTELLIGENCE -->
    <div class="priority-section">
      <div class="priority-header">
        <div class="priority-title">⚡ Top Priority Zones</div>
        <div class="priority-subtitle">Auto-scoring every 10s <span class="countdown">Next: 7s</span></div>
      </div>
      <div class="zone-scroll-row" id="overview-zone-list">
        ${state.zoneScores.slice(0, 6).map((zone, index) => `
          <div class="zone-card ${index === 0 && zone.score > 25 ? 'critical' : ''}">
            <div class="rank-badge ${index === 0 ? 'critical' : index === 1 ? 'high' : index === 2 ? 'medium' : 'normal'}">${index + 1}</div>
            <div class="zone-top">
              <div class="zone-coords">ZONE ${zone.zone}</div>
              <div class="zone-score">Score: ${zone.score}</div>
            </div>
            <div class="zone-severity">
              <span class="severity-pill high">🔴 ${zone.high || 0} High</span>
              <span class="severity-pill medium">🟠 ${zone.medium || 0} Med</span>
              <span class="severity-pill low">🟢 ${zone.low || 0} Low</span>
            </div>
            <div class="score-bar"><div class="score-bar-fill" style="width: ${Math.min(100, zone.score * 2.5)}%"></div></div>
            <div class="zone-status">
              <div class="status-badge ${state.assignments[zone.zone]?.status === 'assigned' ? 'assigned' : state.assignments[zone.zone]?.status === 'resolved' ? 'resolved' : 'unassigned'}">
                ${state.assignments[zone.zone]?.status === 'assigned' ? '🔧 Assigned' : state.assignments[zone.zone]?.status === 'resolved' ? '✅ Resolved' : 'Unassigned'}
              </div>
              <div class="detection-count">${zone.count} detection(s)</div>
            </div>
            <div class="zone-time">Last detected: ${formatShortTime(zone.lastSeen || new Date())}</div>
            <div class="zone-actions">
              <button class="zone-btn primary" onclick="autoAssignCrew('${zone.zone}')">🔧 Assign Crew</button>
              <button class="zone-btn secondary" onclick="setPage('#map')">📍 Map</button>
            </div>
          </div>
        `).join('')}
      </div>
      <div class="load-more">
        <button class="btn btn-outline" onclick="expandZoneList()">Show all ${state.zoneScores.length} zones ↓</button>
      </div>
    </div>

    <!-- SECTION 6: BOTTOM DATA ROW -->
    <div class="bottom-row">
      <div class="recent-events-card">
        <div class="card-header">
          <div class="card-title">Recent Detection Events</div>
          <div class="card-actions">
            <select class="filter-select"><option>Filter ▼</option></select>
            <button class="btn-link">View All →</button>
          </div>
        </div>
        <div class="events-table">
          <div class="table-header">
            <div>Type</div><div>Severity</div><div>Confidence</div><div>Location</div><div>Time</div><div>Action</div>
          </div>
          ${allDetections.slice(0, 8).map(d => `
            <div class="table-row">
              <div class="table-cell"><span class="severity-dot ${d.severity.toLowerCase()}"></span> ${d.type}</div>
              <div class="table-cell"><span class="severity-badge ${d.severity.toLowerCase()}">${d.severity.toUpperCase()}</span></div>
              <div class="table-cell"><div class="confidence-bar"><div class="confidence-fill ${d.confidence < 0.6 ? 'low' : d.confidence < 0.8 ? 'medium' : 'high'}" style="width: ${d.confidence * 100}%"></div></div><span class="confidence-value">${Math.round(d.confidence * 100)}%</span></div>
              <div class="table-cell"><div class="location">${d.latitude.toFixed(3)}°N</div><div class="location">${d.longitude.toFixed(3)}°E</div></div>
              <div class="table-cell">${formatTimeAgo(new Date(d.timestamp))}</div>
              <div class="table-cell"><button class="action-btn" onclick="setPage('#map')">📍</button><button class="action-btn" onclick="markZoneResolved('${d.zone}')">✓</button></div>
            </div>
          `).join('')}
          ${allDetections.length > 8 ? `<div class="table-footer">Show ${allDetections.length - 8} more →</div>` : ''}
        </div>
      </div>

      <div class="activity-feed-card">
        <div class="card-header">
          <div class="card-title">⚡ Live Activity Feed</div>
          <div class="live-indicator"><span class="pulse-dot"></span></div>
        </div>
        <div class="feed-items" id="overview-activity-feed">
          ${demoMode ? `
            <div class="feed-item slideDown"><div class="feed-icon high">🔴</div><div class="feed-content"><div class="feed-main">Pothole HIGH detected</div><div class="feed-sub">12.971°N, 77.594°E · 2 min ago</div></div></div>
            <div class="feed-item slideDown"><div class="feed-icon medium">🟠</div><div class="feed-content"><div class="feed-main">Crack MEDIUM detected</div><div class="feed-sub">12.972°N, 77.595°E · 5 min ago</div></div></div>
            <div class="feed-item slideDown"><div class="feed-icon resolved">🟢</div><div class="feed-content"><div class="feed-main">Zone resolved</div><div class="feed-sub">12.971°N, 77.594°E · 8 min ago</div></div></div>
            <div class="feed-item slideDown"><div class="feed-icon assigned">🔧</div><div class="feed-content"><div class="feed-main">Team Alpha assigned</div><div class="feed-sub">Zone 12.972,77.595 · 12 min ago</div></div></div>
          ` : state.activityFeed.slice(0, 12).map(item => `
            <div class="feed-item slideDown">
              <div class="feed-icon ${item.type}">${item.icon}</div>
              <div class="feed-content">
                <div class="feed-main">${item.title}</div>
                <div class="feed-sub">${item.subtitle}</div>
              </div>
            </div>
          `).join('')}
          ${(!demoMode && state.activityFeed.length === 0) ? '<div class="empty-feed">📡 Waiting for detection events...<br><small>Feed updates in real time</small></div>' : ''}
        </div>
      </div>
    </div>
  `;

  // Initialize animations and charts
  setTimeout(() => {
    animateCounts();
    initCharts(allDetections);
    startCountdown();
  }, 100);
}

function animateCounts() {
  document.querySelectorAll('.count-up').forEach(el => {
    const target = parseFloat(el.textContent.replace(/[^\d.]/g, '')) || 0;
    animateCount(el, target);
  });
}

function animateCount(el, target, duration = 1200) {
  let start = 0;
  const step = target / (duration / 16);
  const timer = setInterval(() => {
    start += step;
    const display = target % 1 === 0 ? Math.floor(Math.min(start, target)) : Math.min(start, target).toFixed(1);
    el.textContent = el.textContent.replace(/[\d.]+/, display);
    if (start >= target) clearInterval(timer);
  }, 16);
}

function initCharts(detections) {
  // Detection Activity Chart
  const ctx1 = document.getElementById('detection-chart');
  if (ctx1) {
    const hours = Array.from({length: 12}, (_, i) => `${14 + i % 24}h`);
    const totalData = hours.map(() => Math.floor(Math.random() * 10) + 1);
    const highData = totalData.map(v => Math.floor(v * 0.3));

    new Chart(ctx1, {
      type: 'line',
      data: {
        labels: hours,
        datasets: [{
          label: 'Total Detections',
          data: totalData,
          borderColor: '#4F46E5',
          backgroundColor: 'rgba(79,70,229,0.15)',
          fill: true,
          tension: 0.4,
          pointRadius: 4,
          pointHoverRadius: 6
        }, {
          label: 'High Severity',
          data: highData,
          borderColor: '#EF4444',
          backgroundColor: 'transparent',
          borderDash: [4, 4],
          fill: false,
          tension: 0.4,
          pointRadius: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#0F172A',
            titleColor: '#FFFFFF',
            bodyColor: '#FFFFFF',
            cornerRadius: 8,
            displayColors: false
          }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: '#64748B', font: { size: 11 } }
          },
          y: {
            beginAtZero: true,
            grid: { display: false },
            ticks: {
              color: '#64748B',
              font: { size: 11 },
              callback: value => Math.floor(value)
            }
          }
        },
        elements: {
          point: { hoverBorderWidth: 2 }
        }
      }
    });
  }

  // Severity Distribution Chart
  const ctx2 = document.getElementById('severity-chart');
  if (ctx2) {
    const severityData = {
      high: detections.filter(d => d.severity === 'High').length,
      medium: detections.filter(d => d.severity === 'Medium').length,
      low: detections.filter(d => d.severity === 'Low').length
    };

    new Chart(ctx2, {
      type: 'doughnut',
      data: {
        datasets: [{
          data: [severityData.high, severityData.medium, severityData.low],
          backgroundColor: ['#EF4444', '#F59E0B', '#10B981'],
          borderWidth: 0,
          cutout: '70%'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        animation: { animateRotate: true, animateScale: false }
      }
    });
  }
}

function startCountdown() {
  let countdown = 7;
  const countdownEl = document.querySelector('.countdown');
  if (!countdownEl) return;

  const timer = setInterval(() => {
    countdownEl.textContent = `Next: ${countdown}s`;
    countdown--;
    if (countdown < 0) {
      countdown = 7;
      // Simulate zone score update
      updateZoneScores();
      renderCurrentPage();
    }
  }, 1000);
}

function scrollToSection(selector) {
  const el = document.querySelector(selector);
  if (el) el.scrollIntoView({ behavior: 'smooth' });
}

function expandZoneList() {
  const list = document.getElementById('overview-zone-list');
  if (!list) return;

  const allZones = state.zoneScores.map((zone, index) => `
    <div class="zone-card ${index === 0 && zone.score > 25 ? 'critical' : ''}">
      <div class="rank-badge ${index === 0 ? 'critical' : index === 1 ? 'high' : index === 2 ? 'medium' : 'normal'}">${index + 1}</div>
      <div class="zone-top">
        <div class="zone-coords">ZONE ${zone.zone}</div>
        <div class="zone-score">Score: ${zone.score}</div>
      </div>
      <div class="zone-severity">
        <span class="severity-pill high">🔴 ${zone.high || 0} High</span>
        <span class="severity-pill medium">🟠 ${zone.medium || 0} Med</span>
        <span class="severity-pill low">🟢 ${zone.low || 0} Low</span>
      </div>
      <div class="score-bar"><div class="score-bar-fill" style="width: ${Math.min(100, zone.score * 2.5)}%"></div></div>
      <div class="zone-status">
        <div class="status-badge ${state.assignments[zone.zone]?.status === 'assigned' ? 'assigned' : state.assignments[zone.zone]?.status === 'resolved' ? 'resolved' : 'unassigned'}">
          ${state.assignments[zone.zone]?.status === 'assigned' ? '🔧 Assigned' : state.assignments[zone.zone]?.status === 'resolved' ? '✅ Resolved' : 'Unassigned'}
        </div>
        <div class="detection-count">${zone.count} detection(s)</div>
      </div>
      <div class="zone-time">Last detected: ${formatShortTime(zone.lastSeen || new Date())}</div>
      <div class="zone-actions">
        <button class="zone-btn primary" onclick="autoAssignCrew('${zone.zone}')">🔧 Assign Crew</button>
        <button class="zone-btn secondary" onclick="setPage('#map')">📍 Map</button>
      </div>
    </div>
  `).join('');

  list.innerHTML = allZones;
  list.classList.add('expanded');
}

function formatTimeAgo(date) {
  const now = new Date();
  const diff = Math.floor((now - date) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

function renderOverviewZoneList() {
  const list = document.getElementById('overview-zone-list');
  if (!list) return;
  list.innerHTML = '';
  updateZoneScores();
  state.zoneScores.slice(0, 6).forEach(zone => {
    const card = document.createElement('div');
    card.className = 'incident-card';
    const critical = zone.score > 25;
    card.innerHTML = `
      <div class="incident-top"><div class="incident-title">${critical ? '⚠ Critical Zone' : 'Zone'} ${zone.zone}</div><div class="badge-pill ${critical ? 'badge-high' : 'badge-medium'}">Score ${zone.score}</div></div>
      <div class="incident-detail">${zone.count} detection(s) · ${zone.high} high · ${zone.medium} medium · ${zone.low} low</div>
      <div class="incident-detail">Last updated ${formatShortTime(zone.lastSeen)}</div>
      <div class="priority-bar"><div class="priority-fill ${zone.fillClass}" style="width:${Math.min(100, zone.score * 2.5)}%"></div></div>
      <div class="incident-actions"><button class="btn btn-secondary" onclick="setPage('#map')">View Map</button><button class="btn btn-primary" onclick="autoAssignCrew('${zone.zone}')">Auto Assign Crew</button></div>
    `;
    if (critical) card.classList.add('flash-border');
    list.appendChild(card);
  });
}

function renderMap(container) {
  container.innerHTML = `
    <div class="map-toolbar">
      <div class="map-layer-controls">
        <button class="btn toggle-pill active" onclick="toggleMapLayer('markers')">📍 Markers</button>
        <button class="btn toggle-pill" onclick="toggleMapLayer('heatmap')">🌡️ Heatmap</button>
        <button class="btn toggle-pill" onclick="toggleMapLayer('clusters')">🔵 Clusters</button>
        <button class="btn toggle-pill" onclick="toggleMapLayer('risk')">🔮 Risk Zones</button>
        <button class="btn toggle-pill" onclick="toggleMapLayer('crew')">🚗 Crew</button>
        <button class="btn toggle-pill" onclick="toggleMapLayer('routes')">🗺️ Routes</button>
      </div>
      <div class="map-actions">
        <button class="btn btn-secondary" onclick="fitMap()">Fit All</button>
        <button class="btn btn-secondary" onclick="refreshMap()">Refresh</button>
      </div>
    </div>
    <div class="map-shell"><div id="live-map" style="width:100%;height:100%;"></div><div class="map-live-badge">LIVE</div></div>
    <div class="route-summary-panel hidden" id="route-summary-panel"></div>
  `;
  initMap();
}

function initMap() {
  if (state.map) {
    state.map.remove();
    state.map = null;
  }
  state.map = L.map('live-map').setView([12.9716, 77.5946], 13);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap contributors' }).addTo(state.map);
  state.clusterLayer = L.markerClusterGroup();
  state.heatLayer = L.heatLayer([], { radius: 30, blur: 25, maxZoom: 15 });
  state.riskLayer = L.layerGroup();
  state.crewLayer = L.layerGroup();
  state.routeLayer = L.layerGroup();
  state.map.addLayer(state.clusterLayer);
  state.map.addLayer(state.crewLayer);
  state.map.addLayer(state.routeLayer);
  state.map.addLayer(state.riskLayer);
  updateMap();
}

function updateMap() {
  state.clusterLayer.clearLayers();
  state.heatLayer.setLatLngs([]);
  state.riskLayer.clearLayers();
  state.crewLayer.clearLayers();
  state.routeLayer.clearLayers();
  state.routeMarkers.forEach(marker => marker.remove());
  state.routeMarkers = [];
  const detections = state.filteredDetections;
  detections.forEach(item => {
    const color = item.severity === 'High' ? '#EF4444' : item.severity === 'Medium' ? '#F59E0B' : '#10B981';
    const radius = item.severity === 'High' ? 14 : item.severity === 'Medium' ? 10 : 8;
    const marker = L.circleMarker([item.latitude, item.longitude], { radius, color, fillColor: color, fillOpacity: 0.9, weight: 2, opacity: item.status === 'resolved' ? 0.4 : 1 });
    if (item.severity === 'High') marker.options.className = 'marker-pulse';
    marker.bindPopup(createPopupContent(item));
    if (state.mapToggles.markers) marker.addTo(state.map);
    state.clusterLayer.addLayer(marker);
    state.heatLayer.addLatLng([item.latitude, item.longitude, item.severity === 'High' ? 0.9 : 0.5]);
  });
  if (state.mapToggles.clusters) state.map.addLayer(state.clusterLayer); else state.map.removeLayer(state.clusterLayer);
  if (state.mapToggles.heat) {
    if (!state.map.hasLayer(state.heatLayer)) state.map.addLayer(state.heatLayer);
  } else {
    if (state.map.hasLayer(state.heatLayer)) state.map.removeLayer(state.heatLayer);
  }
  state.detections.forEach(d => {
    const assigned = state.assignments[d.zone] && state.assignments[d.zone].status === 'assigned';
    if (state.mapToggles.risk && state.predictions.some(p => p.zone === d.zone)) {
      const prediction = state.predictions.find(p => p.zone === d.zone);
      const circle = L.circle([d.latitude, d.longitude], { radius: prediction.risk_score * 70, color: '#7C3AED', fillColor: 'rgba(124,58,237,0.18)', dashArray: '6 8', weight: 2 });
      state.riskLayer.addLayer(circle);
    }
    const crewRoute = state.assignments[d.zone] && state.assignments[d.zone].route;
    if (crewRoute && state.mapToggles.routes) {
      const line = L.polyline(crewRoute.path, { color: '#2563EB', dashArray: '8 6', weight: 3 });
      state.routeLayer.addLayer(line);
    }
  });
  renderCrewMarkers();
  if (!state.mapToggles.routes) state.map.removeLayer(state.routeLayer);
  if (!state.mapToggles.crew) state.map.removeLayer(state.crewLayer);
  rigidMapSize();
}

function rigidMapSize() {
  setTimeout(() => { try { state.map.invalidateSize(true); } catch (err) {} }, 200);
}

function createPopupContent(item) {
  const assigned = state.assignments[item.zone];
  const statusText = assigned ? `${assigned.status === 'assigned' ? 'Assigned' : assigned.status}` : 'Unassigned';
  return `
    <div style="font-size:13px;line-height:1.5;color:#0F172A;max-width:240px;">
      <strong>🕳️ POTHOLE DETECTED</strong><br>
      ───────────────────────<br>
      Confidence: ${Math.round(item.confidence * 100)}%<br>
      Severity: <span style="color:${item.severity === 'High' ? '#DC2626' : item.severity === 'Medium' ? '#EA580C' : '#16A34A'}">● ${item.severity}</span><br>
      Detected: ${new Date(item.timestamp).toLocaleString()}<br>
      GPS: ${item.latitude.toFixed(4)}, ${item.longitude.toFixed(4)}<br>
      Zone Score: ${item.priority} pts<br>
      Status: ${statusText}<br>
      <div style="margin-top:10px;display:flex;flex-wrap:wrap;gap:8px;">
        <button class="btn btn-secondary" onclick="autoAssignCrew('${item.zone}')">🔧 Assign Crew</button>
        <button class="btn btn-success" onclick="markZoneResolved('${item.zone}')">✅ Mark Fixed</button>
        <button class="btn btn-secondary" onclick="window.open('https://maps.google.com/?q=${item.latitude},${item.longitude}','_blank')">📍 Navigate</button>
      </div>
    </div>`;
}

function renderCrewMarkers() {
  if (!state.mapToggles.crew) return;
  simulatedCrews.forEach(crew => {
    const color = crew.status === 'available' ? '#F97316' : crew.status === 'busy' ? '#3B82F6' : '#64748B';
    const marker = L.circleMarker([crew.lat, crew.lon], { radius: 10, color, fillColor: color, fillOpacity: 0.9, weight: 2 });
    marker.bindPopup(`<strong>${crew.name}</strong><br>${crew.status.toUpperCase()}<br>${crew.skills.join(', ')}<br>${crew.status === 'available' ? 'Ready now' : 'En route'} `);
    marker.addTo(state.crewLayer);
  });
}

function toggleMapLayer(layer) {
  state.mapToggles[layer] = !state.mapToggles[layer];
  updateMap();
}

function refreshMap() {
  updateMap();
  showToast('Map refreshed', 'Layers updated.');
}

function fitMap() {
  const coords = state.filteredDetections.map(item => [item.latitude, item.longitude]);
  if (!coords.length) return;
  state.map.fitBounds(L.latLngBounds(coords).pad(0.2));
}

function renderAnalytics(container) {
  container.innerHTML = `
    <div class="grid-2">
      <div class="card"><div class="section-header"><h2>🔮 Risk Prediction Engine</h2><span class="section-subtitle">Predicted risk zones based on historical patterns</span></div><div class="chart-card"><canvas id="prediction-donut"></canvas></div></div>
      <div class="card"><div class="section-header"><h2>Prediction Summary</h2><span class="section-subtitle">Risk levels assigned to each monitored zone</span></div><div class="activity-feed" id="prediction-summary"></div></div>
    </div>
    <div class="card table-card" style="margin-top:20px;"><div class="section-header"><h2>Top 10 At-Risk Zones</h2></div><div class="table-scroll"><table class="table-full"><thead><tr><th>Zone</th><th>Risk Level</th><th>Risk Score</th><th>Detections</th><th>First Seen</th><th>Trend</th><th>Action</th></tr></thead><tbody id="prediction-table"></tbody></table></div></div>
  `;
  renderPredictionPanel();
}

function renderPredictionPanel() {
  const table = document.getElementById('prediction-table');
  const summary = document.getElementById('prediction-summary');
  if (!table || !summary) return;
  table.innerHTML = '';
  summary.innerHTML = '';
  state.predictions.slice(0, 10).forEach(item => {
    table.innerHTML += `<tr><td>${item.zone}</td><td>${item.risk_level}</td><td>${item.risk_score}</td><td>${item.count}</td><td>${new Date(item.firstSeen).toLocaleDateString()}</td><td>${item.trend}</td><td><button class="btn btn-secondary" onclick="scheduleInspection('${item.zone}')">Schedule</button></td></tr>`;
    summary.innerHTML += `<div class="activity-item"><span>${item.zone}</span><strong>${item.risk_level}</strong><span>${item.count} incidents</span></div>`;
  });
  const donutCtx = document.getElementById('prediction-donut').getContext('2d');
  if (state.charts && state.charts.predictionDonut) state.charts.predictionDonut.destroy();
  state.charts = state.charts || {};
  state.charts.predictionDonut = new Chart(donutCtx, { type: 'doughnut', data: { labels: ['Imminent Risk','High Risk','Moderate Risk','Watch Zone'], datasets: [{ data: state.predictions.slice(0,4).map(x => x.count), backgroundColor: ['#7C3AED','#EF4444','#F59E0B','#10B981'] }] }, options: { responsive: true, cutout: '60%', plugins: { legend: { position: 'bottom' } } } });
}

function renderQueue(container) {
  container.innerHTML = `
    <div class="section-header"><h2>Priority Queue</h2><span class="section-subtitle">Automated zone scoring, critical dispatch, and cluster assignment</span></div>
    <div class="grid-2" style="gap:18px;">
      <div><div id="priority-zone-list"></div></div>
      <div class="cluster-panel"><div class="section-header"><h2>Cluster Overview</h2><span class="section-subtitle">Detected clusters by proximity</span></div><div id="cluster-list"></div></div>
    </div>
  `;
  updateZoneScores();
  renderPriorityZoneCards();
  renderClusterList();
}

function renderPriorityZoneCards() {
  const container = document.getElementById('priority-zone-list');
  if (!container) return;
  container.innerHTML = '';
  state.zoneScores.forEach((zone, index) => {
    const card = document.createElement('div');
    card.className = 'incident-card';
    if (index < 3) card.style.borderColor = '#F87171';
    card.innerHTML = `
      <div class="incident-top"><div class="incident-title">Zone ${zone.zone}</div><div class="badge-pill ${zone.score > 25 ? 'badge-red' : 'badge-medium'}">${zone.score} pts</div></div>
      <div class="incident-detail">Count: ${zone.count} · Density: ${zone.density} · Recency: ${zone.recencyBonus} · Severity: ${zone.severityWeight}</div>
      <div class="priority-bar"><div class="priority-fill ${zone.fillClass}" style="width:${Math.min(100, zone.score * 2.5)}%"></div></div>
      <div class="incident-actions"><button class="btn btn-secondary" onclick="setPage('#map')">View Map</button><button class="btn btn-primary" onclick="autoAssignCrew('${zone.zone}')">Auto Assign Crew</button></div>
    `;
    container.appendChild(card);
  });
}

function renderClusterList() {
  const container = document.getElementById('cluster-list');
  if (!container) return;
  container.innerHTML = '';
  state.clusters.forEach(cluster => {
    const card = document.createElement('div');
    card.className = 'cluster-card';
    card.innerHTML = `
      <div class="incident-top"><div class="incident-title">🔵 ${cluster.id}</div><div class="badge-pill badge-blue">${cluster.detections.length} issues</div></div>
      <div class="incident-detail">Radius: ~${Math.round(cluster.radius * 1000)}m · Max severity: ${cluster.maxSeverity}</div>
      <div class="incident-detail">Score: ${cluster.score}</div>
      <div class="incident-actions"><button class="btn btn-secondary" onclick="assignCluster('${cluster.id}')">Assign All to One Crew</button></div>
    `;
    container.appendChild(card);
  });
}

function renderCrewManagement(container) {
  const assignedTasks = Object.values(state.assignments).filter(a => a.status === 'assigned');
  const completedTasks = Object.values(state.assignments).filter(a => a.status === 'resolved').length;
  container.innerHTML = `
    <div class="section-header"><h2>Crew Management</h2><span class="section-subtitle">Track simulated crews, availability, and assignments</span></div>
    <div class="grid-4">
      <div class="card"><div class="section-heading">Total Crews</div><div class="kpi-value">${simulatedCrews.length}</div></div>
      <div class="card"><div class="section-heading">Active Assignments</div><div class="kpi-value">${assignedTasks.length}</div></div>
      <div class="card"><div class="section-heading">Resolved Tasks</div><div class="kpi-value">${completedTasks}</div></div>
      <div class="card"><div class="section-heading">Awaiting Dispatch</div><div class="kpi-value">${state.zoneScores.filter(z => z.score > 20 && !state.assignments[z.zone]).length}</div></div>
    </div>
    <div class="grid-2" style="margin-top:20px;">
      <div>${simulatedCrews.map(crew => `
        <div class="crew-card">
          <div class="crew-card-head"><div><strong>${crew.name}</strong><div style="font-size:13px;color:#64748B;margin-top:6px;">${crew.id}</div></div><div class="crew-status status-${crew.status}">${crew.status.toUpperCase()}</div></div>
          <div class="incident-detail">Location: ${crew.lat.toFixed(3)}, ${crew.lon.toFixed(3)}</div>
          <div class="incident-detail">Skills: ${crew.skills.join(', ')}</div>
          <div class="incident-detail">ETA rate: ${crew.eta_per_km} min/km</div>
          <div class="incident-actions"><button class="btn btn-secondary" onclick="trackCrew('${crew.id}')">📍 Track</button><button class="btn btn-secondary" onclick="showCrewHistory('${crew.id}')">📋 History</button></div>
        </div>`).join('')}</div>
      <div class="card"><div class="section-header"><h2>Assignment Log</h2><span class="section-subtitle">Recent crew dispatch events</span></div><div class="activity-feed" id="assignment-log"></div></div>
    </div>
    <div class="card" style="margin-top:20px;"><div class="section-header"><h2>Crew Utilization</h2></div><canvas id="crew-utilization-chart"></canvas></div>
  `;
  renderAssignmentLog();
  renderCrewChart();
}

function renderAssets(container) {
  container.innerHTML = `<div class="section-header"><h2>Asset Registry</h2><span class="section-subtitle">Simulated asset registry for the roadway network</span></div><div class="card"><p>No asset registry details are currently available in this demo mode.</p></div>`;
}

function renderMaintenance(container) {
  container.innerHTML = `<div class="section-header"><h2>Maintenance Track</h2><span class="section-subtitle">Simulated crew maintenance tasks and inspections</span></div><div class="card"><p>No active maintenance tasks are configured in this demo mode.</p></div>`;
}

function renderReports(container) {
  container.innerHTML = `
    <div class="section-header"><h2>Reporting Builder</h2><span class="section-subtitle">Generate CSV reports for demo playback</span><div class="incident-actions"><button class="btn btn-primary" onclick="downloadReport('all')">Generate Report</button><button class="btn btn-secondary" onclick="downloadReport('csv')">Download CSV</button></div></div>
    <div class="grid-2" style="margin-top:20px;"><div class="card"><div class="section-heading">Daily Summary</div><div class="kpi-value">${state.filteredDetections.length}</div><div class="kpi-meta">Current detections</div></div><div class="card"><div class="section-heading">Critical Zones</div><div class="kpi-value">${state.zoneScores.filter(z => z.score > 20).length}</div><div class="kpi-meta">Zones needing dispatch</div></div></div>
    <div class="card table-card" style="margin-top:20px;"><div class="section-header"><h2>Current Report Preview</h2></div><div class="table-scroll"><table class="table-full"><thead><tr><th>Zone</th><th>Score</th><th>Detections</th><th>Assigned</th></tr></thead><tbody>${state.zoneScores.slice(0,5).map(z => `<tr><td>${z.zone}</td><td>${z.score}</td><td>${z.count}</td><td>${state.assignments[z.zone] ? 'Yes' : 'No'}</td></tr>`).join('')}</tbody></table></div></div>
  `;
}

function renderSettings(container) {
  container.innerHTML = `
    <div class="section-header"><h2>Settings</h2><span class="section-subtitle">Configure dashboard behavior, live alerts, map layers, and simulation</span></div>
    <div class="settings-grid">
      <div class="settings-card">
        <div class="section-heading">Dashboard Controls</div>
        <div class="field-row">
          <label>Dashboard mode</label>
          <div class="toggle-group">
            <button class="toggle-pill ${state.detections.length === 0 ? 'active' : ''}" onclick="setDashboardMode('demo')">Demo mode</button>
            <button class="toggle-pill ${state.detections.length > 0 ? 'active' : ''}" onclick="setDashboardMode('live')">Live mode</button>
          </div>
        </div>
        <div class="field-row">
          <label>Auto-refresh interval</label>
          <div class="range-row"><input class="input-field" id="refresh-interval" type="range" min="5" max="30" step="1" value="${state.refreshInterval}" oninput="updateRefreshInterval(this.value)"><span>${state.refreshInterval}s</span></div>
        </div>
        <div class="field-row">
          <label>Sound alerts</label>
          <button class="btn ${state.soundAlerts ? 'btn-danger' : 'btn-primary'}" onclick="toggleSoundAlerts()">${state.soundAlerts ? 'Disable' : 'Enable'} sound alerts</button>
        </div>
        <div class="field-row">
          <label>Firebase status</label>
          <span class="status-pill ${state.firebaseError ? 'status-failed' : 'status-success'}">${state.firebaseError ? 'Offline — using local data' : 'Connected — live sync active'}</span>
        </div>
      </div>
      <div class="settings-card">
        <div class="section-heading">Alerts & Priority Tuning</div>
        <div class="field-row">
          <label>Alert threshold</label>
          <div class="range-row"><input class="input-field" id="alert-threshold" type="range" min="5" max="40" step="1" value="${state.alertThreshold}" oninput="updateAlertThreshold(this.value)"><span>${state.alertThreshold}</span></div>
        </div>
        ${['severity','count','recency','density'].map(key => `
          <div class="field-row">
            <label>${key[0].toUpperCase()+key.slice(1)} weight: ${state.weights[key]}</label>
            <input class="input-field" id="weight-${key}" type="range" min="1" max="10" step="1" value="${state.weights[key]}" oninput="updateWeight('${key}', this.value)">
          </div>
        `).join('')}
        <div class="incident-actions">
          <button class="btn btn-primary" onclick="recalculateAllPriorities()">Recalculate priorities</button>
          <button class="btn btn-secondary" onclick="resetWeights()">Reset defaults</button>
        </div>
      </div>
    </div>
    <div class="settings-grid" style="margin-top:20px;">
      <div class="settings-card">
        <div class="section-heading">Map & Visibility</div>
        ${Object.keys(state.mapToggles).map(key => `
          <div class="toggle-row">
            <label>${key[0].toUpperCase()+key.slice(1)}</label>
            <input type="checkbox" ${state.mapToggles[key] ? 'checked' : ''} onchange="setMapToggle('${key}', this.checked)">
          </div>
        `).join('')}
        <div class="field-row">
          <label>Show top-priority zones</label>
          <button class="btn btn-secondary" onclick="scrollToSection('#overview-zone-list')">View zone list</button>
        </div>
      </div>
      <div class="settings-card">
        <div class="section-heading">Simulation & Reset</div>
        <div class="incident-actions" style="flex-wrap: wrap; gap: 12px;">
          <button class="btn btn-primary" onclick="addRandomDetection()">Add random detection</button>
          <button class="btn btn-secondary" onclick="addRandomBatch(10)">Add 10 detections</button>
          <button class="btn btn-secondary" onclick="simulateCrewActivity()">Simulate crew activity</button>
          <button class="btn btn-danger" onclick="clearSimulationData()">Clear simulated data</button>
          <button class="btn btn-outline" onclick="resetDashboard()">Reset dashboard</button>
        </div>
      </div>
    </div>
  `;
}

function updateWeight(key, value) {
  state.weights[key] = Number(value);
  localStorage.setItem('weights', JSON.stringify(state.weights));
}

function resetWeights() {
  state.weights = { severity: 5, count: 3, recency: 2, density: 4 };
  localStorage.setItem('weights', JSON.stringify(state.weights));
  ['severity','count','recency','density'].forEach(key => {
    const slider = document.getElementById(`weight-${key}`);
    if (slider) slider.value = state.weights[key];
  });
  recalculateAllPriorities();
}

function updateAlertThreshold(value) {
  state.alertThreshold = Number(value);
  localStorage.setItem('alertThreshold', state.alertThreshold);
  const label = document.querySelector('#alert-threshold + span');
  if (label) label.textContent = state.alertThreshold;
}

function setDashboardMode(mode) {
  if (mode === 'demo') {
    state.detections = sampleDetections.map(normalizeDetection);
    state.filteredDetections = [...state.detections];
    showToast('Dashboard mode', 'Demo mode activated.');
  } else if (mode === 'live') {
    state.filteredDetections = [...state.detections];
    showToast('Dashboard mode', 'Live mode activated.');
  }
  renderCurrentPage();
}

function updateRefreshInterval(value) {
  state.refreshInterval = Number(value);
  state.refreshCountdown = state.refreshInterval;
  const label = document.querySelector('#refresh-interval + span');
  if (label) label.textContent = `${state.refreshInterval}s`;
}

function setMapToggle(layer, enabled) {
  state.mapToggles[layer] = enabled;
  if (state.map) renderMap();
  renderCurrentPage();
}

function resetDashboard() {
  state.refreshInterval = 8;
  state.refreshCountdown = 8;
  state.alertThreshold = 15;
  state.weights = { severity: 5, count: 3, recency: 2, density: 4 };
  state.mapToggles = { markers: true, heat: false, clusters: false, risk: false, crew: true, routes: true };
  localStorage.setItem('weights', JSON.stringify(state.weights));
  localStorage.setItem('alertThreshold', state.alertThreshold);
  showToast('Dashboard reset', 'Settings restored to default.');
  renderCurrentPage();
}

function toggleSoundAlerts() {
  state.soundAlerts = !state.soundAlerts;
  localStorage.setItem('soundAlerts', JSON.stringify(state.soundAlerts));
  showToast('Sound Alerts', state.soundAlerts ? 'Enabled' : 'Disabled');
  renderCurrentPage();
}

function addRandomDetection() {
  const lat = 12.967 + Math.random() * 0.017;
  const lon = 77.588 + Math.random() * 0.016;
  const severities = ['High', 'Medium', 'Low'];
  const severity = severities[Math.floor(Math.random() * severities.length)];
  const detection = normalizeDetection({
    id: `D-R${Date.now()}`,
    type: 'pothole',
    confidence: Number((0.7 + Math.random() * 0.25).toFixed(2)),
    severity,
    latitude: lat,
    longitude: lon,
    timestamp: new Date().toISOString(),
    z_spike: Number((1 + Math.random() * 6).toFixed(1)),
  });
  state.detections.unshift(detection);
  state.filteredDetections = [...state.detections];
  addActivity(`New ${severity} pothole detected at ${detection.zone}`);
  refreshAllData(true);
  showToast('Simulation added', 'One random pothole detection created.');
}

function addRandomBatch(count) {
  for (let i = 0; i < count; i += 1) {
    addRandomDetection();
  }
  showToast('Batch simulation', `${count} random detections added.`);
}

function simulateCrewActivity() {
  Object.values(state.assignments).forEach(a => {
    if (a.status === 'assigned') {
      a.eta_minutes = Math.max(1, a.eta_minutes - Math.round(Math.random() * 5));
      if (a.eta_minutes <= 2) a.status = 'resolved';
    }
  });
  state.assignments = { ...state.assignments };
  saveAssignments();
  refreshAllData();
  showToast('Simulation', 'Crew activity simulated.');
}

function clearSimulationData() {
  state.detections = sampleDetections.map(normalizeDetection);
  state.filteredDetections = [...state.detections];
  state.assignments = {};
  localStorage.removeItem('assignments');
  state.alerts = [];
  localStorage.removeItem('alerts');
  state.activityFeed = [];
  localStorage.removeItem('activityFeed');
  refreshAllData(true);
  showToast('Simulation cleared', 'Demo data reset to base sample set.');
}

function recalculateAllPriorities() {
  updateZoneScores();
  renderCurrentPage();
  showToast('Priorities recalculated', `${state.zoneScores.length} zones updated`);
}

function clearResolvedZones() {
  Object.entries(state.assignments).forEach(([zone, assignment]) => {
    if (assignment.status === 'resolved') delete state.assignments[zone];
  });
  saveAssignments();
  refreshAllData();
  showToast('Clear Resolved', 'Resolved zones archived.');
}

function runRiskPrediction() {
  calculatePredictions();
  renderCurrentPage();
  showToast('Risk prediction updated', `${state.predictions.filter(p => p.risk_level === 'Imminent Risk').length} imminent risk zones found`);
}

function autoDispatchCritical() {
  const criticalZones = state.zoneScores.filter(zone => zone.score > 20 && !state.assignments[zone.zone]);
  criticalZones.forEach(zone => autoAssignCrew(zone.zone, false));
  showToast('Auto dispatch complete', `✅ ${criticalZones.length} critical zones assigned to crews`);
}

function viewTopRiskZones() {
  if (!state.zoneScores.length) return;
  const top5 = state.zoneScores.slice(0, 5);
  if (!state.map) setPage('#map');
  setTimeout(() => {
    const bounds = L.latLngBounds(top5.map(z => z.center));
    state.map.fitBounds(bounds.pad(0.2));
  }, 500);
}

function generateReportCSV() {
  const data = state.zoneScores.map(z => ({ zone: z.zone, score: z.score, count: z.count, severity: z.topSeverity, assigned: state.assignments[z.zone] ? 'Yes' : 'No' }));
  downloadCSV(data, `roadsense_report_${new Date().toISOString().slice(0,10)}.csv`);
}

function downloadReport(type) {
  const data = state.zoneScores.slice(0, 20).map(z => ({ zone: z.zone, score: z.score, count: z.count, assigned: state.assignments[z.zone] ? 'Yes' : 'No' }));
  downloadCSV(data, `roadsense_report_${new Date().toISOString().slice(0,10)}.csv`);
}

function downloadCSV(data, filename) {
  if (!data.length) return;
  const headers = Object.keys(data[0]);
  const rows = data.map(row => headers.map(h => JSON.stringify(row[h] || '')).join(','));
  const csv = [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
}

function updateZoneScores() {
  const zoneMap = {};
  state.detections.forEach(item => {
    const zone = item.zone;
    if (!zoneMap[zone]) zoneMap[zone] = { zone, detections: [], count: 0, high: 0, medium: 0, low: 0, lastSeen: item.timestamp, center: [item.latitude, item.longitude] };
    zoneMap[zone].detections.push(item);
    zoneMap[zone].count += 1;
    if (item.severity === 'High') zoneMap[zone].high += 1;
    if (item.severity === 'Medium') zoneMap[zone].medium += 1;
    if (item.severity === 'Low') zoneMap[zone].low += 1;
    if (new Date(item.timestamp) > new Date(zoneMap[zone].lastSeen)) zoneMap[zone].lastSeen = item.timestamp;
  });
  state.zoneScores = Object.values(zoneMap).map(zone => {
    zone.severityWeight = Math.max(...zone.detections.map(d => severityValue(d.severity)));
    zone.recencyBonus = Math.max(...zone.detections.map(d => recencyBonus(d.timestamp)));
    zone.density = clusterDensity(zone);
    zone.score = Math.round((zone.severityWeight * state.weights.severity) + (zone.count * state.weights.count) + (zone.recencyBonus * state.weights.recency) + (zone.density * state.weights.density));
    zone.topSeverity = zone.high ? 'High' : zone.medium ? 'Medium' : 'Low';
    zone.fillClass = zone.score > 25 ? 'high' : zone.score > 15 ? 'medium' : 'low';
    zone.center = zone.detections.length ? [zone.detections[0].latitude, zone.detections[0].longitude] : [12.9716, 77.5946];
    return zone;
  }).sort((a, b) => b.score - a.score);
}

function severityValue(severity) {
  return severity === 'High' ? 3 : severity === 'Medium' ? 2 : 1;
}

function recencyBonus(timestamp) {
  const ageHours = (new Date() - new Date(timestamp)) / 3600000;
  if (ageHours < 1) return 3;
  if (ageHours < 6) return 2;
  if (ageHours < 24) return 1;
  return 0;
}

function clusterDensity(zone) {
  const center = zone.center;
  return zone.detections.filter(d => Math.abs(d.latitude - center[0]) <= 0.005 && Math.abs(d.longitude - center[1]) <= 0.005).length;
}

function calculatePriority(item) {
  const severityWeight = severityValue(item.severity);
  const recency = recencyBonus(item.timestamp);
  const count = state.detections.filter(d => d.zone === `${Number(item.latitude).toFixed(3)},${Number(item.longitude).toFixed(3)}`).length;
  const density = state.detections.filter(d => Math.abs(d.latitude - item.latitude) <= 0.005 && Math.abs(d.longitude - item.longitude) <= 0.005).length;
  return Math.round((severityWeight * state.weights.severity) + (count * state.weights.count) + (recency * state.weights.recency) + (density * state.weights.density));
}

function buildClusters() {
  const clusters = [];
  const assigned = new Set();
  state.detections.forEach(d => {
    if (assigned.has(d.id)) return;
    const cluster = { id: `CLU-${String(clusters.length + 1).padStart(3,'0')}`, detections: [d], center_lat: d.latitude, center_lon: d.longitude, maxSeverity: d.severity, score: 0, radius: 0 };
    state.detections.forEach(other => {
      if (assigned.has(other.id) || other.id === d.id) return;
      const dist = haversineDistance(d.latitude, d.longitude, other.latitude, other.longitude);
      if (dist <= 0.555) {
        cluster.detections.push(other);
        assigned.add(other.id);
        if (severityValue(other.severity) > severityValue(cluster.maxSeverity)) cluster.maxSeverity = other.severity;
      }
    });
    assigned.add(d.id);
    const points = cluster.detections.map(item => [item.latitude, item.longitude]);
    cluster.radius = Math.max(...points.map(p => haversineDistance(d.latitude, d.longitude, p[0], p[1])) || [0]);
    cluster.score = cluster.detections.reduce((sum, item) => sum + calculatePriority(item), 0);
    clusters.push(cluster);
  });
  state.clusters = clusters;
}

function calculatePredictions() {
  const zoneMap = {};
  state.detections.forEach(item => {
    const zone = item.zone;
    if (!zoneMap[zone]) zoneMap[zone] = { zone, detections: [], firstSeen: item.timestamp, highCount: 0, lastWeek: false, currentWeek: false };
    const zoneObj = zoneMap[zone];
    zoneObj.detections.push(item);
    if (new Date(item.timestamp) < new Date(zoneObj.firstSeen)) zoneObj.firstSeen = item.timestamp;
    if (item.severity === 'High') zoneObj.highCount += 1;
    const daysAgo = (new Date() - new Date(item.timestamp)) / 86400000;
    if (daysAgo < 14 && daysAgo >= 7) zoneObj.lastWeek = true;
    if (daysAgo < 7) zoneObj.currentWeek = true;
  });
  state.predictions = Object.values(zoneMap).map(zone => {
    const count = zone.detections.length;
    const daysSince = (new Date() - new Date(zone.firstSeen)) / 86400000;
    const recurrenceFlag = zone.lastWeek && zone.currentWeek ? 1 : 0;
    const risk_score = Math.round((count * 2) + (daysSince * 0.5) + (zone.highCount * 3) + (recurrenceFlag * 5));
    const risk_level = risk_score > 20 ? 'Imminent Risk' : risk_score > 12 ? 'High Risk' : risk_score > 6 ? 'Moderate Risk' : 'Watch Zone';
    const trend = recurrenceFlag ? '📈 Worsening' : '➡️ Stable';
    return { zone: zone.zone, count, firstSeen: zone.firstSeen, risk_score, risk_level, trend };
  }).sort((a,b) => b.risk_score - a.risk_score);
}

function autoAssignCrew(zone, showToastOnAssign = true) {
  const available = simulatedCrews.filter(crew => crew.status === 'available');
  if (!available.length) {
    showToast('No crews available', 'No available crews can be assigned now.');
    return;
  }
  const zoneData = state.zoneScores.find(z => z.zone === zone);
  if (!zoneData) return;
  const [lat, lon] = zone.split(',').map(Number);
  const distances = available.map(crew => ({ crew, dist: haversineDistance(crew.lat, crew.lon, lat, lon) }));
  distances.sort((a,b) => a.dist - b.dist);
  const selected = distances[0];
  const eta_minutes = Math.max(1, Math.round(selected.dist * selected.crew.eta_per_km));
  selected.crew.status = 'busy';
  state.assignments[zone] = {
    crew_id: selected.crew.id,
    crew_name: selected.crew.name,
    assigned_at: new Date().toISOString(),
    eta_minutes,
    distance_km: Number(selected.dist.toFixed(2)),
    status: 'assigned',
    route: { path: [[selected.crew.lat, selected.crew.lon], [lat, lon]] },
  };
  saveAssignments();
  drawAssignmentRoute(zone);
  addActivity(`🔧 ${selected.crew.name} assigned to zone ${zone}`);
  if (showToastOnAssign) showToast('Crew assigned', `${selected.crew.name} will arrive in ${eta_minutes} min`);
  updateMap();
}

function drawAssignmentRoute(zone) {
  const assignment = state.assignments[zone];
  if (!assignment || !state.map) return;
  const path = assignment.route.path;
  const line = L.polyline(path, { color: '#2563EB', dashArray: '8 6', weight: 3 }).addTo(state.routeLayer);
  const label = L.marker(path[0], { icon: L.divIcon({ className: 'crew-route-label', html: `<div style="padding:6px 10px;background:#2563EB;color:white;border-radius:999px;font-size:12px;">${assignment.crew_name} — ${assignment.distance_km}km — ${assignment.eta_minutes} min</div>` }) }).addTo(state.routeLayer);
  state.routeMarkers.push(label);
  const crewMarker = L.circleMarker(path[0], { radius: 9, color: '#F97316', fillColor: '#F97316', fillOpacity: 0.8 }).bindPopup(`<strong>${assignment.crew_name}</strong><br>En route`).addTo(state.crewLayer);
  state.routeMarkers.push(crewMarker);
}

function markZoneResolved(zone) {
  if (state.assignments[zone]) {
    state.assignments[zone].status = 'resolved';
    saveAssignments();
  }
  state.detections = state.detections.map(item => item.zone === zone ? { ...item, status: 'resolved' } : item);
  refreshAllData();
  showToast('Zone resolved', `Zone ${zone} marked fixed.`);
}

function saveAssignments() {
  localStorage.setItem('assignments', JSON.stringify(state.assignments));
}

function addActivity(message) {
  const event = { id: `A-${Date.now()}`, message, time: new Date().toLocaleTimeString() };
  state.activityFeed.unshift(event);
  state.activityFeed = state.activityFeed.slice(0, 20);
  localStorage.setItem('activityFeed', JSON.stringify(state.activityFeed));
}

function renderActivityFeed() {
  const feed = document.getElementById('overview-activity-feed');
  if (!feed) return;
  feed.innerHTML = state.activityFeed.map(item => `<div class="activity-item"><span>${item.message}</span><span style="font-size:12px;color:#64748B;">${item.time}</span></div>`).join('');
}

function renderAssignmentLog() {
  const log = document.getElementById('assignment-log');
  if (!log) return;
  const assignments = Object.entries(state.assignments).map(([zone, assignment]) => ({ zone, ...assignment })).slice(0, 10);
  log.innerHTML = assignments.map(item => `<div class="activity-item"><div><strong>${item.crew_name}</strong> → ${item.zone}</div><div>${item.status}</div><div>${formatShortTime(item.assigned_at)}</div></div>`).join('');
}

function renderCrewChart() {
  const ctx = document.getElementById('crew-utilization-chart').getContext('2d');
  if (state.charts && state.charts.crewUtil) state.charts.crewUtil.destroy();
  const labels = simulatedCrews.map(c => c.name);
  const completed = simulatedCrews.map(c => Object.values(state.assignments).filter(a => a.crew_id === c.id && a.status === 'resolved').length);
  state.charts = state.charts || {};
  state.charts.crewUtil = new Chart(ctx, { type: 'bar', data: { labels, datasets: [{ label: 'Completed', data: completed, backgroundColor: simulatedCrews.map(c => c.status === 'available' ? '#10B981' : c.status === 'busy' ? '#F59E0B' : '#94A3B8') }] }, options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } } });
}

function setPage(page) {
  const button = document.querySelector(`.nav-item[data-page='${page}']`);
  if (button) button.click();
}

function trackCrew(crewId) {
  const crew = simulatedCrews.find(c => c.id === crewId);
  if (!crew) return;
  setPage('#map');
  setTimeout(() => state.map.setView([crew.lat, crew.lon], 15), 500);
}

function showCrewHistory(crewId) {
  const assignments = Object.values(state.assignments).filter(a => a.crew_id === crewId);
  showToast('Crew history', `${assignments.length} task(s) found for ${crewId}.`);
}

function scheduleInspection(zone) {
  addActivity(`📝 Inspection scheduled for ${zone}`);
  showToast('Inspection scheduled', `Action added to maintenance track.`);
}

function toggleNotifications() {
  document.getElementById('notification-drawer').classList.toggle('open');
}

function markAllNotificationsRead() {
  state.notifications.forEach(item => item.unread = false);
  renderNotifications();
}

function renderNotifications() {
  const list = document.getElementById('notification-list');
  if (!list) return;
  list.innerHTML = state.notifications.map(notif => `<div class="notification-item"><strong>${notif.label}</strong><span>${notif.details}</span><span class="notification-time">${notif.time}</span></div>`).join('');
  const count = state.notifications.filter(item => item.unread).length;
  document.getElementById('notification-count').textContent = count ? count : '';
}

function showToast(title, message) {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.innerHTML = `<strong>${title}</strong><p style="margin:8px 0 0;color:var(--text-secondary);font-size:13px;">${message}</p>`;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 5000);
  if (state.soundAlerts) playAlertSound();
}

function playAlertSound() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    osc.frequency.value = 880;
    osc.connect(ctx.destination);
    osc.start();
    setTimeout(() => osc.stop(), 180);
  } catch (error) {
    console.warn('Audio disabled', error);
  }
}

function evaluateAlerts() {
  const now = new Date();
  state.zoneScores.forEach(zone => {
    const recent = zone.detections.some(d => (now - new Date(d.timestamp)) / 60000 <= 5 && d.severity === 'High');
    if (recent) addAlert(`🔴 Critical pothole at ${zone.zone}`, `${zone.count} detections in last 5 minutes`);
    const spike = state.detections.filter(d => (now - new Date(d.timestamp)) / 1000 <= 60).length >= 5;
    if (spike) addAlert('⚠️ Detection spike — possible road emergency', '5+ detections in the last minute');
    const unattended = zone.score > 25 && !state.assignments[zone.zone] && (now - new Date(zone.lastSeen)) / 60000 > 30;
    if (unattended) addAlert(`🚨 Critical zone unattended — Zone ${zone.zone}`, 'Immediate dispatch required');
    const previous = state.lastZoneScores[zone.zone] || 0;
    if (zone.score - previous >= 10) addAlert(`📈 Zone ${zone.zone} is worsening`, `Priority score increased by ${zone.score - previous}`);
    state.lastZoneScores[zone.zone] = zone.score;
  });
}

function addAlert(title, details) {
  if (state.alerts.some(alert => alert.title === title && alert.details === details)) return;
  const alert = { id: `AL-${Date.now()}`, title, details, time: new Date().toLocaleTimeString(), unread: true };
  state.alerts.unshift(alert);
  state.alerts = state.alerts.slice(0, 20);
  localStorage.setItem('alerts', JSON.stringify(state.alerts));
  state.notifications.unshift({ id: alert.id, label: title, details, time: alert.time, unread: true });
  state.notifications = state.notifications.slice(0, 20);
  renderNotifications();
  addActivity(title);
}

function formatShortTime(timestamp) {
  const date = new Date(timestamp);
  const diff = Math.floor((new Date() - date) / 60000);
  if (diff < 60) return `${diff}m ago`;
  const hours = Math.floor(diff / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function getPeakDetectionHour() {
  const counts = Array(24).fill(0);
  state.detections.forEach(item => { counts[new Date(item.timestamp).getHours()] += 1; });
  const index = counts.indexOf(Math.max(...counts));
  return `${String(index).padStart(2,'0')}:00–${String((index + 1) % 24).padStart(2,'0')}:00`;
}

function setPage(page) {
  const button = document.querySelector(`.nav-item[data-page='${page}']`);
  if (button) button.click();
}

function renderNotifications() {
  const list = document.getElementById('notification-list');
  if (!list) return;
  list.innerHTML = state.notifications.map(notif => `<div class="notification-item"><strong>${notif.label}</strong><span>${notif.details}</span><span class="notification-time">${notif.time}</span></div>`).join('');
  const count = state.notifications.filter(item => item.unread).length;
  document.getElementById('notification-count').textContent = count ? count : '';
}

function updateMapIfVisible() {
  if (state.currentPage === '#map' && state.map) updateMap();
}

function assignCluster(clusterId) {
  const cluster = state.clusters.find(c => c.id === clusterId);
  if (!cluster) return;
  cluster.detections.forEach(d => autoAssignCrew(d.zone, false));
  showToast('Cluster assigned', `${cluster.detections.length} detections assigned to crews.`);
}

function setPage(page) {
  const button = document.querySelector(`.nav-item[data-page='${page}']`);
  if (button) button.click();
}

function resolveIncident(id) {
  const detection = state.detections.find(d => d.id === id);
  if (detection) {
    detection.status = 'resolved';
    refreshAllData();
  }
}

function closeDrawer() {
  document.getElementById('detail-drawer').classList.remove('drawer-open');
}

function debounce(fn, delay) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

window.addEventListener('DOMContentLoaded', initApp);
