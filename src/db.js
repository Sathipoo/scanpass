// Database and Offline Synchronization Layer for ScanPass

const DB_KEYS = {
  EVENTS: 'scanpass_events',
  TICKETS: 'scanpass_tickets',
  SCANS: 'scanpass_scans',
  OFFLINE_QUEUE: 'scanpass_offline_queue',
  ONLINE_STATUS: 'scanpass_online_status',
  CURRENT_VENDOR: 'scanpass_current_vendor',
  STAFF: 'scanpass_staff',
  SESSION: 'scanpass_session'
};

// Initialize database with mock data if empty
export function initDb() {
  if (!localStorage.getItem(DB_KEYS.EVENTS)) {
    const mockEvents = [
      {
        eventId: 'EVT-001',
        vendorId: 'VND-101',
        title: 'Sunset Beats Music Festival',
        dateTime: '2026-06-15T18:00',
        venue: 'Wavefront Beach Stage',
        mapsUrl: 'https://maps.google.com/?q=Wavefront+Beach+Stage',
        maxCapacity: 200,
        createdAt: new Date().toISOString()
      },
      {
        eventId: 'EVT-002',
        vendorId: 'VND-101',
        title: 'Design & Code Meetup v4.0',
        dateTime: '2026-07-02T19:30',
        venue: 'Antigravity Innovation Lab',
        mapsUrl: 'https://maps.google.com/?q=Antigravity+Innovation+Lab',
        maxCapacity: 50,
        createdAt: new Date().toISOString()
      }
    ];
    localStorage.setItem(DB_KEYS.EVENTS, JSON.stringify(mockEvents));
  }

  if (!localStorage.getItem(DB_KEYS.TICKETS)) {
    const mockTickets = [
      {
        ticketId: 'TCK-sunset-single',
        eventId: 'EVT-001',
        holderName: 'Alex Rivers',
        holderContact: '+1 555-0199',
        totalGuests: 1,
        checkedInCount: 0,
        status: 'pending',
        createdAt: new Date().toISOString()
      },
      {
        ticketId: 'TCK-sunset-group',
        eventId: 'EVT-001',
        holderName: 'Sarah & Friends',
        holderContact: '+1 555-0144',
        totalGuests: 4,
        checkedInCount: 1, // 1 already checked-in previously
        status: 'partial',
        createdAt: new Date().toISOString()
      },
      {
        ticketId: 'TCK-meetup-group',
        eventId: 'EVT-002',
        holderName: 'Google Dev Team',
        holderContact: '+1 555-0188',
        totalGuests: 5,
        checkedInCount: 0,
        status: 'pending',
        createdAt: new Date().toISOString()
      }
    ];
    localStorage.setItem(DB_KEYS.TICKETS, JSON.stringify(mockTickets));
  }

  if (!localStorage.getItem(DB_KEYS.SCANS)) {
    const mockScans = [
      {
        scanId: 'SCN-1',
        ticketId: 'TCK-sunset-group',
        eventId: 'EVT-001',
        admitted: 1,
        timestamp: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
        scannedBy: 'Staff-Alpha',
        isOffline: false
      }
    ];
    localStorage.setItem(DB_KEYS.SCANS, JSON.stringify(mockScans));
  }

  if (!localStorage.getItem(DB_KEYS.OFFLINE_QUEUE)) {
    localStorage.setItem(DB_KEYS.OFFLINE_QUEUE, JSON.stringify([]));
  }

  if (localStorage.getItem(DB_KEYS.ONLINE_STATUS) === null) {
    localStorage.setItem(DB_KEYS.ONLINE_STATUS, 'true'); // Default to online
  }

  if (!localStorage.getItem(DB_KEYS.CURRENT_VENDOR)) {
    const defaultVendor = {
      vendorId: 'VND-101',
      name: 'Vivid Events Corp',
      email: 'hello@vividevents.com'
    };
    localStorage.setItem(DB_KEYS.CURRENT_VENDOR, JSON.stringify(defaultVendor));
  }

  if (!localStorage.getItem(DB_KEYS.STAFF)) {
    const defaultStaff = [
      { username: 'staff1', password: 'staff123', createdAt: new Date().toISOString() }
    ];
    localStorage.setItem(DB_KEYS.STAFF, JSON.stringify(defaultStaff));
  }
}

// Helper to retrieve parsed items from localStorage
function getItems(key) {
  const data = localStorage.getItem(key);
  return data ? JSON.parse(data) : [];
}

// Helper to save items to localStorage
function setItems(key, items) {
  localStorage.setItem(key, JSON.stringify(items));
}

// Network Status Emulator
export function isOnline() {
  return localStorage.getItem(DB_KEYS.ONLINE_STATUS) === 'true';
}

export function setOnlineStatus(status) {
  localStorage.setItem(DB_KEYS.ONLINE_STATUS, status ? 'true' : 'false');
  // Dispatch a custom event to notify components about connectivity changes
  window.dispatchEvent(new CustomEvent('scanpass-network-changed', { detail: { online: status } }));
}

// Vendor Management
export function getCurrentVendor() {
  return JSON.parse(localStorage.getItem(DB_KEYS.CURRENT_VENDOR));
}

export function saveCurrentVendor(vendor) {
  localStorage.setItem(DB_KEYS.CURRENT_VENDOR, JSON.stringify(vendor));
}

// Event Management
export function getEvents() {
  return getItems(DB_KEYS.EVENTS);
}

export function createEvent(title, venue, dateTime, maxCapacity, mapsUrl) {
  const events = getEvents();
  const vendor = getCurrentVendor();
  const newEvent = {
    eventId: `EVT-${Math.floor(100000 + Math.random() * 900000)}`,
    vendorId: vendor ? vendor.vendorId : 'VND-TEMP',
    title,
    venue,
    dateTime,
    maxCapacity: parseInt(maxCapacity, 10) || 100,
    mapsUrl: mapsUrl || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(venue)}`,
    createdAt: new Date().toISOString()
  };
  events.push(newEvent);
  setItems(DB_KEYS.EVENTS, events);
  return newEvent;
}

export function getEvent(eventId) {
  return getEvents().find(e => e.eventId === eventId);
}

export function updateEventLocation(eventId, venue, mapsUrl) {
  const events = getEvents();
  const idx = events.findIndex(e => e.eventId === eventId);
  if (idx === -1) return { success: false, message: 'Event not found.' };

  events[idx].venue = venue;
  events[idx].mapsUrl = mapsUrl || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(venue)}`;
  setItems(DB_KEYS.EVENTS, events);
  return { success: true, message: 'Event location details updated.', event: events[idx] };
}

// Ticket Management
export function getTickets() {
  return getItems(DB_KEYS.TICKETS);
}

export function getTicket(ticketId) {
  return getTickets().find(t => t.ticketId === ticketId);
}

export function createTicket(eventId, holderName, holderContact, totalGuests) {
  const tickets = getTickets();
  const newTicket = {
    ticketId: `TCK-${Math.random().toString(36).substring(2, 10)}`,
    eventId,
    holderName,
    holderContact,
    totalGuests: parseInt(totalGuests, 10) || 1,
    checkedInCount: 0,
    status: 'pending',
    createdAt: new Date().toISOString()
  };
  tickets.push(newTicket);
  setItems(DB_KEYS.TICKETS, tickets);
  return newTicket;
}

export function getEventTickets(eventId) {
  return getTickets().filter(t => t.eventId === eventId);
}

export function getEventStats(eventId) {
  const event = getEvent(eventId);
  if (!event) return { checkedIn: 0, capacity: 0, percentage: 0 };
  
  const tickets = getEventTickets(eventId);
  const checkedIn = tickets.reduce((sum, t) => sum + (t.checkedInCount || 0), 0);
  
  return {
    checkedIn,
    capacity: event.maxCapacity,
    percentage: Math.min(100, Math.round((checkedIn / event.maxCapacity) * 100))
  };
}

// Check-in and Offline Queue Processing
export function checkInTicket(ticketId, admitCount, staffId = 'Staff-Scanner') {
  admitCount = parseInt(admitCount, 10) || 1;
  const online = isOnline();

  if (!online) {
    // Queued check-in
    return queueOfflineScan(ticketId, admitCount, staffId);
  }

  // Live Online Check-in
  const tickets = getTickets();
  const idx = tickets.findIndex(t => t.ticketId === ticketId);
  
  if (idx === -1) {
    return { success: false, message: 'Ticket not found.' };
  }

  const ticket = tickets[idx];

  if (ticket.status === 'invalidated') {
    return { success: false, message: 'This ticket has been invalidated and cannot be checked in.' };
  }

  const remaining = ticket.totalGuests - ticket.checkedInCount;

  if (admitCount > remaining) {
    return { 
      success: false, 
      message: `Invalid entries. Only ${remaining} out of ${ticket.totalGuests} remaining.` 
    };
  }

  // Update ticket entry
  ticket.checkedInCount += admitCount;
  ticket.status = ticket.checkedInCount === ticket.totalGuests ? 'completed' : 'partial';
  tickets[idx] = ticket;
  setItems(DB_KEYS.TICKETS, tickets);

  // Save scan details
  const scans = getItems(DB_KEYS.SCANS);
  const newScan = {
    scanId: `SCN-${Math.random().toString(36).substring(2, 10)}`,
    ticketId,
    eventId: ticket.eventId,
    admitted: admitCount,
    timestamp: new Date().toISOString(),
    scannedBy: staffId,
    isOffline: false
  };
  scans.push(newScan);
  setItems(DB_KEYS.SCANS, scans);

  return { 
    success: true, 
    message: `Admitted ${admitCount} guest(s) successfully.`,
    ticket
  };
}

// Store scan locally in queue if offline
function queueOfflineScan(ticketId, admitCount, staffId) {
  const queue = getItems(DB_KEYS.OFFLINE_QUEUE);
  
  // Find local state first to ensure validation is as accurate as possible offline
  const tickets = getTickets();
  const ticket = tickets.find(t => t.ticketId === ticketId);
  
  if (!ticket) {
    return { success: false, message: 'Ticket not found locally.' };
  }

  if (ticket.status === 'invalidated') {
    return { success: false, message: 'Offline Scan Denied: This ticket is invalidated.' };
  }

  // Calculate pending scans in current queue for this ticket
  const queuedAdmitted = queue
    .filter(q => q.ticketId === ticketId)
    .reduce((sum, q) => sum + q.admitted, 0);

  const remaining = ticket.totalGuests - (ticket.checkedInCount + queuedAdmitted);

  if (admitCount > remaining) {
    return {
      success: false,
      message: `Offline Scan Denied: Only ${remaining} remaining (including pending offline queue entries).`
    };
  }

  // Store in queue
  const offlineItem = {
    queueId: `QUE-${Math.random().toString(36).substring(2, 10)}`,
    ticketId,
    admitted: admitCount,
    timestamp: new Date().toISOString(),
    scannedBy: staffId
  };
  
  queue.push(offlineItem);
  setItems(DB_KEYS.OFFLINE_QUEUE, queue);

  // Update in local database instantly so the scanner dashboard reflects offline scans immediately
  const idx = tickets.findIndex(t => t.ticketId === ticketId);
  tickets[idx].checkedInCount += admitCount;
  tickets[idx].status = tickets[idx].checkedInCount === tickets[idx].totalGuests ? 'completed' : 'partial';
  setItems(DB_KEYS.TICKETS, tickets);

  // Store local scan log marked as offline
  const scans = getItems(DB_KEYS.SCANS);
  scans.push({
    scanId: `SCN-OFF-${offlineItem.queueId}`,
    ticketId,
    eventId: ticket.eventId,
    admitted: admitCount,
    timestamp: offlineItem.timestamp,
    scannedBy: staffId,
    isOffline: true
  });
  setItems(DB_KEYS.SCANS, scans);

  return {
    success: true,
    message: `Recorded offline: Checked-in ${admitCount} guest(s). Scans will sync once online.`,
    isOffline: true,
    ticket: tickets[idx]
  };
}

export function getOfflineQueue() {
  return getItems(DB_KEYS.OFFLINE_QUEUE);
}

// Synchronize queued scans once database connectivity is restored
export function syncOfflineQueue() {
  const queue = getItems(DB_KEYS.OFFLINE_QUEUE);
  if (queue.length === 0) {
    return { success: true, processed: 0, message: 'No offline scans to sync.' };
  }

  const results = {
    success: [],
    failed: []
  };

  // We loop through each queue element, verify them online
  // In a real database client, this would perform a batch commit or transaction updates
  const tickets = getTickets();
  const scans = getItems(DB_KEYS.SCANS);

  // Clean local offline markings and make them online
  const updatedScans = scans.map(s => {
    if (s.isOffline) {
      return { ...s, isOffline: false };
    }
    return s;
  });
  setItems(DB_KEYS.SCANS, updatedScans);

  // Clear queue
  setItems(DB_KEYS.OFFLINE_QUEUE, []);

  // Return success info
  return {
    success: true,
    processed: queue.length,
    message: `Successfully synchronized ${queue.length} scan(s) with the cloud server.`
  };
}

// Clear simulated database
export function clearDb() {
  localStorage.removeItem(DB_KEYS.EVENTS);
  localStorage.removeItem(DB_KEYS.TICKETS);
  localStorage.removeItem(DB_KEYS.SCANS);
  localStorage.removeItem(DB_KEYS.OFFLINE_QUEUE);
  localStorage.removeItem(DB_KEYS.ONLINE_STATUS);
  localStorage.removeItem(DB_KEYS.CURRENT_VENDOR);
  localStorage.removeItem(DB_KEYS.STAFF);
  localStorage.removeItem(DB_KEYS.SESSION);
  initDb();
}

// =========================================================================
// AUTHENTICATION AND SECURITY STAFF LAYERS
// =========================================================================

export function getStaffAccounts() {
  return getItems(DB_KEYS.STAFF);
}

export function createStaffAccount(username, password) {
  const staff = getStaffAccounts();
  const lowerUser = username.toLowerCase().trim();

  if (lowerUser === 'admin') {
    return { success: false, message: 'Cannot use reserved username "admin".' };
  }

  if (staff.some(s => s.username.toLowerCase() === lowerUser)) {
    return { success: false, message: 'Username already exists.' };
  }

  const newStaff = {
    username: username.trim(),
    password, // Stored as plain text for simulation simplicity
    createdAt: new Date().toISOString()
  };

  staff.push(newStaff);
  setItems(DB_KEYS.STAFF, staff);
  return { success: true, message: `Staff account "${username}" created.`, staff: newStaff };
}

export function authenticateUser(username, password) {
  const user = username.toLowerCase().trim();

  // 1. Admin login verification
  if (user === 'admin' && password === 'admin123') {
    const session = { username: 'Admin', role: 'admin', loginTime: new Date().toISOString() };
    localStorage.setItem(DB_KEYS.SESSION, JSON.stringify(session));
    return { success: true, role: 'admin', session };
  }

  // 2. Security staff login verification
  const staff = getStaffAccounts();
  const matched = staff.find(s => s.username.toLowerCase() === user && s.password === password);

  if (matched) {
    const session = { username: matched.username, role: 'staff', loginTime: new Date().toISOString() };
    localStorage.setItem(DB_KEYS.SESSION, JSON.stringify(session));
    return { success: true, role: 'staff', session };
  }

  return { success: false, message: 'Invalid username or password.' };
}

export function getCurrentSession() {
  const session = localStorage.getItem(DB_KEYS.SESSION);
  return session ? JSON.parse(session) : null;
}

export function logoutSession() {
  localStorage.removeItem(DB_KEYS.SESSION);
}

export function resetTicketCheckIn(ticketId) {
  const tickets = getTickets();
  const idx = tickets.findIndex(t => t.ticketId === ticketId);
  if (idx === -1) return { success: false, message: 'Ticket not found.' };

  tickets[idx].checkedInCount = 0;
  tickets[idx].status = 'pending';
  setItems(DB_KEYS.TICKETS, tickets);

  // Remove scan logs for this ticket
  const scans = getItems(DB_KEYS.SCANS);
  const remainingScans = scans.filter(s => s.ticketId !== ticketId);
  setItems(DB_KEYS.SCANS, remainingScans);

  return { success: true, message: 'Ticket check-in entries reset successfully.' };
}

export function invalidateTicket(ticketId) {
  const tickets = getTickets();
  const idx = tickets.findIndex(t => t.ticketId === ticketId);
  if (idx === -1) return { success: false, message: 'Ticket not found.' };

  tickets[idx].status = 'invalidated';
  tickets[idx].checkedInCount = 0;
  setItems(DB_KEYS.TICKETS, tickets);

  // Remove scan logs for this ticket
  const scans = getItems(DB_KEYS.SCANS);
  const remainingScans = scans.filter(s => s.ticketId !== ticketId);
  setItems(DB_KEYS.SCANS, remainingScans);

  return { success: true, message: 'Ticket invalidated successfully.' };
}
