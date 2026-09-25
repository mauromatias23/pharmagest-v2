
import React, { useState } from 'react';
import { User, UserRole } from '../types';
import { Search, Plus, UserPlus, Shield, User as UserIcon, MoreVertical, Edit2, Trash2, X, CheckCircle2, AlertCircle, Key, Lock, Eye, EyeOff } from 'lucide-react';

interface UsersProps {
  users: User[];
  onAddUser: (user: User) => void;
  onUpdateUser: (user: User) => void;
  onDeleteUser: (userId: string) => void;
}

const Users: React.FC<UsersProps> = ({ users, onAddUser, onUpdateUser, onDeleteUser }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);

  // Password change states
  const [passwordModalUser, setPasswordModalUser] = useState<User | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Form states
  const [formData, setFormData] = useState({
    name: '',
    role: UserRole.CASHIER,
    active: true,
    password: ''
  });

  const [notification, setNotification] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 4000);
  };

  const handleOpenPasswordModal = (user: User) => {
    setPasswordModalUser(user);
    setNewPassword('');
    setConfirmPassword('');
    setShowPassword(false);
  };

  const handleSavePassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordModalUser) return;

    if (!newPassword.trim()) {
      showToast("Por favor, insira a nova palavra-passe.");
      return;
    }

    if (newPassword.trim() !== confirmPassword.trim()) {
      showToast("As palavras-passe não coincidem.");
      return;
    }

    onUpdateUser({
      ...passwordModalUser,
      password: newPassword.trim(),
      passwordUpdatedAt: Date.now()
    });

    const userName = passwordModalUser.name;
    setPasswordModalUser(null);
    showToast(`Palavra-passe do utilizador ${userName} alterada com sucesso!`);
  };

  const handleOpenModal = (user?: User) => {
    if (user) {
      setEditingUser(user);
      setFormData({
        name: user.name,
        role: user.role,
        active: user.active,
        password: user.password || ''
      });
    } else {
      setEditingUser(null);
      setFormData({
        name: '',
        role: UserRole.CASHIER,
        active: true,
        password: ''
      });
    }
    setShowModal(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name.trim()) {
      showToast("Por favor, insira o nome do utilizador.");
      return;
    }

    if (editingUser) {
      const isPassProvided = Boolean(formData.password && formData.password.trim() !== '');
      const finalPassword = isPassProvided 
        ? formData.password.trim() 
        : editingUser.password;
      onUpdateUser({
        ...editingUser,
        name: formData.name.trim(),
        role: formData.role,
        active: formData.active,
        password: finalPassword,
        passwordUpdatedAt: isPassProvided ? Date.now() : editingUser.passwordUpdatedAt
      });
      showToast(`Utilizador ${formData.name} atualizado com sucesso!`);
    } else {
      if (!formData.password.trim()) {
        showToast("Por favor, defina uma palavra-passe para o novo utilizador.");
        return;
      }
      const newUser: User = {
        id: `u-${Date.now()}`,
        name: formData.name.trim(),
        role: formData.role,
        active: formData.active,
        password: formData.password.trim(),
        passwordUpdatedAt: Date.now()
      };
      onAddUser(newUser);
      showToast(`Novo utilizador ${formData.name} cadastrado com sucesso!`);
    }
    
    setShowModal(false);
  };

  const filteredUsers = users.filter(u => 
    u.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.role.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getRoleIcon = (role: UserRole) => {
    switch (role) {
      case UserRole.ADMIN: return <Shield className="w-4 h-4 text-purple-500" />;
      case UserRole.PHARMACIST: return <CheckCircle2 className="w-4 h-4 text-emerald-500" />;
      case UserRole.CASHIER: return <UserIcon className="w-4 h-4 text-blue-500" />;
      default: return <UserIcon className="w-4 h-4 text-slate-400" />;
    }
  };

  const getRoleColor = (role: UserRole) => {
    switch (role) {
      case UserRole.ADMIN: return 'bg-purple-50 text-purple-700 border-purple-100';
      case UserRole.PHARMACIST: return 'bg-emerald-50 text-emerald-700 border-emerald-100';
      case UserRole.CASHIER: return 'bg-blue-50 text-blue-700 border-blue-100';
      default: return 'bg-slate-50 text-slate-700 border-slate-100';
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {notification && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-bold flex items-center justify-between shadow-sm animate-in slide-in-from-top-2">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{notification}</span>
          </div>
          <button onClick={() => setNotification(null)} className="text-emerald-600 hover:text-emerald-800">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="flex flex-col md:flex-row gap-4 items-center justify-between no-print">
        <div className="relative w-full md:w-96">
          <Search className="absolute left-3 top-3 w-5 h-5 text-slate-400" />
          <input 
            type="text"
            placeholder="Pesquisar utilizador..."
            className="w-full pl-10 pr-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none bg-white transition-all shadow-sm"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <button 
          onClick={() => handleOpenModal()}
          className="w-full md:w-auto flex items-center justify-center gap-2 px-6 py-2.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-all font-bold shadow-lg shadow-emerald-600/20 active:scale-95"
        >
          <UserPlus className="w-5 h-5" />
          Novo Utilizador
        </button>
      </div>

      <div className="bg-white border rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50 border-b text-xs font-black text-slate-500 uppercase tracking-widest">
                <th className="px-6 py-4">Utilizador</th>
                <th className="px-6 py-4">Cargo / Função</th>
                <th className="px-6 py-4">Estado</th>
                <th className="px-6 py-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-20 text-center">
                    <div className="flex flex-col items-center opacity-40">
                      <UserIcon className="w-12 h-12 mb-2 text-slate-300" />
                      <p className="text-slate-500 font-medium">Nenhum utilizador encontrado.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredUsers.map(user => (
                  <tr key={user.id} className="hover:bg-slate-50/50 transition-colors group">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-slate-100 border flex items-center justify-center text-slate-400 group-hover:bg-white transition-colors">
                          <UserIcon className="w-5 h-5" />
                        </div>
                        <div>
                          <p className="font-bold text-slate-800 leading-none">{user.name}</p>
                          <p className="text-[10px] text-slate-400 mt-1 uppercase font-bold tracking-tighter">ID: {user.id}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-black uppercase tracking-tighter ${getRoleColor(user.role)}`}>
                        {getRoleIcon(user.role)}
                        {user.role}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${user.active ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'}`}></div>
                        <span className={`text-xs font-bold ${user.active ? 'text-emerald-600' : 'text-slate-400'}`}>
                          {user.active ? 'Ativo' : 'Inativo'}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button 
                          onClick={() => handleOpenPasswordModal(user)}
                          className="p-2 text-slate-400 hover:text-amber-500 hover:bg-amber-50 rounded-lg transition-all"
                          title="Alterar Palavra-passe"
                        >
                          <Key className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => handleOpenModal(user)}
                          className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-all"
                          title="Editar utilizador"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => {
                            if(confirm(`Deseja realmente eliminar o utilizador ${user.name}?`)) onDeleteUser(user.id);
                          }}
                          className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                          title="Eliminar utilizador"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Adicionar/Editar */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-[100] animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden scale-in-95 animate-in">
            <div className="p-6 border-b bg-slate-50 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-xl text-slate-900">{editingUser ? 'Editar Utilizador' : 'Novo Utilizador'}</h3>
                <p className="text-xs text-slate-500 font-medium mt-0.5">Defina as permissões e dados de acesso.</p>
              </div>
              <button 
                onClick={() => setShowModal(false)} 
                className="p-2 hover:bg-slate-200 rounded-full transition-colors text-slate-400"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6 space-y-5">
              <div className="space-y-1.5">
                <label className="block text-xs font-black text-slate-700 uppercase tracking-widest">Nome Completo *</label>
                <div className="relative">
                  <UserIcon className="absolute left-3 top-3 w-5 h-5 text-slate-400" />
                  <input 
                    type="text" 
                    placeholder="Ex: João Silva" 
                    required
                    className="w-full pl-10 pr-4 py-3 border rounded-xl bg-slate-50 outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all text-sm font-medium"
                    value={formData.name}
                    onChange={(e) => setFormData({...formData, name: e.target.value})}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-black text-slate-700 uppercase tracking-widest">Função no Sistema *</label>
                <div className="relative">
                  <Shield className="absolute left-3 top-3 w-5 h-5 text-slate-400" />
                  <select 
                    required
                    className="w-full pl-10 pr-4 py-3 border rounded-xl bg-slate-50 outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all text-sm font-medium appearance-none"
                    value={formData.role}
                    onChange={(e) => setFormData({...formData, role: e.target.value as UserRole})}
                  >
                    <option value={UserRole.ADMIN}>{UserRole.ADMIN}</option>
                    <option value={UserRole.PHARMACIST}>{UserRole.PHARMACIST}</option>
                    <option value={UserRole.CASHIER}>{UserRole.CASHIER}</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-black text-slate-700 uppercase tracking-widest">
                  {editingUser ? 'Alterar Palavra-passe (Opcional)' : 'Palavra-passe *'}
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 w-5 h-5 text-slate-400" />
                  <input 
                    type="text" 
                    placeholder={editingUser ? "Deixe em branco para manter a senha atual" : "Defina a palavra-passe do utilizador"} 
                    required={!editingUser}
                    className="w-full pl-10 pr-4 py-3 border rounded-xl bg-slate-50 outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all text-sm font-medium"
                    value={formData.password}
                    onChange={(e) => setFormData({...formData, password: e.target.value})}
                  />
                </div>
              </div>

              <div className="p-4 bg-slate-50 rounded-xl flex items-center justify-between border border-slate-100">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center ${formData.active ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-200 text-slate-500'}`}>
                    <CheckCircle2 className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-800">Estado da Conta</p>
                    <p className="text-[10px] text-slate-500 font-medium">Utilizador pode aceder ao sistema</p>
                  </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={formData.active}
                    onChange={(e) => setFormData({...formData, active: e.target.checked})}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
                </label>
              </div>

              {!editingUser && (
                <div className="p-3 bg-emerald-50 text-emerald-800 text-[10px] font-bold rounded-lg flex items-start gap-2 border border-emerald-100">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>Segurança: A palavra-passe definida aqui será sincronizada com todos os computadores da farmácia.</span>
                </div>
              )}

              <div className="pt-4 flex gap-3">
                <button 
                  type="button"
                  onClick={() => setShowModal(false)} 
                  className="flex-1 py-3 bg-white border border-slate-200 rounded-xl font-bold text-slate-500 hover:bg-slate-50 transition-colors uppercase text-xs tracking-widest"
                >
                  Cancelar
                </button>
                <button 
                  type="submit"
                  className="flex-1 py-3 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 shadow-lg shadow-emerald-600/30 transition-all flex items-center justify-center gap-2 uppercase text-xs tracking-widest"
                >
                  {editingUser ? 'Atualizar Dados' : 'Criar Conta'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Alterar Palavra-passe Dedicado */}
      {passwordModalUser && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-[100] animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden scale-in-95 animate-in">
            <div className="p-6 border-b bg-slate-50 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-xl text-slate-900 flex items-center gap-2">
                  <Key className="w-5 h-5 text-amber-500" />
                  Alterar Palavra-passe
                </h3>
                <p className="text-xs text-slate-500 font-medium mt-0.5">
                  Alterar a senha de acesso para <strong>{passwordModalUser.name}</strong>.
                </p>
              </div>
              <button 
                onClick={() => setPasswordModalUser(null)} 
                className="p-2 hover:bg-slate-200 rounded-full transition-colors text-slate-400"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleSavePassword} className="p-6 space-y-5">
              <div className="space-y-1.5">
                <label className="block text-xs font-black text-slate-700 uppercase tracking-widest">Nova Palavra-passe *</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 w-5 h-5 text-slate-400" />
                  <input 
                    type={showPassword ? "text" : "password"} 
                    placeholder="Introduza a nova senha" 
                    required
                    className="w-full pl-10 pr-10 py-3 border rounded-xl bg-slate-50 outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all text-sm font-medium"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-3 text-slate-400 hover:text-slate-600"
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-black text-slate-700 uppercase tracking-widest">Confirmar Nova Palavra-passe *</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 w-5 h-5 text-slate-400" />
                  <input 
                    type={showPassword ? "text" : "password"} 
                    placeholder="Repita a nova senha" 
                    required
                    className="w-full pl-10 pr-10 py-3 border rounded-xl bg-slate-50 outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all text-sm font-medium"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                  />
                </div>
              </div>

              <div className="pt-4 flex gap-3">
                <button 
                  type="button"
                  onClick={() => setPasswordModalUser(null)} 
                  className="flex-1 py-3 bg-white border border-slate-200 rounded-xl font-bold text-slate-500 hover:bg-slate-50 transition-colors uppercase text-xs tracking-widest"
                >
                  Cancelar
                </button>
                <button 
                  type="submit"
                  className="flex-1 py-3 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 shadow-lg shadow-emerald-600/30 transition-all flex items-center justify-center gap-2 uppercase text-xs tracking-widest"
                >
                  Guardar Senha
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Users;
