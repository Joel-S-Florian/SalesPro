import { NavLink } from 'react-router-dom';
import { ShieldAlert, ArrowLeft, Home } from 'lucide-react';

export default function Unauthorized() {
  return (
    <div className="min-h-screen relative flex flex-col justify-center items-center p-4 selection:bg-indigo-500 selection:text-white overflow-hidden">
      {/* Mesh Background */}
      <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden bg-[#f4f6fa] dark:bg-[#090d16]">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-indigo-200/35 dark:bg-indigo-950/20 blur-[120px]"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[60%] h-[60%] rounded-full bg-purple-200/25 dark:bg-purple-950/15 blur-[120px]"></div>
        <div className="absolute top-[30%] right-[10%] w-[35%] h-[35%] rounded-full bg-sky-200/35 dark:bg-sky-950/10 blur-[100px]"></div>
      </div>

      <div className="relative z-10 w-full max-w-md glass-card rounded-2xl p-8 space-y-6 text-center">
        <div className="space-y-3">
          <div className="bg-rose-50/80 dark:bg-rose-950/20 p-3.5 rounded-full w-16 h-16 mx-auto flex items-center justify-center border border-rose-200 dark:border-rose-900/50">
            <ShieldAlert className="w-8 h-8 text-rose-600 dark:text-rose-400" />
          </div>
          <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100 font-display">
            Acceso Denegado
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
            No tienes permisos para acceder a esta sección. Tu rol actual no tiene autorización para esta funcionalidad.
          </p>
        </div>

        <div className="p-3.5 bg-slate-50/50 dark:bg-slate-900/30 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-500 dark:text-slate-400 font-mono space-y-1">
          <p>Si crees que esto es un error, contacta al administrador del sistema.</p>
        </div>

        <div className="flex flex-col gap-3 pt-2">
          <NavLink
            to="/"
            className="flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-4 py-2.5 rounded-xl shadow-sm hover:shadow transition-all cursor-pointer"
          >
            <Home className="w-4 h-4" />
            Volver al Inicio
          </NavLink>
          <NavLink
            to="/pos"
            className="flex items-center justify-center gap-2 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 text-sm font-medium px-4 py-2.5 rounded-xl transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            Ir a POS
          </NavLink>
        </div>
      </div>
    </div>
  );
}