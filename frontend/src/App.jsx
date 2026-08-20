import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { SocketProvider } from './context/SocketContext';
import { CallProvider } from './context/CallContext';
import Header from './components/layout/Header';
import CallOverlay from './components/call/CallOverlay';
import Dashboard from './pages/Dashboard';
import Login from './pages/Login';
import Register from './pages/Register';
import Profile from './pages/Profile';
import ProtectedRoute from './components/common/ProtectedRoute';

function App() {
  return (
    <AuthProvider>
      <SocketProvider>
        <CallProvider>
          <BrowserRouter>
            <div className="min-h-screen bg-[#070a13] text-slate-100 flex flex-col font-sans">
              <Header />

              <main className="flex-grow">
                <Routes>
                  <Route
                    path="/"
                    element={
                      <ProtectedRoute>
                        <Dashboard />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/profile"
                    element={
                      <ProtectedRoute>
                        <Profile />
                      </ProtectedRoute>
                    }
                  />

                  <Route path="/login" element={<Login />} />
                  <Route path="/register" element={<Register />} />

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

              <footer className="border-t border-slate-900 bg-slate-950/40 py-6 text-center text-xs text-slate-500">
                <p>VibeCall P2P Video Call System &copy; {new Date().getFullYear()} - Designed with React 19 & Tailwind CSS v4</p>
              </footer>

              {/* Global call overlays — rendered outside routes so they persist during navigation */}
              <CallOverlay />
            </div>
          </BrowserRouter>
        </CallProvider>
      </SocketProvider>
    </AuthProvider>
  );
}

export default App;
