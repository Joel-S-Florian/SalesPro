import React, { useEffect, useState } from 'react';
import { api } from './services/api';
import { useAuthStore } from './stores/authStore';
import { useAuthMe } from './hooks/queries';
import Dashboard from './pages/Dashboard';
import SalesPOS from './pages/SalesPOS';
import Products from './pages/Products';
import Categories from './pages/Categories';
import Customers from './pages/Customers';
import Inventory from './pages/Inventory';
import UsersPage from './pages/Users';
import Reports from './pages/Reports';
import ErrorBoundary from './components/ErrorBoundary';

import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  Tag,
  Users,
  Archive,
  UserCheck,
  BarChart,
  LogOut,
  Menu,
  X,
  Shield,
  Loader2,
  LockKeyhole
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export default function App() {
  const { user, isAuthenticated, accessToken, refreshToken, login, logout, setUser } = useAuthStore();
  const { data: authData, isLoading: authLoading, error: authError } = useAuthMe();
  const [loginError, setLoginError] = useState(null);
  const [sessionMessage, setSessionMessage] = useState(null);
  const [loggingIn, setLoggingIn] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const [activeTab, setActiveTab] = useState('DASHBOARD');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Sincroniza el usuario cuando useAuthMe responde (sin re-persistir tokens)
  useEffect(() => {
    if (authData?.user && !user) {
      setUser(authData.user);
    }
  }, [authData, user, setUser]);

  // Si el 401 llega hasta aqui es porque api.js ya intento renovar y fallo
  useEffect(() => {
    if (authError && authError.status === 401) {
      console.log('[AUTH] Sesion invalida, cerrando sesion local.');
      setSessionMessage('Tu sesion expiro. Inicia sesion de nuevo.');
      logout();
    }
  }, [authError, logout]);

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) return;
    try {
      setLoggingIn(true);
      setLoginError(null);
      setSessionMessage(null);
      const data = await api.auth.login(username, password);
      login(data.user, data.accessToken, data.refreshToken);
      setActiveTab('DASHBOARD');
    } catch (err) {
      setLoginError(err.message || 'Error de autenticacion');
    } finally {
      setLoggingIn(false);
    }
  };

  const handleQuickLogin = async (usr, pass) => {
    setUsername(usr);
    setPassword(pass);
    try {
      setLoggingIn(true);
      setLoginError(null);
      setSessionMessage(null);
      const data = await api.auth.login(usr, pass);
      login(data.user, data.accessToken, data.refreshToken);
      setActiveTab('DASHBOARD');
    } catch (err) {
      setLoginError(err.message || 'Error de autenticacion');
    } finally {
      setLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    await api.auth.logout();
    logout();
  };

  if (authLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-screen relative overflow-hidden">
        {/* Mesh Background */}
        <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden bg-[#f4f6fa] dark:bg-[#090d16]">
          <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-indigo-200/35 dark:bg-indigo-950/20 blur-[120px]"></div>
          <div className="absolute bottom-[-10%] right-[-10%] w-[60%] h-[60%] rounded-full bg-purple-200/25 dark:bg-purple-950/15 blur-[120px]"></div>
        </div>
        <div className="relative z-10 flex flex-col items-center space-y-4">
          <Loader2 className="w-10 h-10 text-indigo-500 animate-spin" />
          <p className="text-sm font-mono text-slate-500 dark:text-slate-400">Iniciando sistema SalesPro v2...</p>
        </div>
      </div>
    );
  }

  // IF NOT LOGGED IN: Render Login view
  const isFullyAuthenticated = isAuthenticated && user && (accessToken || refreshToken);
  if (!isFullyAuthenticated) {
    return (
      <div className="min-h-screen relative flex flex-col justify-center items-center p-4 selection:bg-indigo-500 selection:text-white overflow-hidden" id="login-screen">
        {/* Mesh Background */}
        <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden bg-[#f4f6fa] dark:bg-[#090d16]">
          <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-indigo-200/40 dark:bg-indigo-950/20 blur-[120px]"></div>
          <div className="absolute bottom-[-10%] right-[-10%] w-[60%] h-[60%] rounded-full bg-purple-200/30 dark:bg-purple-950/15 blur-[120px]"></div>
          <div className="absolute top-[30%] right-[10%] w-[35%] h-[35%] rounded-full bg-sky-200/35 dark:bg-sky-950/10 blur-[100px]"></div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          className="relative z-10 w-full max-w-md glass-card rounded-2xl p-8 space-y-6"
        >
          {/* Logo Heading */}
          <div className="text-center space-y-1.5">
            <span className="text-xs bg-indigo-50/80 dark:bg-indigo-950/50 border border-indigo-100 dark:border-indigo-900/50 text-indigo-600 dark:text-indigo-400 font-extrabold px-3 py-1 rounded-full font-mono uppercase tracking-wider">
              SalesPro v2
            </span>
            <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100 tracking-tight font-display">
              Sistema de Ventas
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">Inicia sesión para gestionar inventario y facturación.</p>
          </div>

          {(loginError || sessionMessage) && (
            <div className="p-3.5 bg-rose-50/80 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/50 rounded-xl text-rose-600 dark:text-rose-400 text-xs font-semibold text-center animate-shake">
              ⚠️ {loginError || sessionMessage}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="login-username" className="block text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                Usuario de Acceso
              </label>
              <input
                id="login-username"
                type="text"
                required
                placeholder="Ej. admin"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl text-slate-800 dark:text-slate-100 glass-input outline-none text-xs font-mono"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="login-password" className="block text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                Contraseña
              </label>
              <input
                id="login-password"
                type="password"
                required
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl text-slate-800 dark:text-slate-100 glass-input outline-none text-xs font-mono"
              />
            </div>

            <button
              type="submit"
              disabled={loggingIn || !username || !password}
              className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white font-bold text-xs py-3 rounded-xl transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-1.5 uppercase tracking-wider cursor-pointer"
            >
              {loggingIn ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Verificando...
                </>
              ) : (
                'Iniciar Sesión'
              )}
            </button>
          </form>

          {/* Demo shortcuts */}
          <div className="border-t border-white/20 dark:border-slate-800/40 pt-5 space-y-3">
            <p className="text-[10px] text-center text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider">
              Acceso Rápido de Prueba (Demo):
            </p>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => handleQuickLogin('admin', 'admin')}
                className="flex flex-col items-center bg-white/40 hover:bg-white/70 dark:bg-slate-800/20 dark:hover:bg-slate-800/40 p-2.5 rounded-xl border border-white/50 dark:border-slate-800/30 text-slate-700 dark:text-slate-300 shadow-sm transition-all cursor-pointer"
              >
                <span className="text-[11px] font-bold">Administrador</span>
                <span className="text-[9px] text-slate-500 dark:text-slate-400 font-mono">admin / admin</span>
              </button>
              <button
                type="button"
                onClick={() => handleQuickLogin('vendedor', 'vendedor')}
                className="flex flex-col items-center bg-white/40 hover:bg-white/70 dark:bg-slate-800/20 dark:hover:bg-slate-800/40 p-2.5 rounded-xl border border-white/50 dark:border-slate-800/30 text-slate-700 dark:text-slate-300 shadow-sm transition-all cursor-pointer"
              >
                <span className="text-[11px] font-bold">Vendedor POS</span>
                <span className="text-[9px] text-slate-500 dark:text-slate-400 font-mono">vendedor / vendedor</span>
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    );
  }

  const userRole = (user?.role || '').toUpperCase();

  // NAVIGATION ITEM HELPER
  const navItems = [
    { id: 'DASHBOARD', label: 'Dashboard', icon: LayoutDashboard, roles: ['ADMINISTRADOR', 'VENDEDOR'] },
    { id: 'POS', label: 'Nueva Venta (POS)', icon: ShoppingCart, roles: ['ADMINISTRADOR', 'VENDEDOR'] },
    { id: 'PRODUCTS', label: 'Productos', icon: Package, roles: ['ADMINISTRADOR', 'VENDEDOR'] },
    { id: 'CATEGORIES', label: 'Categorías', icon: Tag, roles: ['ADMINISTRADOR', 'VENDEDOR'] },
    { id: 'CUSTOMERS', label: 'Clientes', icon: Users, roles: ['ADMINISTRADOR', 'VENDEDOR'] },
    { id: 'INVENTORY', label: 'Inventario / Kárdex', icon: Archive, roles: ['ADMINISTRADOR', 'VENDEDOR'] },
    { id: 'USERS', label: 'Personal / Roles', icon: UserCheck, roles: ['ADMINISTRADOR'] },
    { id: 'REPORTS', label: 'Reportes', icon: BarChart, roles: ['ADMINISTRADOR', 'VENDEDOR'] }
  ];

  // TAB RENDERING ROUTER
  const renderTabContent = () => {
    if (activeTab === 'USERS' && userRole !== 'ADMINISTRADOR') {
      return (
        <div className="flex flex-col items-center justify-center h-96 text-center space-y-4 max-w-md mx-auto">
          <div className="bg-rose-50/80 dark:bg-rose-950/20 p-4 rounded-full text-rose-500 border border-rose-100 dark:border-rose-900/40">
            <LockKeyhole className="w-12 h-12" />
          </div>
          <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 font-display">Acceso Restringido</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
            Esta sección contiene configuraciones de personal y roles de seguridad; solo está disponible para usuarios con privilegios de <strong>Administrador</strong>.
          </p>
        </div>
      );
    }

    switch (activeTab) {
      case 'DASHBOARD':
        return <Dashboard onNavigateToPOS={() => setActiveTab('POS')} onNavigateToProducts={() => setActiveTab('PRODUCTS')} />;
      case 'POS':
        return <SalesPOS />;
      case 'PRODUCTS':
        return <Products />;
      case 'CATEGORIES':
        return <Categories />;
      case 'CUSTOMERS':
        return <Customers />;
      case 'INVENTORY':
        return <Inventory />;
      case 'USERS':
        return <UsersPage />;
      case 'REPORTS':
        return <Reports />;
      default:
        return <Dashboard onNavigateToPOS={() => setActiveTab('POS')} onNavigateToProducts={() => setActiveTab('PRODUCTS')} />;
    }
  };

  return (
    <div className="min-h-screen relative flex selection:bg-indigo-500 selection:text-white overflow-hidden" id="salespro-app">
      {/* Mesh Background */}
      <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden bg-[#f4f6fa] dark:bg-[#090d16]">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-indigo-200/35 dark:bg-indigo-950/20 blur-[120px]"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[60%] h-[60%] rounded-full bg-purple-200/25 dark:bg-purple-950/15 blur-[120px]"></div>
        <div className="absolute top-[35%] right-[15%] w-[35%] h-[35%] rounded-full bg-sky-200/25 dark:bg-sky-950/10 blur-[100px]"></div>
      </div>

      {/* 1. SIDEBAR NAVIGATION - DESKTOP */}
      <aside className="hidden lg:flex flex-col w-64 glass-sidebar text-slate-600 dark:text-slate-400 shrink-0 select-none relative z-10">
        {/* Sidebar Header */}
        <div className="p-6 border-b border-white/20 dark:border-slate-800/40 flex items-center justify-between">
          <div className="space-y-1">
            <h1 className="text-lg font-extrabold text-slate-900 dark:text-white tracking-wider font-display">SALESPRO v2</h1>
            <span className="text-[9px] bg-indigo-50 dark:bg-indigo-950 border border-indigo-200 dark:border-indigo-800/50 text-indigo-600 dark:text-indigo-400 px-2.5 py-0.5 rounded-full font-bold font-mono">
              SISTEMA COMERCIAL
            </span>
          </div>
        </div>

        {/* User Card */}
        <div className="px-6 py-4.5 border-b border-white/25 dark:border-slate-800/30 flex items-center gap-3">
          <div className="bg-white/60 dark:bg-slate-800/60 p-2 rounded-xl text-indigo-600 dark:text-indigo-400 border border-white/40 dark:border-slate-700/50">
            <Shield className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate">{user.fullName}</p>
            <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono block">Rol: {user.role}</span>
          </div>
        </div>

        {/* Nav Items list */}
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const isAllowed = item.roles.includes(userRole);
            if (!isAllowed) return null;

            const Icon = item.icon;
            const isActive = activeTab === item.id;

            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                  isActive
                    ? 'glass-nav-active text-indigo-700 dark:text-indigo-400'
                    : 'hover:bg-white/35 dark:hover:bg-slate-800/30 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Footer Logout */}
        <div className="p-4 border-t border-white/20 dark:border-slate-800/40">
          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 px-3 py-2.5 bg-white/30 dark:bg-slate-800/20 hover:bg-rose-50/50 dark:hover:bg-rose-950/20 text-slate-500 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 rounded-xl text-xs font-bold transition-all border border-white/30 dark:border-slate-800/40 hover:border-rose-200 dark:hover:border-rose-900/50 cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            <span>Cerrar Sesión</span>
          </button>
        </div>
      </aside>

      {/* 2. SIDEBAR - MOBILE DRAWER OVERLAY */}
      <AnimatePresence>
        {sidebarOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.5 }}
              exit={{ opacity: 0 }}
              onClick={() => setSidebarOpen(false)}
              className="fixed inset-0 z-40 bg-slate-950/60 lg:hidden backdrop-blur-sm"
            />
            <motion.aside
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed inset-y-0 left-0 z-50 flex flex-col w-64 glass-sidebar text-slate-600 dark:text-slate-400 select-none lg:hidden"
            >
              <div className="p-6 border-b border-white/20 dark:border-slate-800/40 flex items-center justify-between">
                <div className="space-y-1">
                  <h1 className="text-md font-extrabold text-slate-900 dark:text-white tracking-wider font-display">SALESPRO v2</h1>
                  <span className="text-[9px] bg-indigo-50 dark:bg-indigo-950 border border-indigo-200 dark:border-indigo-800/50 text-indigo-600 dark:text-indigo-400 px-2 py-0.5 rounded-full font-bold font-mono">
                    SISTEMA COMERCIAL
                  </span>
                </div>
                <button
                  onClick={() => setSidebarOpen(false)}
                  className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800/50 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Mobile User Card */}
              <div className="px-6 py-4 border-b border-white/25 dark:border-slate-800/30 flex items-center gap-3">
                <div className="bg-white/60 dark:bg-slate-800/60 p-2 rounded-lg text-indigo-600 dark:text-indigo-400">
                  <Shield className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-slate-800 dark:text-white truncate">{user.fullName}</p>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">Rol: {user.role}</span>
                </div>
              </div>

              <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
                {navItems.map((item) => {
                  const isAllowed = item.roles.includes(userRole);
                  if (!isAllowed) return null;

                  const Icon = item.icon;
                  const isActive = activeTab === item.id;

                  return (
                    <button
                      key={item.id}
                      onClick={() => {
                        setActiveTab(item.id);
                        setSidebarOpen(false);
                      }}
                      className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                        isActive
                          ? 'glass-nav-active text-indigo-700 dark:text-indigo-400'
                          : 'hover:bg-white/35 dark:hover:bg-slate-800/30 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                      }`}
                    >
                      <Icon className="w-4 h-4 shrink-0" />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </nav>

              <div className="p-4 border-t border-white/20 dark:border-slate-800/40">
                <button
                  onClick={() => {
                    handleLogout();
                    setSidebarOpen(false);
                  }}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2.5 bg-white/30 dark:bg-slate-800/20 hover:bg-rose-50/50 dark:hover:bg-rose-950/20 text-slate-500 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 rounded-xl text-xs font-bold transition-all border border-white/30 dark:border-slate-800/40 cursor-pointer"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Cerrar Sesión</span>
                </button>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* 3. MAIN WORKSPACE */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative z-10">
        {/* Top Header Bar */}
        <header className="bg-white/30 dark:bg-[#090d16]/35 backdrop-blur-md border-b border-white/20 dark:border-slate-800/40 h-16 flex items-center justify-between px-6 shrink-0 lg:px-8">
          <div className="flex items-center gap-3 lg:hidden">
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-1.5 text-slate-600 dark:text-slate-300 hover:bg-white/50 dark:hover:bg-slate-800/50 rounded-lg transition-colors cursor-pointer"
            >
              <Menu className="w-5.5 h-5.5" />
            </button>
            <span className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-wider font-sans">
              SalesPro v2
            </span>
          </div>

          <div className="hidden lg:flex items-center gap-2">
            <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 font-mono uppercase bg-white/50 dark:bg-slate-800/30 border border-white/30 dark:border-slate-700/20 px-2.5 py-0.5 rounded-full">
              Status: En Línea
            </span>
            <span className="text-slate-300 dark:text-slate-700">|</span>
            <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">
              Fecha Local: {new Date().toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-right">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-200 block leading-tight">{user.fullName}</span>
              <span className="text-[9px] bg-emerald-50/80 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-900/50 text-emerald-600 dark:text-emerald-400 px-1.5 py-0.2 rounded font-bold font-mono uppercase">
                {user.role}
              </span>
            </div>
          </div>
        </header>

        {/* Scrollable Work Container */}
        <main className="flex-1 overflow-y-auto p-6 lg:p-8">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18 }}
              className="max-w-7xl mx-auto h-full"
            >
              <ErrorBoundary key={activeTab}>
                {renderTabContent()}
              </ErrorBoundary>
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}