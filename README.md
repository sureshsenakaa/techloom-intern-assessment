# Techloom.ai — Software Engineer Intern Practical Assessment

> **Candidate**: Practical Assessment Submission  
> **Duration**: 72-Hour Project Completion  
> **Sections Completed**: Section 01 (POS Concurrency System) & Section 02 (E-Commerce Storefront)

---

## 🔗 Live Deployment & Links

| Deliverable | Live URL / Reference |
| :--- | :--- |
| **GitHub Repository** | [https://github.com/sureshsenakaa/techloom-intern-assessment](https://github.com/sureshsenakaa/techloom-intern-assessment) |
| **Task 01 Live URL (POS System)** | *[Add your deployed Task 01 Vercel/Render link here]* |
| **Task 02 Live URL (E-Commerce)** | *[Add your deployed Task 02 Vercel/Render link here]* |
| **Walkthrough Demo Video** | *[Optional: Add Loom demo video link here]* |

---

## 🌟 Executive Summary & Technical Highlights

This repository contains full, production-ready implementations for both required sections:

### 1. Section 01: POS Order & Inventory System (`/task-01`)
- **Concurrency-Safe Order Engine**: Eliminates overselling under concurrent load using database transactions with row-level locks (`SELECT ... FOR UPDATE`) and atomic conditional decrements (`UPDATE products SET available_stock = available_stock - qty WHERE id = ? AND available_stock >= qty`).
- **5-Minute Stock Reservation**: Automatically locks inventory the moment checkout begins, and auto-releases unpurchased stock back to available inventory after 5 minutes via a dedicated background worker.
- **Mock Payment Simulation**: Supports `SUCCESS`, `FAILED` (releases stock), and `TIMEOUT` (expires reservation) outcomes.
- **Idempotency Protection**: Prevents duplicate payment and checkout submissions via unique idempotency keys.
- **Order Lifecycle & Refunds**: Implements clear state transitions (`PENDING`, `RESERVED`, `PAID`, `CANCELLED`, `EXPIRED`, `FAILED`) and restores stock upon cancellation.
- **Automated Stress Test**: Includes an automated script (`concurrency-test.js`) firing 15 simultaneous checkout requests on stock = 1 to verify zero overselling.

### 2. Section 02: E-Commerce Checkout & Payment System (`/task-02`)
- **Product Discovery**: Responsive storefront with live text search, category filters (Audio, Wearables, Accessories, Electronics), price range filtering, and in-stock toggle.
- **Cart & Checkout**: Full cart management (add, update quantities, clear, totals) and stock-reserved checkout flow with a live **5-minute countdown timer**.
- **Payment Gateway Simulator**: Interactive modal allowing evaluators to simulate payment approval, card decline, gateway timeouts, and duplicate payment rejections.
- **Post-Purchase & Refunds**: Order history dashboard with status tracking and instant order cancellation & refund processing that restores stock in real-time.

---

## 🏗️ Architecture & State Machine

```
                   ┌──────────────┐
                   │   PENDING    │
                   └──────┬───────┘
                          │  (Checkout / Stock Lock)
                          ▼
                   ┌──────────────┐
       ┌───────────┤   RESERVED   ├───────────┐
       │           └──────┬───────┘           │
(Payment Failed)          │ (Payment Success) │ (5-Min Timeout / No Payment)
       ▼                  ▼                   ▼
┌──────────────┐   ┌──────────────┐    ┌──────────────┐
│    FAILED    │   │     PAID     │    │   EXPIRED    │
│(Stock Back)  │   └──────┬───────┘    │ (Stock Back) │
└──────────────┘          │            └──────────────┘
                          │ (Customer Cancel)
                          ▼
                   ┌──────────────┐
                   │  CANCELLED   │
                   │ (Refunded &  │
                   │  Stock Back) │
                   └──────────────┘
```

---

## 📁 Repository Structure

```text
├── task-01/                                # POS Order & Inventory System
│   ├── backend/                            # Express.js + PostgreSQL API
│   │   ├── src/
│   │   │   ├── config/db.js                # Dual-engine DB (Live Postgres + In-memory fallback)
│   │   │   ├── controllers/                # Product, Order, and Payment controllers
│   │   │   ├── migrations/schema.sql       # PostgreSQL DDL schema & indexes
│   │   │   ├── routes/api.js               # REST API endpoints
│   │   │   ├── services/
│   │   │   │   ├── inventoryService.js     # Concurrency engine with row locks
│   │   │   │   ├── paymentService.js       # Mock gateway with idempotency
│   │   │   │   └── reservationWorker.js    # 5-min auto-release worker
│   │   │   └── server.js                   # API entrypoint (Port 5001)
│   │   └── package.json
│   ├── frontend/                           # React (Vite) POS Operator Dashboard
│   │   ├── src/
│   │   │   ├── App.jsx                     # POS Register, Orders Table, Concurrency Widget
│   │   │   └── index.css                   # Modern styling
│   │   └── package.json
│   └── concurrency-test.js                 # 15-thread simultaneous oversell stress test
│
├── task-02/                                # E-Commerce Checkout & Payment System
│   ├── backend/                            # Express.js + PostgreSQL API
│   │   ├── src/
│   │   │   ├── config/db.js                # PostgreSQL client & 8 seed products
│   │   │   ├── controllers/storeController.js
│   │   │   ├── migrations/schema.sql       # Catalog, Orders, Reservations, Payments
│   │   │   ├── routes/api.js               # Search, Filter, Checkout, Refund routes
│   │   │   ├── services/
│   │   │   │   ├── catalogService.js       # Search & multi-parameter filtering
│   │   │   │   ├── checkoutService.js      # Cart reservation & order placement
│   │   │   │   ├── paymentService.js       # Payment simulation & refund engine
│   │   │   │   └── reservationWorker.js    # 5-min auto-release worker
│   │   │   └── server.js                   # API entrypoint (Port 5002)
│   │   └── package.json
│   └── frontend/                           # React (Vite) Consumer Storefront
│       ├── src/
│       │   ├── App.jsx                     # Storefront, Filters, Cart Drawer, 5m Timer, History
│       │   └── index.css                   # Modern consumer UI
│       └── package.json
│
├── package.json                            # Monorepo scripts
└── README.md                               # Master Documentation
```

---

## 🚀 Quick Start (Zero-Setup Local Testing)

Both backend services feature a **Dual-Engine Database Adapter**. If no `DATABASE_URL` is configured, it automatically initializes an in-memory PostgreSQL instance with schema migrations and seed products, allowing **immediate zero-friction local execution**.

### 1. Run the Automated Concurrency Test
Proves zero overselling under 15 simultaneous requests on stock = 1:
```bash
# From the repository root:
node task-01/concurrency-test.js
```

### 2. Run Task 01 (POS System)
```bash
# Terminal 1: Backend
cd task-01/backend
npm install
npm start
# -> Backend starts on http://localhost:5001

# Terminal 2: Frontend
cd task-01/frontend
npm install
npm run dev
# -> Frontend runs on http://localhost:5173
```

### 3. Run Task 02 (E-Commerce Storefront)
```bash
# Terminal 1: Backend
cd task-02/backend
npm install
npm start
# -> Backend starts on http://localhost:5002

# Terminal 2: Frontend
cd task-02/frontend
npm install
npm run dev
# -> Frontend runs on http://localhost:5174
```

---

## 🧪 How to Verify Each Feature

| Feature | How to Test | Expected Outcome |
| :--- | :--- | :--- |
| **Concurrency / Oversell Prevention** | Click the *"⚡ Concurrency Stress Test"* tab in Task 01 UI or run `node task-01/concurrency-test.js`. | Exactly 1 order is created (201). The other 14 requests receive `409 Conflict: Insufficient Stock`. Final stock = 0. |
| **5-Minute Stock Reservation** | Add an item to cart and initiate checkout. | Stock drops immediately in the catalog. A 5-minute countdown appears. |
| **Auto-Expiry / Timeout** | In Task 01 Orders table, click *"Expire (TTL)"* or let the 5m timer expire. | Reservation status becomes `EXPIRED`. Available stock returns to warehouse inventory. |
| **Mock Payment: Success** | In Checkout modal, click *"Simulate Payment SUCCESS"*. | Order status transitions to `PAID`. Reservation marked completed. |
| **Mock Payment: Failure / Decline** | In Checkout modal, click *"Simulate Payment DECLINE"*. | Order status transitions to `FAILED`. Reserved stock is immediately restored to available stock. |
| **Duplicate Payment Detection** | Submit payment with an identical idempotency key. | Gateway detects existing payment record and prevents double charging. |
| **Order Cancellation & Refund** | In Order History, click *"Request Cancellation & Refund"* on a Paid order. | Order status becomes `CANCELLED`, simulated refund is logged, and items are returned to available stock. |

---

## 🌐 Live Deployment Guide (Free Tier)

### Step 1: Cloud PostgreSQL (Neon.tech)
1. Sign up at [Neon.tech](https://neon.tech) (100% free serverless PostgreSQL).
2. Create a project and copy the connection string:
   `postgresql://username:password@ep-something.neon.tech/neondb?sslmode=require`

### Step 2: Deploy Backends (Render.com or Railway.app)
1. Push this repository to your GitHub account.
2. On Render.com, create **New Web Service**:
   - **Task 01**: Root Directory: `task-01/backend`, Build Command: `npm install`, Start Command: `node src/server.js`, Environment Variable: `DATABASE_URL` = your Neon connection string.
   - **Task 02**: Root Directory: `task-02/backend`, Build Command: `npm install`, Start Command: `node src/server.js`, Environment Variable: `DATABASE_URL` = your Neon connection string.

### Step 3: Deploy Frontends (Vercel.com)
1. On Vercel.com, import the GitHub repository:
   - **Task 01**: Root Directory: `task-01/frontend`, Environment Variable: `VITE_API_URL` = your deployed Task 01 backend URL + `/api`.
   - **Task 02**: Root Directory: `task-02/frontend`, Environment Variable: `VITE_API_URL` = your deployed Task 02 backend URL + `/api`.
2. Update the Live URLs at the top of this `README.md` and submit!
