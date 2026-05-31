// ScanPass App Controller and Routing Logic (Migrated to real-time Firebase Firestore)
import { Html5Qrcode } from 'html5-qrcode';
import QRCode from 'qrcode';
import {
  initDb,
  isOnline,
  setOnlineStatus,
  getEvents,
  createEvent,
  getEvent,
  getTickets,
  getTicket,
  createTicket,
  getEventTickets,
  getEventStats,
  checkInTicket,
  getOfflineQueue,
  syncOfflineQueue,
  getStaffAccounts,
  createStaffAccount,
  authenticateUser,
  getCurrentSession,
  logoutSession,
  updateEventLocation,
  resetTicketCheckIn,
  invalidateTicket
} from './db.js';

// Global Scanner Variable
let qrScannerInstance = null;
let currentActiveEventId = null;
let currentLedgerSearchQuery = '';
let currentLedgerFilter = 'all';

// On DOM Loaded
document.addEventListener('DOMContentLoaded', async () => {
  // Register Service Worker for PWA
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').then((reg) => {
      console.log('ScanPass Service Worker registered:', reg.scope);
    }).catch((err) => {
      console.warn('Service Worker registration failed:', err);
    });
  }

  // App Elements
  const headerNav = document.getElementById('app-navigation');
  const globalHeader = document.getElementById('global-header');
  const networkToggle = document.getElementById('network-toggle-checkbox');
  const networkBadge = document.getElementById('network-status-badge');
  const networkText = document.getElementById('network-status-text');

  // Navigation Tabs
  const navBtnDashboard = document.getElementById('nav-btn-dashboard');
  const navBtnEvents = document.getElementById('nav-btn-events');
  const navBtnScanner = document.getElementById('nav-btn-scanner');

  // Views
  const viewLogin = document.getElementById('view-login');
  const viewDashboard = document.getElementById('view-dashboard');
  const viewEvents = document.getElementById('view-events');
  const viewScanner = document.getElementById('view-scanner');
  const viewTicket = document.getElementById('view-ticket');

  // 1. ROUTER SYSTEM (Determine user view based on query params or active sessions)
  const urlParams = new URLSearchParams(window.location.search);
  const ticketIdParam = urlParams.get('ticket');

  if (ticketIdParam) {
    // Hide header navigations for clean customer pass display
    globalHeader.style.display = 'none';
    headerNav.classList.add('hidden');
    
    // Switch to ticket view
    await switchView('ticket');
    await renderTicketPass(ticketIdParam);

  } else {
    // Initialize DB non-blockingly for console and staff logins
    initDb().catch(err => console.warn('Database initialization warning:', err));

    // Session check for console routing
    const session = getCurrentSession();
    if (session) {
      await handleSessionLogin(session);
    } else {
      await switchView('login');
    }
  }

  // Wire up Login Form
  const loginForm = document.getElementById('login-form');
  const loginErrorMsg = document.getElementById('login-error-msg');
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const user = document.getElementById('login-username').value;
      const pass = document.getElementById('login-password').value;
      const res = await authenticateUser(user, pass);
      if (res.success) {
        loginErrorMsg.classList.add('hidden');
        loginForm.reset();
        await handleSessionLogin(res.session);
        showToast(`Signed in as ${res.session.username}`, 'success');
      } else {
        loginErrorMsg.textContent = res.message;
        loginErrorMsg.classList.remove('hidden');
      }
    });
  }

  // Wire up Logout Button
  const logoutBtn = document.getElementById('nav-btn-logout');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      logoutSession();
      headerNav.classList.add('hidden');
      // Reset navigation link visibility
      navBtnDashboard.style.display = 'block';
      navBtnEvents.style.display = 'block';
      navBtnScanner.style.display = 'block';
      stopCameraScanner();
      await switchView('login');
      showToast('Logged out successfully.', 'success');
    });
  }

  async function handleSessionLogin(session) {
    // Show navigation container
    headerNav.classList.remove('hidden');
    
    // Dynamic access controls based on user role
    if (session.role === 'admin') {
      navBtnDashboard.style.display = 'block';
      navBtnEvents.style.display = 'block';
      navBtnScanner.style.display = 'none'; // Admin cannot perform QR scans
      
      await switchView('dashboard');
      await initConsole(); // Set up standard event/ticket creation
      await initAdminConsole(); // Set up staff management panels
    } else if (session.role === 'staff') {
      navBtnDashboard.style.display = 'none'; // Staff cannot access ledger
      navBtnEvents.style.display = 'none';
      navBtnScanner.style.display = 'block';
      
      await switchView('scanner'); // Direct staff to the QR scanner
      initStaffConsole();
    }
  }

  // Switch View Helper
  async function switchView(viewName) {
    // Stop scanner if leaving the scanner view
    if (viewName !== 'scanner') {
      stopCameraScanner();
    }

    // Toggle views active class
    viewLogin.classList.remove('active-view');
    viewDashboard.classList.remove('active-view');
    viewEvents.classList.remove('active-view');
    viewScanner.classList.remove('active-view');
    viewTicket.classList.remove('active-view');

    navBtnDashboard.classList.remove('active');
    navBtnEvents.classList.remove('active');
    navBtnScanner.classList.remove('active');

    if (viewName === 'login') {
      viewLogin.classList.add('active-view');
    } else if (viewName === 'dashboard') {
      viewDashboard.classList.add('active-view');
      navBtnDashboard.classList.add('active');
      await refreshDashboard();
    } else if (viewName === 'events') {
      viewEvents.classList.add('active-view');
      navBtnEvents.classList.add('active');
      await renderEventsList();
    } else if (viewName === 'scanner') {
      viewScanner.classList.add('active-view');
      navBtnScanner.classList.add('active');
      startCameraScanner();
    } else if (viewName === 'ticket') {
      viewTicket.classList.add('active-view');
    }
  }

  // 2. CONNECTIVITY SWITCH EMULATOR
  networkToggle.checked = isOnline();
  updateNetworkBadgeUI(isOnline());

  networkToggle.addEventListener('change', async (e) => {
    const online = e.target.checked;
    await setOnlineStatus(online);
  });

  // Listen to network change custom events
  window.addEventListener('scanpass-network-changed', (e) => {
    const online = e.detail.online;
    updateNetworkBadgeUI(online);
    
    if (online) {
      showToast('⚡ Firestore network connection restored.', 'success');
      triggerSyncProcess();
    } else {
      showToast('⚠️ App in offline mode. Scan writes will be queued in persistent local cache.', 'warning');
    }
  });

  function updateNetworkBadgeUI(online) {
    if (online) {
      networkBadge.className = 'network-badge status-online';
      networkText.textContent = 'Online';
    } else {
      networkBadge.className = 'network-badge status-offline';
      networkText.textContent = 'Offline';
    }
  }

  // 3. TOAST SYSTEM
  function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    let icon = '✓';
    if (type === 'error') icon = '✕';
    if (type === 'warning') icon = '⚠️';

    toast.innerHTML = `
      <div style="font-weight: bold; font-size: 1.1rem; filter: opacity(0.8);">${icon}</div>
      <div class="toast-message">${message}</div>
    `;
    
    container.appendChild(toast);

    // Fade out and remove
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'all 0.5s ease';
      setTimeout(() => toast.remove(), 500);
    }, 3500);
  }

  // Sync Event Listener
  document.getElementById('btn-sync-offline').addEventListener('click', triggerSyncProcess);

  function triggerSyncProcess() {
    const queue = getOfflineQueue();
    if (queue.length === 0) return;

    showToast(`Syncing offline scans...`, 'warning');
    
    const res = syncOfflineQueue();
    if (res.success) {
      setTimeout(async () => {
        showToast(res.message, 'success');
        await refreshDashboard();
      }, 1000);
    }
  }

  // 4. VENDOR CONSOLE INITIALIZATION
  async function initConsole() {
    // Nav links binding
    navBtnDashboard.addEventListener('click', async () => await switchView('dashboard'));
    navBtnEvents.addEventListener('click', async () => await switchView('events'));
    navBtnScanner.addEventListener('click', async () => await switchView('scanner'));

    // Helper to prepopulate current date and time in local timezone
    function setDefaultDateTime() {
      const now = new Date();
      const offsetMs = now.getTimezoneOffset() * 60 * 1000;
      const localISOTime = new Date(now.getTime() - offsetMs).toISOString().slice(0, 16);
      const input = document.getElementById('event-datetime-input');
      if (input) {
        input.value = localISOTime;
      }
    }

    // Populate events dropdown
    await populateEventsSelector();
    setDefaultDateTime();

    // Event Selector Change
    const eventSelector = document.getElementById('event-selector');
    eventSelector.addEventListener('change', async (e) => {
      currentActiveEventId = e.target.value;
      // Reset search/filter when changing event
      currentLedgerSearchQuery = '';
      currentLedgerFilter = 'all';
      const searchInput = document.getElementById('ledger-search-input');
      if (searchInput) searchInput.value = '';
      const filterTabs = document.querySelectorAll('.filter-tab');
      filterTabs.forEach(t => {
        t.classList.remove('active');
        if (t.getAttribute('data-filter') === 'all') t.classList.add('active');
      });
      await refreshDashboard();
    });

    // Search input handler
    const searchInput = document.getElementById('ledger-search-input');
    if (searchInput) {
      searchInput.addEventListener('input', async (e) => {
        currentLedgerSearchQuery = e.target.value;
        await renderTicketsLedger();
      });
    }

    // Filter tab handlers
    const filterTabs = document.querySelectorAll('.filter-tab');
    filterTabs.forEach(tab => {
      tab.addEventListener('click', async (e) => {
        filterTabs.forEach(t => t.classList.remove('active'));
        e.target.classList.add('active');
        currentLedgerFilter = e.target.getAttribute('data-filter');
        await renderTicketsLedger();
      });
    });

    // Create Event Form Submission
    const createEventForm = document.getElementById('create-event-form');
    createEventForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const title = document.getElementById('event-title-input').value;
      const venue = document.getElementById('event-venue-input').value;
      const dateTime = document.getElementById('event-datetime-input').value;
      const capacity = document.getElementById('event-capacity-input').value;
      const mapsUrl = document.getElementById('event-maps-input').value;

      const newEvent = await createEvent(title, venue, dateTime, capacity, mapsUrl);
      showToast(`Event "${newEvent.title}" created successfully!`, 'success');
      
      createEventForm.reset();
      setDefaultDateTime();
      await populateEventsSelector(newEvent.eventId); // Select the newly created event
      await renderEventsList(); // Refresh events directory list
    });

    // Update Event Location Form Submission
    const updateLocationForm = document.getElementById('update-event-location-form');
    if (updateLocationForm) {
      updateLocationForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!currentActiveEventId) {
          showToast('No active event selected.', 'error');
          return;
        }
        const venue = document.getElementById('update-event-venue-input').value;
        const mapsUrl = document.getElementById('update-event-maps-input').value;

        const res = await updateEventLocation(currentActiveEventId, venue, mapsUrl);
        if (res.success) {
          showToast(res.message, 'success');
          await populateEventsSelector(currentActiveEventId);
          await renderEventsList(); // Refresh events directory list
        } else {
          showToast(res.message, 'error');
        }
      });
    }

    // Issue Ticket Form counter controls
    const ticketGuestsInput = document.getElementById('ticket-guests-input');
    document.getElementById('btn-guest-dec').addEventListener('click', () => {
      let val = parseInt(ticketGuestsInput.value, 10) || 1;
      if (val > 1) ticketGuestsInput.value = val - 1;
    });

    document.getElementById('btn-guest-inc').addEventListener('click', () => {
      let val = parseInt(ticketGuestsInput.value, 10) || 1;
      if (val < 20) ticketGuestsInput.value = val + 1;
    });

    // Issue Ticket Form Submission
    const issueTicketForm = document.getElementById('issue-ticket-form');
    issueTicketForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!currentActiveEventId) {
        showToast('Please select or create an event first.', 'error');
        return;
      }

      const holderName = document.getElementById('ticket-holder-input').value;
      const contact = document.getElementById('ticket-contact-input').value;
      const guests = parseInt(ticketGuestsInput.value, 10) || 1;

      // Check capacity remaining
      const event = await getEvent(currentActiveEventId);
      const tickets = await getEventTickets(currentActiveEventId);
      const activeTickets = tickets.filter(t => t.status !== 'invalidated');
      const totalGuestsIssued = activeTickets.reduce((sum, t) => sum + (t.totalGuests || 0), 0);
      const remainingToIssue = Math.max(0, event.maxCapacity - totalGuestsIssued);

      if (guests > remainingToIssue) {
        showToast(`Cannot issue ticket. Only ${remainingToIssue} spots remaining.`, 'error');
        return;
      }

      const newTicket = await createTicket(currentActiveEventId, holderName, contact, guests);
      showToast(`Ticket generated for ${newTicket.holderName}!`, 'success');
      
      issueTicketForm.reset();
      ticketGuestsInput.value = 1;
      await refreshDashboard();
    });
  }

  async function populateEventsSelector(selectEventId = null) {
    const eventSelector = document.getElementById('event-selector');
    const events = await getEvents();
    
    eventSelector.innerHTML = '';
    
    if (events.length === 0) {
      const opt = document.createElement('option');
      opt.text = '-- No Events Available --';
      opt.value = '';
      eventSelector.appendChild(opt);
      currentActiveEventId = null;
      await refreshDashboard();
      return;
    }

    events.forEach(e => {
      const opt = document.createElement('option');
      opt.value = e.eventId;
      opt.text = `${e.title} (${e.venue})`;
      eventSelector.appendChild(opt);
    });

    // Choose default selection
    if (selectEventId && events.some(e => e.eventId === selectEventId)) {
      eventSelector.value = selectEventId;
    } else if (events.length > 0) {
      // Choose first one
      eventSelector.value = events[0].eventId;
    }

    currentActiveEventId = eventSelector.value;
    await refreshDashboard();
  }

  // 5. REFRESH DASHBOARD DETAILS
  async function refreshDashboard() {
    // Self-healing: if currentActiveEventId is null or empty, try to auto-select the first available event
    if (!currentActiveEventId) {
      const events = await getEvents();
      if (events.length > 0) {
        currentActiveEventId = events[0].eventId;
        const selector = document.getElementById('event-selector');
        if (selector) selector.value = currentActiveEventId;
      }
    }

    if (!currentActiveEventId) {
      document.getElementById('stats-event-title').textContent = 'No Event Selected';
      document.getElementById('stats-event-venue').textContent = 'Please select or create an event';
      document.getElementById('stats-event-date').textContent = '--';
      
      const checkedInEl = document.getElementById('stats-checked-in-count');
      const capacityEl = document.getElementById('stats-capacity-count');
      const remainingEl = document.getElementById('stats-remaining-count');
      const percentEl = document.getElementById('stats-entry-percentage');
      const gaugeEl = document.getElementById('stats-gauge-fill');
      
      if (checkedInEl) checkedInEl.textContent = '0';
      if (capacityEl) capacityEl.textContent = '0';
      if (remainingEl) remainingEl.textContent = '0';
      if (percentEl) percentEl.textContent = '0';
      if (gaugeEl) gaugeEl.style.strokeDashoffset = '264';

      const issueCapacityRemainingEl = document.getElementById('issue-capacity-remaining');
      if (issueCapacityRemainingEl) {
        issueCapacityRemainingEl.textContent = '0 / 0 spots';
        issueCapacityRemainingEl.style.color = 'var(--color-accent)';
      }

      // Clear KPIs if no event is active
      const kpiTicketsCount = document.getElementById('kpi-tickets-count');
      const kpiSpotsAllocated = document.getElementById('kpi-spots-allocated');
      const kpiCheckedIn = document.getElementById('kpi-checked-in');
      const kpiCheckedInSubtext = document.getElementById('kpi-checked-in-subtext');
      const kpiUnusedCount = document.getElementById('kpi-unused-count');
      const kpiPartialCount = document.getElementById('kpi-partial-count');
      const kpiInvalidatedSubtext = document.getElementById('kpi-invalidated-subtext');

      if (kpiTicketsCount) kpiTicketsCount.textContent = '0';
      if (kpiSpotsAllocated) kpiSpotsAllocated.textContent = '0 / 0';
      if (kpiCheckedIn) kpiCheckedIn.textContent = '0';
      if (kpiCheckedInSubtext) kpiCheckedInSubtext.textContent = '0 expected guests left';
      if (kpiUnusedCount) kpiUnusedCount.textContent = '0';
      if (kpiPartialCount) kpiPartialCount.textContent = '0';
      if (kpiInvalidatedSubtext) kpiInvalidatedSubtext.textContent = '0 invalidated';

      document.getElementById('tickets-table-body').innerHTML = '';
      
      const placeholder = document.getElementById('no-tickets-placeholder');
      if (placeholder) placeholder.style.display = 'flex';
      
      const offlineBanner = document.getElementById('offline-queue-banner');
      if (offlineBanner) offlineBanner.classList.add('hidden');
      return;
    }

    let event = await getEvent(currentActiveEventId);
    if (!event) {
      // Self-healing fallback: if event was deleted/not found, select first available
      const events = await getEvents();
      if (events.length > 0) {
        currentActiveEventId = events[0].eventId;
        const selector = document.getElementById('event-selector');
        if (selector) selector.value = currentActiveEventId;
        event = await getEvent(currentActiveEventId);
      }
    }

    if (!event) return;

    // Set stats header
    document.getElementById('stats-event-title').textContent = event.title;
    document.getElementById('stats-event-venue').textContent = `📍 ${event.venue}`;
    
    // Populate location details in update form
    const updateLocationForm = document.getElementById('update-event-location-form');
    if (updateLocationForm) {
      updateLocationForm.classList.remove('hidden');
      const venueInput = document.getElementById('update-event-venue-input');
      const mapsInput = document.getElementById('update-event-maps-input');
      if (venueInput && document.activeElement !== venueInput) {
        venueInput.value = event.venue;
      }
      if (mapsInput && document.activeElement !== mapsInput) {
        mapsInput.value = event.mapsUrl || '';
      }
    }
    
    // Try-catch safe date parsing
    let dateStr = '--';
    if (event.dateTime) {
      try {
        const d = new Date(event.dateTime);
        if (!isNaN(d.getTime())) {
          dateStr = d.toLocaleDateString(undefined, {month: 'short', day: 'numeric'});
        }
      } catch (err) {
        console.warn('Invalid event date format:', event.dateTime);
      }
    }
    document.getElementById('stats-event-date').textContent = dateStr;

    // Compute and draw progress
    const stats = await getEventStats(currentActiveEventId);
    
    const checkedInEl = document.getElementById('stats-checked-in-count');
    const capacityEl = document.getElementById('stats-capacity-count');
    const remainingEl = document.getElementById('stats-remaining-count');
    const percentEl = document.getElementById('stats-entry-percentage');
    const gaugeEl = document.getElementById('stats-gauge-fill');

    const remaining = Math.max(0, stats.capacity - stats.checkedIn);

    if (checkedInEl) checkedInEl.textContent = stats.checkedIn;
    if (capacityEl) capacityEl.textContent = stats.capacity;
    if (remainingEl) remainingEl.textContent = remaining;
    if (percentEl) percentEl.textContent = stats.percentage;

    if (gaugeEl) {
      const offset = 264 - (264 * stats.percentage) / 100;
      gaugeEl.style.strokeDashoffset = offset;
    }

    // Update available to issue spots
    const tickets = await getEventTickets(currentActiveEventId);
    const activeTickets = tickets.filter(t => t.status !== 'invalidated');
    const totalGuestsIssued = activeTickets.reduce((sum, t) => sum + (t.totalGuests || 0), 0);
    const maxCapacity = parseInt(event.maxCapacity, 10) || 100;
    const remainingToIssue = Math.max(0, maxCapacity - totalGuestsIssued);

    const issueCapacityRemainingEl = document.getElementById('issue-capacity-remaining');
    if (issueCapacityRemainingEl) {
      issueCapacityRemainingEl.textContent = `${remainingToIssue} / ${maxCapacity} spots`;
      if (remainingToIssue === 0) {
        issueCapacityRemainingEl.style.color = 'var(--color-danger)';
      } else if (remainingToIssue <= maxCapacity * 0.1) {
        issueCapacityRemainingEl.style.color = 'var(--color-warning)';
      } else {
        issueCapacityRemainingEl.style.color = 'var(--color-accent)';
      }
    }

    // Update KPI grid metrics
    const kpiTicketsCount = document.getElementById('kpi-tickets-count');
    const kpiSpotsAllocated = document.getElementById('kpi-spots-allocated');
    const kpiCheckedIn = document.getElementById('kpi-checked-in');
    const kpiCheckedInSubtext = document.getElementById('kpi-checked-in-subtext');
    const kpiUnusedCount = document.getElementById('kpi-unused-count');
    const kpiPartialCount = document.getElementById('kpi-partial-count');
    const kpiInvalidatedSubtext = document.getElementById('kpi-invalidated-subtext');

    if (kpiTicketsCount) kpiTicketsCount.textContent = tickets.length;
    if (kpiSpotsAllocated) kpiSpotsAllocated.textContent = `${totalGuestsIssued} / ${maxCapacity}`;
    
    const kpiSpotsSubtext = document.getElementById('kpi-spots-subtext');
    if (kpiSpotsSubtext) {
      const percentageAllocated = Math.round((totalGuestsIssued / maxCapacity) * 100) || 0;
      kpiSpotsSubtext.textContent = `${percentageAllocated}% of capacity allocated`;
    }

    if (kpiCheckedIn) kpiCheckedIn.textContent = stats.checkedIn;
    if (kpiCheckedInSubtext) {
      const expectedLeft = Math.max(0, totalGuestsIssued - stats.checkedIn);
      kpiCheckedInSubtext.textContent = `${expectedLeft} expected guest(s) left`;
    }

    const unusedCount = tickets.filter(t => t.status === 'pending').length;
    const partialCount = tickets.filter(t => t.status === 'partial').length;
    const invalidatedCount = tickets.filter(t => t.status === 'invalidated').length;

    if (kpiUnusedCount) kpiUnusedCount.textContent = unusedCount;
    if (kpiPartialCount) kpiPartialCount.textContent = partialCount;
    if (kpiInvalidatedSubtext) kpiInvalidatedSubtext.textContent = `${invalidatedCount} invalidated pass(es)`;

    // Render Tickets Ledger List
    await renderTicketsLedger();

    // Manage Offline queue banner
    const offlineQueue = getOfflineQueue();
    const offlineBanner = document.getElementById('offline-queue-banner');
    if (offlineQueue.length > 0) {
      if (offlineBanner) {
        offlineBanner.classList.remove('hidden');
        const bannerText = document.getElementById('offline-queue-banner-text');
        if (bannerText) bannerText.textContent = `${offlineQueue.length} Scan(s) Queued Offline`;
      }
    } else {
      if (offlineBanner) offlineBanner.classList.add('hidden');
    }
  }

  async function renderTicketsLedger() {
    const tableBody = document.getElementById('tickets-table-body');
    const placeholder = document.getElementById('no-tickets-placeholder');
    let tickets = await getEventTickets(currentActiveEventId);

    // Apply active filter
    if (currentLedgerFilter !== 'all') {
      tickets = tickets.filter(t => t.status === currentLedgerFilter);
    }

    // Apply search query
    if (currentLedgerSearchQuery.trim()) {
      const q = currentLedgerSearchQuery.toLowerCase();
      tickets = tickets.filter(t => 
        t.holderName.toLowerCase().includes(q) || 
        (t.holderContact && t.holderContact.includes(q)) || 
        t.ticketId.toLowerCase().includes(q)
      );
    }

    tableBody.innerHTML = '';

    if (tickets.length === 0) {
      placeholder.style.display = 'flex';
      const totalEventTickets = await getEventTickets(currentActiveEventId);
      const placeholderText = placeholder.querySelector('p');
      if (placeholderText) {
        if (totalEventTickets.length > 0) {
          placeholderText.textContent = 'No tickets match your search or filter.';
        } else {
          placeholderText.textContent = 'No tickets issued for this event yet.';
        }
      }
      return;
    } else {
      placeholder.style.display = 'none';
    }

    // Sort by created descending
    tickets.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    const session = getCurrentSession();
    const isAdmin = session && session.role === 'admin';

    tickets.forEach(t => {
      const tr = document.createElement('tr');
      
      let statusClass = 'pending';
      let statusLabel = 'Pending';
      if (t.status === 'partial') {
        statusClass = 'partial';
        statusLabel = 'Partial';
      } else if (t.status === 'completed') {
        statusClass = 'completed';
        statusLabel = 'Checked In';
      } else if (t.status === 'invalidated') {
        statusClass = 'invalidated';
        statusLabel = 'Invalidated';
      }

      let actionButtons = `
        <button class="btn btn-sm btn-secondary btn-copy-link" data-id="${t.ticketId}" title="Copy Link to Clipboard">🔗 Link</button>
        <button class="btn btn-sm btn-secondary btn-open-pass" data-id="${t.ticketId}">🎫 Pass</button>
        <button class="btn btn-sm btn-accent btn-simulate-scan" data-id="${t.ticketId}" title="Quickly simulate scanning this ticket" ${t.status === 'invalidated' ? 'disabled style="opacity: 0.5; pointer-events: none;"' : ''}>📸 Scan</button>
      `;

      if (isAdmin) {
        actionButtons += `
          <button class="btn btn-sm btn-warning btn-reset-checkin" data-id="${t.ticketId}" title="Reset check-in status to Unused">🔄 Reset</button>
          <button class="btn btn-sm btn-secondary btn-invalidate-ticket" data-id="${t.ticketId}" title="Revoke this ticket and deny access" style="border-color: var(--color-danger); color: var(--color-danger); background: rgba(239, 68, 68, 0.05);" ${t.status === 'invalidated' ? 'disabled style="opacity: 0.5; pointer-events: none;"' : ''}>🚫 Invalidate</button>
        `;
      }

      tr.innerHTML = `
        <td>
          <div style="font-weight: 600;">${t.holderName}</div>
          <div style="font-size: 0.75rem; color: var(--text-muted);">${t.holderContact}</div>
        </td>
        <td><span class="table-ticket-id">${t.ticketId}</span></td>
        <td>
          <strong style="color: var(--color-accent);">${t.checkedInCount}</strong> 
          <span style="color: var(--text-muted);">/ ${t.totalGuests}</span>
        </td>
        <td><span class="status-badge-inline ${statusClass}">${statusLabel}</span></td>
        <td>
          <div class="table-action-cell">
            ${actionButtons}
          </div>
        </td>
      `;

      tableBody.appendChild(tr);
    });

    // Bind Button Event Listeners inside ledger table
    tableBody.querySelectorAll('.btn-copy-link').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.getAttribute('data-id');
        const url = `${window.location.origin}${window.location.pathname}?ticket=${id}`;
        
        navigator.clipboard.writeText(url).then(() => {
          showToast('Ticket URL copied to clipboard!', 'success');
        }).catch(err => {
          console.error('Could not copy', err);
          showToast('Failed to copy. URL: ' + url, 'error');
        });
      });
    });

    tableBody.querySelectorAll('.btn-open-pass').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.getAttribute('data-id');
        window.open(`${window.location.origin}${window.location.pathname}?ticket=${id}`, '_blank');
      });
    });

    tableBody.querySelectorAll('.btn-simulate-scan').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const id = e.currentTarget.getAttribute('data-id');
        await switchView('scanner');
        document.getElementById('manual-ticket-id-input').value = id;
        showToast('Ticket ID loaded in scanner manually. Hit "Admit" to check-in.', 'success');
      });
    });

    if (isAdmin) {
      tableBody.querySelectorAll('.btn-reset-checkin').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          const id = e.currentTarget.getAttribute('data-id');
          const res = await resetTicketCheckIn(id);
          if (res.success) {
            showToast(res.message, 'success');
            await refreshDashboard();
          } else {
            showToast(res.message, 'error');
          }
        });
      });

      tableBody.querySelectorAll('.btn-invalidate-ticket').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          const id = e.currentTarget.getAttribute('data-id');
          if (confirm('Are you sure you want to invalidate this ticket? This will deny venue entrance for this holder.')) {
            const res = await invalidateTicket(id);
            if (res.success) {
              showToast(res.message, 'success');
              await refreshDashboard();
            } else {
              showToast(res.message, 'error');
            }
          }
        });
      });
    }
  }

  // 5B. EVENTS VIEW DIRECTORY RENDER
  async function renderEventsList() {
    const tableBody = document.getElementById('events-directory-table-body');
    if (!tableBody) return;

    const events = await getEvents();
    tableBody.innerHTML = '';

    if (events.length === 0) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="5" class="text-center" style="padding: 2rem; color: var(--text-muted);">
            No events registered. Create an event in the sidebar to get started.
          </td>
        </tr>
      `;
      return;
    }

    events.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    events.forEach(e => {
      const isActive = e.eventId === currentActiveEventId;
      const tr = document.createElement('tr');
      if (isActive) {
        tr.className = 'event-row-active';
      }

      // Try-catch safe date parsing
      let dateStr = '--';
      if (e.dateTime) {
        try {
          const d = new Date(e.dateTime);
          if (!isNaN(d.getTime())) {
            dateStr = d.toLocaleString(undefined, {
              month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
            });
          }
        } catch (err) {
          console.warn('Invalid date format:', e.dateTime);
        }
      }

      const statusBadge = isActive 
        ? `<span class="status-badge-inline active-event-badge">Active</span>`
        : `<span class="status-badge-inline pending" style="opacity: 0.5;">Inactive</span>`;

      const actionBtn = isActive
        ? `<button class="btn btn-sm btn-secondary" disabled style="opacity: 0.5; pointer-events: none;">✓ Active</button>`
        : `<button class="btn btn-sm btn-accent btn-activate-event" data-id="${e.eventId}">Activate</button>`;

      const mapsLink = e.mapsUrl 
        ? `<a href="${e.mapsUrl}" target="_blank" style="font-size: 0.75rem; color: var(--color-accent); display: block; margin-top: 0.25rem;">📍 View Map</a>`
        : '';

      tr.innerHTML = `
        <td>
          <div style="font-weight: 600; color: var(--text-main);">${e.title}</div>
          <div style="font-size: 0.75rem; color: var(--text-muted);">${e.venue}</div>
          ${mapsLink}
        </td>
        <td><span style="font-size: 0.85rem; font-weight: 500;">${dateStr}</span></td>
        <td>
          <strong style="color: var(--color-primary);">${e.maxCapacity}</strong> 
          <span style="color: var(--text-muted);">spots</span>
        </td>
        <td>${statusBadge}</td>
        <td>${actionBtn}</td>
      `;

      tableBody.appendChild(tr);
    });

    // Bind activate button clicks
    tableBody.querySelectorAll('.btn-activate-event').forEach(btn => {
      btn.addEventListener('click', async (evt) => {
        const id = evt.currentTarget.getAttribute('data-id');
        currentActiveEventId = id;
        
        // Sync active selector dropdown in dashboard
        const selector = document.getElementById('event-selector');
        if (selector) {
          selector.value = id;
        }

        showToast('Active event switched successfully.', 'success');
        await renderEventsList();
      });
    });
  }

  // 6. CUSTOMER TICKET PASS VIEW RENDER
  async function renderTicketPass(id) {
    const t = await getTicket(id);

    if (!t) {
      document.getElementById('ticket-event-title').textContent = 'Ticket Invalid';
      document.getElementById('ticket-event-venue').textContent = 'This ticket does not exist or has been removed.';
      document.getElementById('ticket-holder-name-val').textContent = 'N/A';
      document.getElementById('ticket-guests-val').textContent = 'N/A';
      document.getElementById('ticket-checkin-fraction').textContent = '0 / 0 Entered';
      document.getElementById('ticket-badge-status').className = 'ticket-status-tag status-pending';
      document.getElementById('ticket-badge-status').textContent = 'Invalid';
      document.getElementById('ticket-qr-canvas').style.opacity = '0.1';
      return;
    }

    const event = await getEvent(t.eventId);

    // Populate attendee card UI
    document.getElementById('ticket-event-title').textContent = event ? event.title : 'Event details missing';
    
    const venueText = document.getElementById('ticket-event-venue');
    if (venueText && event) venueText.textContent = event.venue;

    const venueLink = document.getElementById('ticket-event-venue-link');
    if (venueLink && event) {
      venueLink.href = event.mapsUrl || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(event.venue)}`;
    }
    
    if (event) {
      const d = new Date(event.dateTime);
      document.getElementById('ticket-event-datetime').textContent = d.toLocaleString(undefined, {
        weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
      });
    }

    document.getElementById('ticket-holder-name-val').textContent = t.holderName;
    document.getElementById('ticket-guests-val').textContent = t.totalGuests === 1 ? 'Single Admission' : `Group Pass (${t.totalGuests} Guests)`;

    // Checkin fractional label & bar progress
    document.getElementById('ticket-checkin-fraction').textContent = `${t.checkedInCount} of ${t.totalGuests} Admitted`;
    
    const fillPercent = Math.min(100, Math.round((t.checkedInCount / t.totalGuests) * 100));
    document.getElementById('ticket-tracker-fill').style.width = `${fillPercent}%`;

    // Status Badge classes
    const badge = document.getElementById('ticket-badge-status');
    const qrCanvas = document.getElementById('ticket-qr-canvas');
    if (t.status === 'invalidated') {
      badge.className = 'ticket-status-tag status-invalidated';
      badge.textContent = 'Invalidated';
      if (qrCanvas) qrCanvas.style.opacity = '0.15';
    } else if (t.status === 'completed') {
      badge.className = 'ticket-status-tag status-completed';
      badge.textContent = 'All Checked In';
      if (qrCanvas) qrCanvas.style.opacity = '1';
    } else if (t.status === 'partial') {
      badge.className = 'ticket-status-tag status-partial';
      badge.textContent = `${t.checkedInCount}/${t.totalGuests} Entered`;
      if (qrCanvas) qrCanvas.style.opacity = '1';
    } else {
      badge.className = 'ticket-status-tag status-pending';
      badge.textContent = 'Unused';
      if (qrCanvas) qrCanvas.style.opacity = '1';
    }

    // Generate high-resolution canvas QR code containing ticket ID
    QRCode.toCanvas(qrCanvas, t.ticketId, {
      width: 200,
      margin: 1,
      color: {
        dark: '#0f172a',  // Charcoal
        light: '#ffffff'  // Pure White background for camera scanner contrast
      }
    }, (error) => {
      if (error) console.error('QR Code render failed', error);
    });
  }

  // 7. STAFF SCANNER WORKFLOWS
  const manualScanInput = document.getElementById('manual-ticket-id-input');
  const btnManualScan = document.getElementById('btn-manual-scan');
  const validationModal = document.getElementById('scan-validation-modal');
  
  // Counter elements in Scanner modal
  const admitGuestsInput = document.getElementById('admit-guests-input');
  let currentScannedTicket = null;

  btnManualScan.addEventListener('click', async () => {
    const val = manualScanInput.value.trim();
    if (val) {
      await openValidationModal(val);
      manualScanInput.value = '';
    } else {
      showToast('Please type or paste a valid Ticket ID.', 'error');
    }
  });

  // Modal Counter decrement/increment
  document.getElementById('btn-admit-dec').addEventListener('click', () => {
    let val = parseInt(admitGuestsInput.value, 10) || 1;
    if (val > 1) admitGuestsInput.value = val - 1;
  });

  document.getElementById('btn-admit-inc').addEventListener('click', () => {
    let val = parseInt(admitGuestsInput.value, 10) || 1;
    if (currentScannedTicket) {
      const remaining = currentScannedTicket.totalGuests - currentScannedTicket.checkedInCount;
      if (val < remaining) admitGuestsInput.value = val + 1;
    }
  });

  // Confirm Entry Gate scan
  document.getElementById('btn-confirm-admission').addEventListener('click', async () => {
    if (!currentScannedTicket) return;

    const count = parseInt(admitGuestsInput.value, 10) || 1;
    const session = getCurrentSession();
    const staffId = session ? session.username : 'Staff-Scanner';
    const res = await checkInTicket(currentScannedTicket.ticketId, count, staffId);

    if (res.success) {
      // Play a visual transition success state
      document.getElementById('modal-admission-form-wrapper').classList.add('hidden');
      document.getElementById('modal-success-screen').classList.remove('hidden');
      
      const statusTitle = document.getElementById('modal-status-title');
      const statusHeader = document.getElementById('modal-header-status');
      
      statusHeader.className = 'modal-status-header success';
      statusTitle.textContent = 'Access Admitted';
      
      document.getElementById('modal-success-msg').textContent = `Successfully checked-in ${count} guest(s)!`;
      showToast(res.message, 'success');
      
      // Update our temporary local object
      currentScannedTicket = res.ticket;
    } else {
      showToast(res.message, 'error');
    }
  });

  // Cancel Admission
  document.getElementById('btn-cancel-admission').addEventListener('click', hideValidationModal);
  
  // Close success scan next
  document.getElementById('btn-close-success').addEventListener('click', hideValidationModal);

  async function openValidationModal(id) {
    // Normalize if scanned URL
    let ticketId = id;
    try {
      if (id.startsWith('http://') || id.startsWith('https://')) {
        const scanUrl = new URL(id);
        const param = scanUrl.searchParams.get('ticket');
        if (param) ticketId = param;
      }
    } catch(err) {
      console.warn('Scanned data was not a valid URL, treating as raw ID');
    }

    const t = await getTicket(ticketId);
    validationModal.classList.add('show');
    
    // Clear screens
    document.getElementById('modal-admission-form-wrapper').classList.remove('hidden');
    document.getElementById('modal-success-screen').classList.add('hidden');

    const statusHeader = document.getElementById('modal-header-status');
    const statusIcon = document.getElementById('modal-status-icon');
    const statusTitle = document.getElementById('modal-status-title');

    if (!t) {
      // Error: invalid ticket ID
      statusHeader.className = 'modal-status-header error';
      statusIcon.textContent = '✕';
      statusTitle.textContent = 'Invalid Ticket';
      
      document.getElementById('modal-holder-name').textContent = 'N/A';
      document.getElementById('modal-event-title').textContent = 'Unknown Event';
      document.getElementById('modal-checkin-ratio').textContent = '0 of 0';
      
      // Hide entry widgets
      document.getElementById('modal-admission-form-wrapper').classList.add('hidden');
      document.getElementById('modal-success-screen').classList.remove('hidden');
      document.getElementById('modal-success-msg').textContent = 'This ticket identifier was not found in the cloud registry database.';
      document.getElementById('btn-close-success').textContent = 'Scan Again';
      currentScannedTicket = null;
      return;
    }

    // Check if invalidated
    if (t.status === 'invalidated') {
      statusHeader.className = 'modal-status-header error';
      statusIcon.textContent = '✕';
      statusTitle.textContent = 'Ticket Invalidated';
      
      const event = await getEvent(t.eventId);
      document.getElementById('modal-holder-name').textContent = t.holderName;
      document.getElementById('modal-event-title').textContent = event ? event.title : 'Unknown Event';
      document.getElementById('modal-checkin-ratio').textContent = `Revoked (0 of ${t.totalGuests})`;
      
      // Hide entry widgets
      document.getElementById('modal-admission-form-wrapper').classList.add('hidden');
      document.getElementById('modal-success-screen').classList.remove('hidden');
      document.getElementById('modal-success-msg').textContent = 'This ticket has been revoked by an administrator and venue access is denied.';
      document.getElementById('btn-close-success').textContent = 'Scan Next';
      currentScannedTicket = null;
      return;
    }

    // Set active ticket context
    currentScannedTicket = t;

    // Fill details
    const event = await getEvent(t.eventId);
    document.getElementById('modal-holder-name').textContent = t.holderName;
    document.getElementById('modal-event-title').textContent = event ? event.title : 'Unknown Event';
    document.getElementById('modal-checkin-ratio').textContent = `${t.checkedInCount} of ${t.totalGuests} Admitted`;

    const remaining = t.totalGuests - t.checkedInCount;
    document.getElementById('modal-remaining-text').textContent = `${remaining} spot(s) remaining on this ticket.`;

    if (remaining <= 0) {
      // Already fully checked in
      statusHeader.className = 'modal-status-header error';
      statusIcon.textContent = '✕';
      statusTitle.textContent = 'Ticket Fully Redeemed';
      
      document.getElementById('modal-admission-form-wrapper').classList.add('hidden');
      document.getElementById('modal-success-screen').classList.remove('hidden');
      document.getElementById('modal-success-msg').textContent = 'All guests permitted by this e-ticket have already entered the event venue.';
      document.getElementById('btn-close-success').textContent = 'Scan Next';
    } else {
      // Standard group entry flow
      statusHeader.className = 'modal-status-header success';
      statusIcon.textContent = '✓';
      statusTitle.textContent = 'Ticket Verified';
      
      // Initialize counter inputs
      admitGuestsInput.value = remaining; // Default to admitting all remaining guests
      admitGuestsInput.max = remaining;
      document.getElementById('btn-close-success').textContent = 'Scan Next';
    }
  }

  function hideValidationModal() {
    validationModal.classList.remove('show');
    currentScannedTicket = null;
    
    // Restart scanner
    if (viewScanner.classList.contains('active-view')) {
      resumeCameraScanner();
    }
  }

  // 8. CAMERA SCANNER ENGINE (Html5Qrcode)
  function startCameraScanner() {
    const readerElement = document.getElementById('qr-reader');
    if (!readerElement) return;

    // Reset UI
    readerElement.innerHTML = '';
    
    // Instantiate camera scanner
    qrScannerInstance = new Html5Qrcode('qr-reader');
    
    const config = { 
      fps: 15, 
      qrbox: (width, height) => {
        // Dynamic square viewport size
        const minSize = Math.min(width, height);
        const boxSize = Math.floor(minSize * 0.7);
        return { width: boxSize, height: boxSize };
      }
    };

    qrScannerInstance.start(
      { facingMode: 'environment' }, // Rear camera
      config,
      async (decodedText) => {
        // Successfully read QR
        // Stop/pause scanner instantly to prevent double-reads while modal loads
        pauseCameraScanner();
        
        // Haptic feedback (supported in some mobile browsers)
        if (navigator.vibrate) navigator.vibrate(100);

        // Open validation dialog
        await openValidationModal(decodedText);
      },
      (scanError) => {
        // Silently capture scan failures/searching frames
      }
    ).catch(err => {
      console.error('Webcam scan camera start failure:', err);
      // Insert friendly message if camera access denied or unavailable
      readerElement.innerHTML = `
        <div class="no-data-placeholder text-center" style="padding: 1rem;">
          <span class="placeholder-icon">📷</span>
          <p style="font-weight:600; margin-top:0.5rem;">Webcam not found or permission denied</p>
          <p style="font-size:0.75rem; color:var(--text-muted);">Please check browser permission settings or test using manual entry below.</p>
        </div>
      `;
    });
  }

  function pauseCameraScanner() {
    if (qrScannerInstance && qrScannerInstance.isScanning) {
      qrScannerInstance.pause();
    }
  }

  function resumeCameraScanner() {
    if (qrScannerInstance && qrScannerInstance.isScanning) {
      try {
        qrScannerInstance.resume();
      } catch (err) {
        console.warn('Resume scanner warning:', err);
      }
    }
  }

  function stopCameraScanner() {
    if (qrScannerInstance) {
      if (qrScannerInstance.isScanning) {
        qrScannerInstance.stop().then(() => {
          qrScannerInstance = null;
        }).catch(err => {
          console.error('Failed to stop camera scanner', err);
          qrScannerInstance = null;
        });
      } else {
        qrScannerInstance = null;
      }
    }
  }

  // 9. STAFF AND SECURITY ADMINISTRATIVE GATEWAYS
  async function initAdminConsole() {
    await renderStaffList();
    
    const createStaffForm = document.getElementById('create-staff-form');
    if (createStaffForm && !createStaffForm.dataset.listener) {
      createStaffForm.dataset.listener = 'true';
      createStaffForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const user = document.getElementById('staff-username-input').value;
        const pass = document.getElementById('staff-password-input').value;
        const res = await createStaffAccount(user, pass);
        if (res.success) {
          showToast(res.message, 'success');
          createStaffForm.reset();
          await renderStaffList();
        } else {
          showToast(res.message, 'error');
        }
      });
    }
  }

  async function renderStaffList() {
    const staffListEl = document.getElementById('staff-list');
    if (!staffListEl) return;
    const accounts = await getStaffAccounts();
    staffListEl.innerHTML = '';
    
    if (accounts.length === 0) {
      staffListEl.innerHTML = '<li class="no-staff-placeholder text-center text-xs text-muted" style="padding:10px 0;">No staff registered</li>';
      return;
    }
    
    accounts.forEach(acc => {
      const li = document.createElement('li');
      li.className = 'staff-list-item';
      li.innerHTML = `
        <span class="staff-username">👤 ${acc.username}</span>
        <span class="staff-pw-hint">PW: <code>${acc.password}</code></span>
      `;
      staffListEl.appendChild(li);
    });
  }

  function initStaffConsole() {
    console.log("Gate scanner initialized for logged-in security staff.");
  }

});
