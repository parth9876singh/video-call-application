import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import Header from './components/layout/Header';
import Dashboard from './pages/Dashboard';
import Login from './pages/Login';
import Register from './pages/Register';
import ProtectedRoute from './components/common/ProtectedRoute';

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <div className="min-h-screen bg-[#070a13] text-slate-100 flex flex-col font-sans">
          {/* Top navigation header */}
          <Header />

          {/* Main content body */}
          <main className="flex-grow">
            <Routes>
              {/* Protected Routes */}
              <Route
                path="/"
                element={
                  <ProtectedRoute>
                    <Dashboard />
                  </ProtectedRoute>
                }
              />

              {/* Public Authentication Routes */}
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />

              {/* Catch-all 404 Route */}
              <Route
                path="*"
                element={
                  <div className="text-center py-20">
                    <h1 className="text-4xl font-extrabold mb-4">404 - Page Not Found</h1>
                    <p className="text-slate-400 text-sm">The requested URL does not exist.</p>
                  </div>
                }
              />
            </Routes>
          </main>

          {/* Footer banner */}
          <footer className="border-t border-slate-900 bg-slate-950/40 py-6 text-center text-xs text-slate-500">
            <p>VibeCall P2P Video Call System &copy; {new Date().getFullYear()} - Designed with React 19 & Tailwind CSS v4</p>
          </footer>
        </div>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
