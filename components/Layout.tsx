
import React from 'react';
import { User, UserRole } from '../types';
import { SupabaseSyncModal } from './SupabaseSyncModal';
import { isSupabaseConfigured } from '../services/supabaseClient';
import { 
  LayoutDashboard, 
  Package, 
  ShoppingCart, 
  FileBarChart, 
  Users, 
  History,
  LogOut, 
  Menu,
  User as UserIcon,
  Activity,
  Database
} from 'lucide-react';

interface LayoutProps {
  user: User;
  onLogout: () => void;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ user, onLogout, activeTab, setActiveTab, children }) => {
  const [isSidebarOpen, setIsSidebarOpen] = React.useState(true);
  const [isSupabaseModalOpen, setIsSupabaseModalOpen] = React.useState(false);
  const isSupabaseOnline = isSupabaseConfigured();

  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: [UserRole.ADMIN, UserRole.PHARMACIST, UserRole.CASHIER] },
    { id: 'billing', label: 'Vendas (POS)', icon: ShoppingCart, roles: [UserRole.ADMIN, UserRole.PHARMACIST, UserRole.CASHIER] },
    { id: 'inventory', label: 'Stock & Validades', icon: Package, roles: [UserRole.ADMIN, UserRole.PHARMACIST, UserRole.CASHIER] }, // Funcionários podem ver stock
    { id: 'reports', label: 'Relatórios', icon: FileBarChart, roles: [UserRole.ADMIN, UserRole.PHARMACIST] },
    { id: 'users', label: 'Utilizadores', icon: Users, roles: [UserRole.ADMIN] },
    { id: 'recovery_sales', label: 'Recuperar Vendas Antiga', icon: History, roles: [UserRole.ADMIN, UserRole.PHARMACIST, UserRole.CASHIER] },
  ];

  const allowedMenuItems = menuItems.filter(item => item.roles.includes(user.role));

  return (
    <div className="flex h-screen overflow-hidden print:h-auto print:min-h-0 print:overflow-visible print:block">
      {/* Sidebar */}
      <aside className={`bg-slate-900 text-white transition-all duration-300 flex flex-col ${isSidebarOpen ? 'w-64' : 'w-20'} no-print`}>
        <div className="p-6 flex items-center gap-3">
          <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center shadow-lg shadow-emerald-500/30 shrink-0">
            <Activity className="w-5 h-5 text-slate-950" />
          </div>
          {isSidebarOpen && <h1 className="font-black text-lg tracking-tight truncate">Farmácia Bermat</h1>}
        </div>

        <nav className="flex-1 mt-4 px-3 space-y-1">
          {allowedMenuItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl transition-all ${
                activeTab === item.id 
                ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/20 translate-x-1' 
                : 'hover:bg-slate-800 text-slate-400'
              }`}
            >
              <item.icon className="w-5 h-5 shrink-0" />
              {isSidebarOpen && <span className="font-bold text-sm tracking-tight truncate">{item.label}</span>}
            </button>
          ))}
        </nav>

        <div className="p-4 border-t border-slate-800 space-y-1">
          <button 
            onClick={() => setIsSupabaseModalOpen(true)}
            className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-emerald-400 hover:bg-emerald-500/10 transition-all text-left"
            title="Sincronização & Backup com Supabase"
          >
            <Database className="w-5 h-5 shrink-0 text-emerald-400" />
            {isSidebarOpen && (
              <div className="flex-1 truncate">
                <span className="font-bold text-sm block">Sincronização</span>
                <span className="text-[10px] text-emerald-500/80 block uppercase tracking-wider font-mono">Supabase Nuvem</span>
              </div>
            )}
          </button>

          <button 
            onClick={onLogout}
            className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-slate-400 hover:bg-red-500/10 hover:text-red-500 transition-all"
          >
            <LogOut className="w-5 h-5 shrink-0" />
            {isSidebarOpen && <span className="font-bold text-sm">Sair</span>}
          </button>
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-w-0 bg-slate-50 relative print:bg-white print:h-auto print:min-h-0 print:overflow-visible print:block">
        <header className="h-16 bg-white border-b flex items-center justify-between px-6 shrink-0 no-print">
          <div className="flex items-center gap-4">
            <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-2 hover:bg-slate-100 rounded-lg transition-colors">
              <Menu className="w-5 h-5 text-slate-600" />
            </button>
            <h2 className="text-sm font-black text-slate-800 uppercase tracking-widest">
              {menuItems.find(i => i.id === activeTab)?.label}
            </h2>
          </div>
          
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setIsSupabaseModalOpen(true)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest border transition-all cursor-pointer ${
                isSupabaseOnline 
                  ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-200 shadow-sm' 
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-500 border-slate-200'
              }`}
              title={isSupabaseOnline ? "Comunicação Automática Ativa - Dados sincronizados em tempo real com o Supabase" : "Supabase Inativo - Clique para Configurar"}
            >
              <Database className="w-3.5 h-3.5 text-emerald-600" />
              {isSupabaseOnline ? (
                <>
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                  <span className="hidden sm:inline">Nuvem Auto-Sincronizada</span>
                </>
              ) : (
                <span>Supabase Offline</span>
              )}
            </button>

            <div className="h-8 w-px bg-slate-200"></div>

            <div className="text-right hidden sm:block">
              <p className="text-sm font-black text-slate-800 leading-tight">{user.name}</p>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">{user.role}</p>
            </div>
            <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 border border-slate-200">
              <UserIcon className="w-5 h-5" />
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-6 print:p-0 print:overflow-visible print:h-auto print:block">
          {children}
        </div>
      </main>

      <SupabaseSyncModal 
        isOpen={isSupabaseModalOpen}
        onClose={() => setIsSupabaseModalOpen(false)}
        onSyncSuccess={() => {
          // Relouda os dados na UI chamando o reload se necessário
          window.location.reload();
        }}
      />
    </div>
  );
};

export default Layout;
