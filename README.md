# ⚡ ScanPass

ScanPass is a modern, real-time e-Ticket verification and scanning web application designed for seamless event check-ins. It supports real-time gate entry admissions, capacity analytics, offline scanning synchronization, and a custom e-ticket viewer with dynamic QR code generation.

---

## 🚀 Key Features

- **Events Management**: Create events with custom names, venue locations, date & time, and maximum capacity limits.
- **E-Ticket Issuance**: Register customer details, set group admission sizes, and generate high-quality QR codes in real-time.
- **Gate Check-in Camera Scanner**: Built-in webcam QR scanning (powered by `html5-qrcode`) with manual ticket ID entry fallback.
- **Flexible Group Admissions**: Admit group members together or separately with real-time capacity and remaining-seat updates.
- **Offline Mode & Syncing**: Toggle network simulation to test offline scans. Scan tickets without internet access; they will queue locally (via IndexedDB) and synchronize automatically once connection is restored.
- **Real-Time Analytics Dashboard**: Track entry metrics, progress ratios, and capacity gauges live as gate check-ins occur.

---

## 🛠️ Technology Stack

- **Core**: HTML5, Vanilla JavaScript (ES Modules)
- **Styling**: Modern, premium Vanilla CSS with responsive Glassmorphism design and custom variables
- **Build Tool**: [Vite](https://vite.dev/)
- **QR Operations**:
  - `qrcode` (for generating attendee pass QR codes)
  - `html5-qrcode` (for scanning tickets through device webcams)

---

## 📦 Installation & Setup

Follow these steps to run the application locally on your machine.

### Prerequisites
Make sure you have [Node.js](https://nodejs.org/) installed (v18 or higher recommended).

### 1. Clone or Open Project
Navigate to the project root directory where `package.json` is located.

### 2. Install Dependencies
Run the following command to download and install the required libraries:
```bash
npm install
```

---

## 🖥️ Running the Application

### 1. Run Development Server
To launch the app with hot reloading for local development, run:
```bash
npm run dev
```
Once started, the terminal will output a local address (usually `http://localhost:3000`). Open this URL in your web browser.

### 2. Build for Production
To generate optimized production assets (placed inside the `/dist` directory), run:
```bash
npm run build
```

### 3. Preview Production Build
To preview the production bundle locally before deploying:
```bash
npm run preview
```

---

## 📖 App Usage Guide

1. **Create an Event**: In the **Vendor Dashboard** view, input the event name, venue, datetime, and capacity, then click **Create Event**.
2. **Issue an E-Ticket**: Fill in the customer's name, contact number, and group size, then click **Issue E-Ticket & Generate QR**.
3. **View Pass**: Click **View/Print Pass** on any issued ticket in the ledger to show the attendee's ticket. It displays a dynamically generated QR code containing the Ticket ID.
4. **Scan Passes**:
   - Go to the **QR Scanner** tab.
   - Grant webcam permissions to allow camera scanning, or copy the Ticket ID from the ledger and input it into the **Manual Ticket ID** box.
   - Specify the number of group members entering during validation.
5. **Simulate Offline Flow**:
   - Disable **Simulate Network** using the toggle switch in the header.
   - Scan passes or admit attendees manually. They will be placed in the offline queue.
   - Re-enable the network switch to trigger auto-sync, or click **Sync Now** to push scanned check-ins back to the ledger.
