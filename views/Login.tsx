import React, { useState } from 'react';
import { User, UserRole } from '../types';
import { ShieldCheck, CloudCheck, HardDrive, Eye, EyeOff, AlertCircle } from 'lucide-react';
import { isSupabaseConfigured } from '../services/supabaseClient';
import { INITIAL_USERS } from '../services/mockData';
import { AuthVault } from '../services/authVault';
import { db } from '../services/db';

interface LoginProps {
  users: User[];
  onLogin: (user: User) => void;
}

const Login: React.FC<LoginProps> = ({ users, onLogin }) => {
  // Garante que a lista de utilizadores nunca está vazia e está enriquecida com o cofre de credenciais
  const baseUsers = (users && users.length > 0) ? users : INITIAL_USERS;
  const effectiveUsers = AuthVault.enrichUsersWithVault(baseUsers);

  const [selectedUserId, setSelectedUserId] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!selectedUserId) {
      setError('Por favor, selecione o seu utilizador na lista.');
      return;
    }
    
    const user = effectiveUsers.find(u => u.id === selectedUserId);
    if (!user) {
      setError('Utilizador selecionado não foi encontrado.');
      return;
    }

    // Se a conta estiver desativada (exceto administrador que nunca é bloqueado)
    if (user.active === false && user.role !== UserRole.ADMIN && user.id !== 'u-admin') {
      setError('Esta conta está desativada. Contacte o Administrador da farmácia.');
      return;
    }

    const isValid = AuthVault.verifyPassword(user, password);

    if (isValid) {
      // Reativa automaticamente caso o admin estivesse marcado como inativo
      if (user.active === false) {
        user.active = true;
      }
      
      // Guarda a credencial no AuthVault para persistência garantida
      const trimmedInput = password.trim();
      if (trimmedInput !== '') {
        user.password = trimmedInput;
        user.passwordUpdatedAt = Date.now();
        AuthVault.saveCredential(user);
        db.users.put(user).catch(() => {});
      }

      onLogin(user);
    } else {
      setError('Palavra-passe incorreta. Por favor verifique os dados introduzidos.');
    }
  };

  return (
    <div id="login-container" className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div id="login-card" className="max-w-md w-full bg-white rounded-2xl shadow-2xl overflow-hidden border border-slate-800/20 text-center">
        <div id="login-header" className="p-10 bg-emerald-600 text-white text-center relative overflow-hidden flex flex-col items-center justify-center">
          <div className="absolute top-0 left-0 w-full h-full opacity-10 pointer-events-none">
            <div className="absolute -top-10 -left-10 w-40 h-40 bg-white rounded-full blur-3xl"></div>
            <div className="absolute -bottom-10 -right-10 w-40 h-40 bg-white rounded-full blur-3xl"></div>
          </div>
          
          <div className="relative z-10 flex flex-col items-center justify-center text-center w-full">
            <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center mx-auto mb-4 backdrop-blur-md shadow-inner">
              <ShieldCheck className="w-10 h-10 text-white" />
            </div>
            <h1 className="text-2xl font-black tracking-tight text-center w-full">Farmácia Bermat</h1>
            <p className="text-emerald-50 text-xs font-medium mt-1 opacity-90 uppercase tracking-widest text-center w-full">Acesso ao Sistema</p>
          </div>
        </div>
        
        <form onSubmit={handleLogin} className="p-8 space-y-5 text-center flex flex-col items-center w-full">
          {error && (
            <div id="login-error-alert" className="w-full p-3.5 bg-amber-50 text-amber-800 text-xs font-bold rounded-xl border border-amber-200 flex items-center justify-center gap-2 text-center animate-in slide-in-from-top-2">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="w-full space-y-1.5 text-center flex flex-col items-center">
            <label className="block w-full text-xs font-black text-slate-700 uppercase tracking-widest text-center">
              Utilizador
            </label>
            <div className="relative w-full">
              <select 
                id="login-user-select"
                value={selectedUserId}
                onChange={(e) => {
                  setSelectedUserId(e.target.value);
                  setError('');
                }}
                className="w-full px-4 py-3.5 border rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 bg-slate-50 outline-none transition-all font-medium text-slate-700 text-center [text-align-last:center]"
                style={{ textAlign: 'center', textAlignLast: 'center' }}
              >
                <option value="" className="text-center">-- Selecione o seu utilizador --</option>
                {effectiveUsers.map(u => (
                  <option key={u.id} value={u.id} className="text-center">
                    {u.name} ({u.role === UserRole.ADMIN ? 'Administrador' : 'Operador de Caixa'})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="w-full space-y-1.5 text-center flex flex-col items-center">
            <div className="w-full flex justify-between items-center px-1">
              <label className="text-xs font-black text-slate-700 uppercase tracking-widest text-left">
                Palavra-passe
              </label>
            </div>
            <div className="relative w-full">
              <input 
                id="login-password-input"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError('');
                }}
                placeholder="Introduza a sua palavra-passe"
                className="w-full pl-10 pr-10 py-3.5 border rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 bg-slate-50 outline-none transition-all font-mono text-center tracking-widest placeholder:text-center placeholder:text-xs placeholder:font-sans placeholder:tracking-normal"
                style={{ textAlign: 'center' }}
              />
              <button
                id="login-toggle-password"
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
                title={showPassword ? "Ocultar palavra-passe" : "Ver palavra-passe"}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <button 
            id="login-submit-button"
            type="submit"
            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-black py-4 rounded-xl transition-all shadow-xl shadow-emerald-600/30 uppercase tracking-widest text-xs active:scale-[0.98] text-center flex items-center justify-center cursor-pointer"
          >
            Entrar no Sistema
          </button>

          <div className="w-full text-center pt-2 flex flex-col items-center justify-center gap-2">
            <p className="text-[10px] text-emerald-600 font-bold uppercase tracking-widest flex items-center justify-center gap-1.5 text-center w-full mt-1">
              {isSupabaseConfigured() ? (
                <>
                  <CloudCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span className="text-center">Sincronização em Nuvem Ativa</span>
                </>
              ) : (
                <>
                  <HardDrive className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span className="text-center">Modo Local - Armazenamento Seguro</span>
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
