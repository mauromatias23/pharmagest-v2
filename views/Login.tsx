
import React, { useState } from 'react';
import { User, UserRole } from '../types';
import { Lock, User as UserIcon, ShieldCheck, CloudCheck, HardDrive } from 'lucide-react';
import { isSupabaseConfigured } from '../services/supabaseClient';

interface LoginProps {
  users: User[];
  onLogin: (user: User) => void;
}

const Login: React.FC<LoginProps> = ({ users, onLogin }) => {
  const [selectedUserId, setSelectedUserId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUserId) {
      setError('Por favor, selecione um utilizador.');
      return;
    }
    
    const user = users.find(u => u.id === selectedUserId);
    if (!user) return;

    if (!user.active) {
      setError('Esta conta está desativada.');
      return;
    }

    // Validação de senhas conforme pedido
    let isValid = false;
    if (user.password !== undefined) {
      isValid = password === user.password;
    } else {
      if (user.name === 'Administrador' && password === '1111') isValid = true;
      else if (user.name === 'Funcionario 1' && password === '2222') isValid = true;
      else if (user.name === 'Funcionario 2' && password === '3333') isValid = true;
      else if (password === 'admin123') isValid = true; // Senha padrão para novos utilizadores
    }

    if (isValid) {
      onLogin(user);
    } else {
      setError('Senha incorreta para este utilizador.');
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-2xl overflow-hidden border border-slate-800/20">
        <div className="p-10 bg-emerald-600 text-white text-center relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-full opacity-10 pointer-events-none">
            <div className="absolute -top-10 -left-10 w-40 h-40 bg-white rounded-full blur-3xl"></div>
            <div className="absolute -bottom-10 -right-10 w-40 h-40 bg-white rounded-full blur-3xl"></div>
          </div>
          
          <div className="relative z-10">
            <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center mx-auto mb-4 backdrop-blur-md shadow-inner">
              <ShieldCheck className="w-10 h-10" />
            </div>
            <h1 className="text-2xl font-black tracking-tight">Farmácia Bermat</h1>
            <p className="text-emerald-50 text-xs font-medium mt-1 opacity-90 uppercase tracking-widest">Acesso ao Sistema</p>
          </div>
        </div>
        
        <form onSubmit={handleLogin} className="p-8 space-y-6 text-center">
          {error && (
            <div className="p-3 bg-red-50 text-red-600 text-[11px] font-bold rounded-xl border border-red-100 flex items-center justify-center gap-2 text-center animate-in slide-in-from-top-2">
              <div className="w-5 h-5 bg-red-100 rounded-full flex items-center justify-center text-red-600 shrink-0">!</div>
              <span className="text-center">{error}</span>
            </div>
          )}

          <div className="space-y-1.5 text-center">
            <label className="block text-xs font-black text-slate-700 uppercase tracking-widest text-center">Utilizador</label>
            <div className="relative">
              <UserIcon className="absolute left-3.5 top-3.5 w-5 h-5 text-slate-400" />
              <select 
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(e.target.value)}
                className="w-full px-10 py-3 border rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 bg-slate-50 outline-none transition-all appearance-none font-medium text-slate-700 text-center text-center-last"
              >
                <option value="" className="text-center">Selecione o seu nome...</option>
                {users.map(u => (
                  <option key={u.id} value={u.id} className="text-center">{u.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-1.5 text-center">
            <label className="block text-xs font-black text-slate-700 uppercase tracking-widest text-center">Palavra-passe</label>
            <div className="relative">
              <Lock className="absolute left-3.5 top-3.5 w-5 h-5 text-slate-400" />
              <input 
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••"
                className="w-full px-10 py-3 border rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 bg-slate-50 outline-none transition-all font-mono text-center tracking-widest placeholder:text-center"
              />
            </div>
          </div>

          <button 
            type="submit"
            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-black py-4 rounded-xl transition-all shadow-xl shadow-emerald-600/30 uppercase tracking-widest text-xs active:scale-[0.98] text-center flex items-center justify-center"
          >
            Entrar no Sistema
          </button>

          <div className="text-center pt-2">
            <p className="text-[10px] text-emerald-600 font-bold uppercase tracking-widest flex items-center justify-center gap-1.5 text-center">
              {isSupabaseConfigured() ? (
                <>
                  <CloudCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span className="text-center">Sincronização Automática com Supabase Ativa</span>
                </>
              ) : (
                <>
                  <HardDrive className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span className="text-center">Modo Local - IndexedDB Ativo</span>
                </>
              )}
            </p>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Login;
