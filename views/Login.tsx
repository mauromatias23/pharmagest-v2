
import React, { useState } from 'react';
import { User, UserRole } from '../types';
import { Lock, User as UserIcon, ShieldCheck, CloudCheck, HardDrive, Eye, EyeOff } from 'lucide-react';
import { isSupabaseConfigured } from '../services/supabaseClient';
import { INITIAL_USERS } from '../services/mockData';

interface LoginProps {
  users: User[];
  onLogin: (user: User) => void;
}

const Login: React.FC<LoginProps> = ({ users, onLogin }) => {
  // Garante que a lista de utilizadores nunca está vazia
  const effectiveUsers = (users && users.length > 0) ? users : INITIAL_USERS;

  const [selectedUserId, setSelectedUserId] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');

  // Validação segura de credenciais: a senha cadastrada do utilizador é estritamente exigida
  const checkPassword = (user: User, inputPass: string): boolean => {
    const cleanInput = (inputPass || '').trim();
    if (!cleanInput) return false;

    // 1. Verificar senha armazenada do utilizador
    const storedPass = (user.password !== undefined && user.password !== null) 
      ? String(user.password).trim() 
      : '';
    
    // Se o utilizador possui senha cadastrada, APENAS essa senha é válida
    if (storedPass !== '') {
      return cleanInput === storedPass;
    }

    // 2. Se e somente se o utilizador NUNCA tiver tido uma senha definida (primeiro acesso de fábrica):
    // Aceita a senha inicial padrão estritamente de acordo com o identificador
    if (user.role === UserRole.ADMIN || user.id === 'u-admin') {
      return cleanInput === '1111';
    }
    if (user.id === 'u-f1') {
      return cleanInput === '2222';
    }
    if (user.id === 'u-f2') {
      return cleanInput === '3333';
    }

    return false;
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!selectedUserId) {
      setError('Por favor, selecione um utilizador na lista.');
      return;
    }
    
    const user = effectiveUsers.find(u => u.id === selectedUserId);
    if (!user) {
      setError('Utilizador selecionado não foi encontrado.');
      return;
    }

    // Se for administrador, nunca bloqueia por segurança
    if (user.active === false && user.role !== UserRole.ADMIN && user.id !== 'u-admin') {
      setError('Esta conta está desativada. Contacte o Administrador.');
      return;
    }

    const isValid = checkPassword(user, password);

    if (isValid) {
      // Reativa automaticamente caso o admin estivesse marcado como inativo
      if (user.active === false) {
        user.active = true;
      }
      onLogin(user);
    } else {
      setError('Palavra-passe incorreta. Por favor, verifique os dados introduzidos.');
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
            <div id="login-error-alert" className="w-full p-3.5 bg-red-50 text-red-600 text-[11px] font-bold rounded-xl border border-red-100 flex items-center justify-center gap-2 text-center animate-in slide-in-from-top-2">
              <div className="w-5 h-5 bg-red-100 rounded-full flex items-center justify-center text-red-600 shrink-0 text-center font-black">!</div>
              <span className="text-center">{error}</span>
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
            <label className="block w-full text-xs font-black text-slate-700 uppercase tracking-widest text-center">
              Palavra-passe
            </label>
            <div className="relative w-full">
              <input 
                id="login-password-input"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError('');
                }}
                placeholder="Introduza a palavra-passe"
                className="w-full pl-10 pr-10 py-3.5 border rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 bg-slate-50 outline-none transition-all font-mono text-center tracking-widest placeholder:text-center placeholder:text-xs placeholder:font-sans placeholder:tracking-normal"
                style={{ textAlign: 'center' }}
              />
              <button
                id="login-toggle-password"
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
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

          <div className="w-full text-center pt-1 flex items-center justify-center">
            <p className="text-[10px] text-emerald-600 font-bold uppercase tracking-widest flex items-center justify-center gap-1.5 text-center w-full">
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
