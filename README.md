# VibeCall - Production-Quality 1-to-1 Video Calling Application (Phase 1 Setup)

VibeCall is a high-performance, secure, 1-to-1 video calling platform utilizing React, Express, MongoDB, and WebRTC. This repository represents **Phase 1: Setup & Foundations** of the phased development plan.

---

## 1. Complete Folder Structure

```
video call/
├── .gitignore                      # Workspace-level gitignore
├── README.md                       # Installation and operation handbook
├── implementation_plan.md          # Architectural blueprints and phases
├── backend/
│   ├── .env                        # Local development backend environment variables
│   ├── .env.example                # Backend environment configuration template
│   ├── .gitignore                  # Backend-specific ignore list
│   ├── package.json                # Backend dependency declarations and dev scripts
│   └── src/
│       ├── server.js               # Application bootstrap & graceful shutdown entrypoint
│       ├── app.js                  # Main Express app, middleware pipeline, & health checks
│       ├── config/
│       │   └── db.js               # Database connection using Mongoose ODM
│       ├── middleware/
│       │   ├── error.middleware.js # Express central error interceptor & custom AppError
│       │   └── rateLimiter.js      # Global rate limiter mapping (express-rate-limit)
│       ├── services/
│       │   └── socket.service.js   # Socket.IO instantiation and base listeners
│       └── utils/
│           └── logger.js           # Customized console logging stream format
└── frontend/
    ├── .env                        # Frontend environment endpoints
    ├── .env.example                # Frontend environment configuration template
    ├── .gitignore                  # Frontend ignore configurations
    ├── index.html                  # Root template
    ├── package.json                # Frontend client dependency declarations
    ├── vite.config.js              # Vite compiler config (configured with Tailwind v4)
    └── src/
        ├── App.css                 # Clean stylesheet
        ├── App.jsx                 # Routing wrapper with Auth context hooks
        ├── index.css               # Core Tailwind directives & Custom CSS variable overrides
        ├── main.jsx                # DOM mounting entrypoint
        ├── components/
        │   └── layout/
        │       └── Header.jsx      # Navigation header & dynamic API status check badge
        ├── context/
        │   └── AuthContext.jsx     # Session hooks & backend health monitoring client
        ├── pages/
        │   └── Dashboard.jsx       # Diagnostic dashboard for server connectivity tests
        └── services/
            └── api.js              # Central Axios client instance with cookie propagation
```

---

## 2. File-by-File Explanation

### Backend Architecture
* **[server.js](file:///c:/WebDevelopment/project/video%20call/backend/src/server.js)**: Starts the Node HTTP server, connects to Mongoose, initializes Socket.IO, and defines handlers for `SIGINT`/`SIGTERM` to perform graceful server shutdown (terminating database and active network sockets cleanly).
* **[app.js](file:///c:/WebDevelopment/project/video%20call/backend/src/app.js)**: Orchestrates the Express pipeline. Employs security headers (`helmet`), setups CORS based on env-driven variables, integrates request logging (`morgan`), registers the global IP rate-limiter, defines the `/health` diagnostic route, and connects the catch-all error handling middleware.
* **[db.js](file:///c:/WebDevelopment/project/video%20call/backend/src/config/db.js)**: Configures Mongoose configuration, ensuring the app handles connection timeouts, logs successful linkages, and halts execution gracefully on database initiation failures.
* **[error.middleware.js](file:///c:/WebDevelopment/project/video%20call/backend/src/middleware/error.middleware.js)**: Centralizes exceptions handling. In development, it appends the full stack trace to the JSON response; in production, it hides implementation details and returns standard message schemas.
* **[socket.service.js](file:///c:/WebDevelopment/project/video%20call/backend/src/services/socket.service.js)**: Wraps socket initialization with custom CORS policies, ready for WebRTC control signals and user connection states in Phase 2.
* **[logger.js](file:///c:/WebDevelopment/project/video%20call/backend/src/utils/logger.js)**: Custom logging wrapper utilizing color markers to format warnings, debug logs, and server info in a readable layout.

### Frontend Client Architecture
* **[api.js](file:///c:/WebDevelopment/project/video%20call/frontend/src/services/api.js)**: Creates an Axios instance. Sets `withCredentials: true` to ensure HTTP-only auth cookies are transmitted, and registers global interceptors to extract API errors.
* **[AuthContext.jsx](file:///c:/WebDevelopment/project/video%20call/frontend/src/context/AuthContext.jsx)**: A global context module designed to check API responsiveness on mount and supply session data across the components tree.
* **[Dashboard.jsx](file:///c:/WebDevelopment/project/video%20call/frontend/src/pages/Dashboard.jsx)**: Contains UI components, diagnostic tools, check indicators, and interactive cards query buttons to execute live tests against backend status routes.
* **[vite.config.js](file:///c:/WebDevelopment/project/video%20call/frontend/vite.config.js)**: Boots React fast-refresh along with Tailwind CSS v4 compiler integrations.
* **[index.css](file:///c:/WebDevelopment/project/video%20call/frontend/src/index.css)**: Implements Tailwind CSS v4 import workflows alongside custom CSS variables.

---

## 3. Exact Commands to Run Frontend & Backend

### Prerequisites
1. Install [Node.js](https://nodejs.org/) (Version 18+ recommended)
2. Ensure you have a running MongoDB instance locally (`mongodb://localhost:27017`) or configure an Atlas URI in `backend/.env`.

### Step 1: Install Dependencies
First, execute installation in both directories:

**Backend Setup:**
```bash
cd backend
npm install
```

**Frontend Setup:**
```bash
cd ../frontend
npm install
```

### Step 2: Running the Backend
Ensure you are in the `backend/` directory, then start the server in watch mode:
```bash
npm run dev
```
*The server will boot on port `5000` by default (as configured in `.env`).*

### Step 3: Running the Frontend
Ensure you are in the `frontend/` directory, then start the Vite development server:
```bash
npm run dev
```
*The web dashboard will boot on [http://localhost:5173](http://localhost:5173).*

---

## 4. Manual Verification Procedures

Once both services are running, perform these checks to verify the architecture:

### Test 1: Query API Welcome & Health Route (Directly from Terminal or Browser)
To verify that the Express app is running and rate limit / health check features function correctly:

* **Using curl / PowerShell WebRequest:**
  ```bash
  curl http://localhost:5000/health
  ```
* **Expected JSON output:**
  ```json
  {
    "success": true,
    "status": "UP",
    "timestamp": "2026-08-20T...",
    "uptime": 12.345,
    "database": "connected",
    "environment": "development"
  }
  ```
  *(Note that `database` will read `connected` if your local MongoDB daemon is up and active).*

### Test 2: Mongoose Database Check
You can confirm that the database is active and connecting correctly.
1. Run `npm run dev` in the backend folder.
2. Observe terminal logs. If MongoDB is running correctly, you will see:
   ```
   [INFO] [2026-08-20T...] Connecting to MongoDB...
   [INFO] [2026-08-20T...] MongoDB Connected: 127.0.0.1:27017/videocall
   [INFO] [2026-08-20T...] Socket.IO initialized successfully.
   [INFO] [2026-08-20T...] Server is running in development mode on port 5000
   ```
3. Stop your local MongoDB service. The backend will trigger the process halt with stack details:
   ```
   [ERROR] [2026-08-20T...] Error connecting to MongoDB: MongooseServerSelectionError: ...
   ```

### Test 3: Frontend Dashboard Test
1. Access the application homepage at [http://localhost:5173](http://localhost:5173).
2. The page header should show a badge stating **"Server Connected"** with a green pulse dot.
3. Click the **"Query /health Endpoint"** button on the page.
4. The page will immediately update to render the active database state, uptime statistics, and node environment details in green code syntax directly from the server.
