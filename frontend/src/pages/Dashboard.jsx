import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';

const Dashboard = () => {
  const { user, backendStatus } = useAuth();
  const [healthStatus, setHealthStatus] = useState(null);
  const [healthLoading, setHealthLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchHealth = async () => {
    setHealthLoading(true);
    setError(null);
    try {
      // Direct call to /health endpoint which checks DB state, process uptime, etc.
      // Axios instance has /api suffix, but health is on root /, so let's call it via direct axios request or customize
      // Wait, let's see. The backend app.js maps `/health` on the root level!
      // Since our Axios instance is configured with `/api`, we can request `../../health` or make a direct Axios request.
      // Let's call `/health` relative to API URL.
      const response = await api.get('/../health');
      setHealthStatus(response.data);
    } catch (err) {
      setError(err.message || 'Failed to fetch server health status');
    } finally {
      setHealthLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Hero Welcome Panel */}
      <section className="bg-slate-900/60 border border-slate-800 rounded-2xl p-8 mb-8 backdrop-blur-sm text-center relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-violet-600/10 rounded-full blur-3xl -z-10"></div>
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-fuchsia-600/10 rounded-full blur-3xl -z-10"></div>

        <h1 className="text-3xl font-extrabold tracking-tight md:text-4xl bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent mb-4">
          Establish the Connection
        </h1>
        <p className="text-slate-400 max-w-xl mx-auto mb-6 text-sm md:text-base leading-relaxed">
          Welcome to the foundations of <b>VibeCall</b>. The backend infrastructure is setup, environment variables are loaded, and MongoDB is linked.
        </p>

        <div className="flex flex-col sm:flex-row justify-center items-center gap-4">
          <div className="bg-slate-950/80 px-4 py-3 rounded-lg border border-slate-850 flex items-center space-x-3 text-left w-full sm:w-auto">
            <div className={`w-3 h-3 rounded-full ${backendStatus.connected ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`}></div>
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-wider font-bold">API Connection</p>
              <p className="text-sm font-semibold text-slate-350">{backendStatus.connected ? 'Active' : 'Offline'}</p>
            </div>
          </div>

          <div className="bg-slate-950/80 px-4 py-3 rounded-lg border border-slate-850 flex items-center space-x-3 text-left w-full sm:w-auto">
            <div className="w-3 h-3 rounded-full bg-violet-500"></div>
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-wider font-bold">Vite Server</p>
              <p className="text-sm font-semibold text-slate-350">HMR Active</p>
            </div>
          </div>
        </div>
      </section>

      {/* Health Check and Debug Module */}
      <section className="bg-slate-900/40 border border-slate-850 rounded-xl p-6 mb-8">
        <h2 className="text-xl font-bold text-slate-250 mb-3 flex items-center justify-between">
          <span>Backend Verification</span>
          <button
            onClick={fetchHealth}
            disabled={healthLoading}
            className="text-xs bg-violet-600 hover:bg-violet-750 text-white font-semibold py-2 px-4 rounded-md shadow-md shadow-violet-600/10 hover:shadow-violet-600/20 active:scale-98 transition-all disabled:opacity-50"
          >
            {healthLoading ? 'Fetching...' : 'Query /health Endpoint'}
          </button>
        </h2>
        <p className="text-slate-400 text-xs mb-4">
          Run integration test directly to verify Mongoose connectivity, node environment configs, and server uptime.
        </p>

        {error && (
          <div className="bg-rose-500/15 border border-rose-500/30 text-rose-300 rounded-lg p-3 text-xs mb-4">
            <strong>Error:</strong> {error}
          </div>
        )}

        {healthStatus ? (
          <div className="bg-slate-950 border border-slate-850 rounded-lg p-4 font-mono text-xs text-left overflow-x-auto text-emerald-400">
            <pre>{JSON.stringify(healthStatus, null, 2)}</pre>
          </div>
        ) : (
          <div className="border border-dashed border-slate-800 rounded-lg p-8 text-center text-slate-500 text-xs font-mono">
            No health record queried. Click the button to request data.
          </div>
        )}
      </section>

      {/* Tech Stack Modules */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-slate-900/30 border border-slate-850 rounded-xl p-5">
          <h3 className="font-semibold text-slate-200 text-sm uppercase tracking-wide mb-3 text-violet-400">Backend Checklist</h3>
          <ul className="space-y-2 text-xs text-slate-400">
            <li className="flex items-center space-x-2">
              <span className="text-emerald-500 font-bold">✓</span>
              <span>Express server core runtime bound to port 5000</span>
            </li>
            <li className="flex items-center space-x-2">
              <span className="text-emerald-500 font-bold">✓</span>
              <span>Helmet & CORS protection configured via environment variables</span>
            </li>
            <li className="flex items-center space-x-2">
              <span className="text-emerald-500 font-bold">✓</span>
              <span>MongoDB Atlas/Local Mongoose integration enabled</span>
            </li>
            <li className="flex items-center space-x-2">
              <span className="text-emerald-500 font-bold">✓</span>
              <span>Dynamic Morgan request logging and Centralized Error Handling</span>
            </li>
          </ul>
        </div>

        <div className="bg-slate-900/30 border border-slate-850 rounded-xl p-5">
          <h3 className="font-semibold text-slate-200 text-sm uppercase tracking-wide mb-3 text-fuchsia-400">Frontend Checklist</h3>
          <ul className="space-y-2 text-xs text-slate-400">
            <li className="flex items-center space-x-2">
              <span className="text-emerald-500 font-bold">✓</span>
              <span>React v19 + Vite HMR running</span>
            </li>
            <li className="flex items-center space-x-2">
              <span className="text-emerald-500 font-bold">✓</span>
              <span>Tailwind CSS v4 initialized & styled</span>
            </li>
            <li className="flex items-center space-x-2">
              <span className="text-emerald-500 font-bold">✓</span>
              <span>Axios client with dynamic intercepts configured</span>
            </li>
            <li className="flex items-center space-x-2">
              <span className="text-emerald-500 font-bold">✓</span>
              <span>React Router DOM route structure initialized</span>
            </li>
          </ul>
        </div>
      </section>
    </div>
  );
};

export default Dashboard;
