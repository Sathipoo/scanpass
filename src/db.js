// Google Firebase Firestore Real-Time Database and Offline Persistence Layer for ScanPass
import { initializeApp } from "firebase/app";
import { 
  initializeFirestore, 
  persistentLocalCache, 
  persistentMultipleTabManager,
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  getDocs, 
  updateDoc, 
  deleteDoc, 
  query, 
  where, 
  orderBy,
  enableNetwork,
  disableNetwork
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBilx30C4SynYm2Dt3uJFxUVeN5f-oUzJQ",
  authDomain: "pika-scanpass.firebaseapp.com",
  projectId: "pika-scanpass",
  storageBucket: "pika-scanpass.firebasestorage.app",
  messagingSenderId: "848460415527",
  appId: "1:848460415527:web:c7d83c80f1b22d45768402",
  measurementId: "G-XJLRSSFMTW"
};

// Initialize Firebase App
const app = initializeApp(firebaseConfig);

// Initialize Firestore with persistent offline local cache
const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager()
  })
});

const DB_KEYS = {
  ONLINE_STATUS: 'scanpass_online_status',
  CURRENT_VENDOR: 'scanpass_current_vendor',
  SESSION: 'scanpass_session'
};

// Initialize database with mock data if collections are empty
export async function initDb() {
  try {
    // 1. Seed events collection
    const eventsSnap = await getDocs(collection(db, 'events'));
    if (eventsSnap.empty) {
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
      for (const e of mockEvents) {
        await setDoc(doc(db, 'events', e.eventId), e);
      }
    }

    // 2. Seed tickets collection
    const ticketsSnap = await getDocs(collection(db, 'tickets'));
    if (ticketsSnap.empty) {
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
          checkedInCount: 1,
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
      for (const t of mockTickets) {
        await setDoc(doc(db, 'tickets', t.ticketId), t);
      }
    }

    // 3. Seed scans collection
    const scansSnap = await getDocs(collection(db, 'scans'));
    if (scansSnap.empty) {
      const mockScans = [
        {
          scanId: 'SCN-1',
          ticketId: 'TCK-sunset-group',
          eventId: 'EVT-001',
          admitted: 1,
          timestamp: new Date(Date.now() - 3600000).toISOString(),
          scannedBy: 'Staff-Alpha'
        }
      ];
      for (const s of mockScans) {
        await setDoc(doc(db, 'scans', s.scanId), s);
      }
    }

    // 4. Seed staff collection
    const staffSnap = await getDocs(collection(db, 'staff'));
    if (staffSnap.empty) {
      const defaultStaff = [
        { username: 'staff1', password: 'staff123', createdAt: new Date().toISOString() }
      ];
      for (const st of defaultStaff) {
        await setDoc(doc(db, 'staff', st.username.toLowerCase().trim()), st);
      }
    }

    // Setup local configuration keys
    if (localStorage.getItem(DB_KEYS.ONLINE_STATUS) === null) {
      localStorage.setItem(DB_KEYS.ONLINE_STATUS, 'true');
    }

    if (!localStorage.getItem(DB_KEYS.CURRENT_VENDOR)) {
      const defaultVendor = {
        vendorId: 'VND-101',
        name: 'Vivid Events Corp',
        email: 'hello@vividevents.com'
      };
      localStorage.setItem(DB_KEYS.CURRENT_VENDOR, JSON.stringify(defaultVendor));
    }
  } catch (error) {
    console.error("Failed to initialize database:", error);
  }
}

// Network Status Emulator (integrated with Firestore network controller)
export function isOnline() {
  return localStorage.getItem(DB_KEYS.ONLINE_STATUS) === 'true';
}

export async function setOnlineStatus(status) {
  localStorage.setItem(DB_KEYS.ONLINE_STATUS, status ? 'true' : 'false');
  try {
    if (status) {
      await enableNetwork(db);
    } else {
      await disableNetwork(db);
    }
  } catch (err) {
    console.warn("Firestore network status toggle error:", err);
  }
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
export async function getEvents() {
  try {
    const q = query(collection(db, 'events'), orderBy('createdAt', 'desc'));
    const snap = await getDocs(q);
    return snap.docs.map(doc => doc.data());
  } catch (err) {
    console.error("Failed to fetch events from Firestore:", err);
    return [];
  }
}

export async function createEvent(title, venue, dateTime, maxCapacity, mapsUrl) {
  const vendor = getCurrentVendor();
  const eventId = `EVT-${Math.floor(100000 + Math.random() * 900000)}`;
  const newEvent = {
    eventId,
    vendorId: vendor ? vendor.vendorId : 'VND-TEMP',
    title,
    venue,
    dateTime,
    maxCapacity: parseInt(maxCapacity, 10) || 100,
    mapsUrl: mapsUrl || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(venue)}`,
    createdAt: new Date().toISOString()
  };
  await setDoc(doc(db, 'events', eventId), newEvent);
  return newEvent;
}

export async function getEvent(eventId) {
  if (!eventId) return null;
  try {
    const snap = await getDoc(doc(db, 'events', eventId));
    return snap.exists() ? snap.data() : null;
  } catch (err) {
    console.error("Failed to fetch event:", err);
    return null;
  }
}

export async function updateEventLocation(eventId, venue, mapsUrl) {
  const eventDocRef = doc(db, 'events', eventId);
  const updates = {
    venue,
    mapsUrl: mapsUrl || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(venue)}`
  };
  await updateDoc(eventDocRef, updates);
  const snap = await getDoc(eventDocRef);
  return { success: true, message: 'Event location details updated.', event: snap.data() };
}

// Ticket Management
export async function getTickets() {
  try {
    const snap = await getDocs(collection(db, 'tickets'));
    return snap.docs.map(doc => doc.data());
  } catch (err) {
    console.error("Failed to fetch tickets:", err);
    return [];
  }
}

export async function getTicket(ticketId) {
  if (!ticketId) return null;
  try {
    const snap = await getDoc(doc(db, 'tickets', ticketId));
    return snap.exists() ? snap.data() : null;
  } catch (err) {
    console.error("Failed to fetch ticket:", err);
    return null;
  }
}

export async function createTicket(eventId, holderName, holderContact, totalGuests) {
  const ticketId = `TCK-${Math.random().toString(36).substring(2, 10)}`;
  const newTicket = {
    ticketId,
    eventId,
    holderName,
    holderContact,
    totalGuests: parseInt(totalGuests, 10) || 1,
    checkedInCount: 0,
    status: 'pending',
    createdAt: new Date().toISOString()
  };
  await setDoc(doc(db, 'tickets', ticketId), newTicket);
  return newTicket;
}

export async function getEventTickets(eventId) {
  if (!eventId) return [];
  try {
    const q = query(collection(db, 'tickets'), where('eventId', '==', eventId));
    const snap = await getDocs(q);
    return snap.docs.map(doc => doc.data());
  } catch (err) {
    console.error("Failed to fetch event tickets:", err);
    return [];
  }
}

export async function getEventStats(eventId) {
  const event = await getEvent(eventId);
  if (!event) return { checkedIn: 0, capacity: 0, percentage: 0 };
  
  const tickets = await getEventTickets(eventId);
  const checkedIn = tickets.reduce((sum, t) => sum + (t.checkedInCount || 0), 0);
  
  return {
    checkedIn,
    capacity: event.maxCapacity,
    percentage: Math.min(100, Math.round((checkedIn / event.maxCapacity) * 100))
  };
}

// Check-in and Offline Queue Processing (automatically handled by Firestore offline cache)
export async function checkInTicket(ticketId, admitCount, staffId = 'Staff-Scanner') {
  admitCount = parseInt(admitCount, 10) || 1;
  const ticketDocRef = doc(db, 'tickets', ticketId);
  const ticketSnap = await getDoc(ticketDocRef);
  
  if (!ticketSnap.exists()) {
    return { success: false, message: 'Ticket not found.' };
  }

  const ticket = ticketSnap.data();

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

  const newCheckedInCount = ticket.checkedInCount + admitCount;
  const newStatus = newCheckedInCount === ticket.totalGuests ? 'completed' : 'partial';

  // Update ticket document in Firestore
  await updateDoc(ticketDocRef, {
    checkedInCount: newCheckedInCount,
    status: newStatus
  });

  // Save scan document
  const scanId = `SCN-${Math.random().toString(36).substring(2, 10)}`;
  const newScan = {
    scanId,
    ticketId,
    eventId: ticket.eventId,
    admitted: admitCount,
    timestamp: new Date().toISOString(),
    scannedBy: staffId
  };
  await setDoc(doc(db, 'scans', scanId), newScan);

  ticket.checkedInCount = newCheckedInCount;
  ticket.status = newStatus;

  return { 
    success: true, 
    message: `Admitted ${admitCount} guest(s) successfully.`,
    ticket
  };
}

export function getOfflineQueue() {
  // Firestore handles offline caching and queuing natively
  return [];
}

export function syncOfflineQueue() {
  // Firestore handles synchronization automatically when network is re-established
  return {
    success: true,
    processed: 0,
    message: 'Firebase Firestore synchronizes offline scans automatically.'
  };
}

// Clear simulated database collections in Firestore
export async function clearDb() {
  try {
    const collections = ['events', 'tickets', 'scans', 'staff'];
    for (const c of collections) {
      const snap = await getDocs(collection(db, c));
      const deletePromises = snap.docs.map(d => deleteDoc(d.ref));
      await Promise.all(deletePromises);
    }
    await initDb();
  } catch (err) {
    console.error("Failed to clear cloud database:", err);
  }
}

// Authentication and Security Staff Accounts
export async function getStaffAccounts() {
  try {
    const snap = await getDocs(collection(db, 'staff'));
    return snap.docs.map(doc => doc.data());
  } catch (err) {
    console.error("Failed to fetch staff list:", err);
    return [];
  }
}

export async function createStaffAccount(username, password) {
  const lowerUser = username.toLowerCase().trim();

  if (lowerUser === 'admin') {
    return { success: false, message: 'Cannot use reserved username "admin".' };
  }

  const staffDocRef = doc(db, 'staff', lowerUser);
  const staffSnap = await getDoc(staffDocRef);

  if (staffSnap.exists()) {
    return { success: false, message: 'Username already exists.' };
  }

  const newStaff = {
    username: username.trim(),
    password,
    createdAt: new Date().toISOString()
  };

  await setDoc(staffDocRef, newStaff);
  return { success: true, message: `Staff account "${username}" created.`, staff: newStaff };
}

export async function authenticateUser(username, password) {
  const user = username.toLowerCase().trim();

  // Admin login check
  if (user === 'admin' && password === 'admin123') {
    const session = { username: 'Admin', role: 'admin', loginTime: new Date().toISOString() };
    localStorage.setItem(DB_KEYS.SESSION, JSON.stringify(session));
    return { success: true, role: 'admin', session };
  }

  // Security staff check
  const staffDocRef = doc(db, 'staff', user);
  const staffSnap = await getDoc(staffDocRef);

  if (staffSnap.exists()) {
    const matched = staffSnap.data();
    if (matched.password === password) {
      const session = { username: matched.username, role: 'staff', loginTime: new Date().toISOString() };
      localStorage.setItem(DB_KEYS.SESSION, JSON.stringify(session));
      return { success: true, role: 'staff', session };
    }
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

// Reset ticket checkin logs
export async function resetTicketCheckIn(ticketId) {
  try {
    const ticketDocRef = doc(db, 'tickets', ticketId);
    await updateDoc(ticketDocRef, {
      checkedInCount: 0,
      status: 'pending'
    });

    // Remove scans associated with this ticket
    const q = query(collection(db, 'scans'), where('ticketId', '==', ticketId));
    const snap = await getDocs(q);
    const deletePromises = snap.docs.map(d => deleteDoc(d.ref));
    await Promise.all(deletePromises);

    return { success: true, message: 'Ticket check-in entries reset successfully.' };
  } catch (err) {
    console.error("Failed to reset ticket checks:", err);
    return { success: false, message: 'Failed to reset ticket checks.' };
  }
}

// Invalidate ticket checkin logs
export async function invalidateTicket(ticketId) {
  try {
    const ticketDocRef = doc(db, 'tickets', ticketId);
    await updateDoc(ticketDocRef, {
      checkedInCount: 0,
      status: 'invalidated'
    });

    // Remove scans associated with this ticket
    const q = query(collection(db, 'scans'), where('ticketId', '==', ticketId));
    const snap = await getDocs(q);
    const deletePromises = snap.docs.map(d => deleteDoc(d.ref));
    await Promise.all(deletePromises);

    return { success: true, message: 'Ticket invalidated successfully.' };
  } catch (err) {
    console.error("Failed to invalidate ticket:", err);
    return { success: false, message: 'Failed to invalidate ticket.' };
  }
}
