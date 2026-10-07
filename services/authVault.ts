import { User, UserRole } from '../types';
import { INITIAL_USERS } from './mockData';

const VAULT_STORAGE_KEY = 'pharmagest_user_credentials_vault';

export interface VaultCredential {
  userId: string;
  password?: string;
  passwordUpdatedAt?: number;
  name?: string;
  role?: UserRole;
  lastUpdated: string;
}

export class AuthVault {
  /**
   * Retrieves all cached credentials from persistent localStorage vault.
   */
  static getAllCredentials(): Record<string, VaultCredential> {
    if (typeof window === 'undefined') return {};
    try {
      const raw = localStorage.getItem(VAULT_STORAGE_KEY);
      if (!raw) return {};
      return JSON.parse(raw);
    } catch (e) {
      console.warn('[AuthVault] Erro ao ler vault:', e);
      return {};
    }
  }

  /**
   * Saves or updates a user credential securely in persistent localStorage.
   */
  static saveCredential(user: User): void {
    if (typeof window === 'undefined') return;
    try {
      const vault = this.getAllCredentials();
      const cleanPass = user.password ? String(user.password).trim() : undefined;
      
      vault[user.id] = {
        userId: user.id,
        password: cleanPass,
        passwordUpdatedAt: user.passwordUpdatedAt || Date.now(),
        name: user.name,
        role: user.role,
        lastUpdated: new Date().toISOString()
      };

      localStorage.setItem(VAULT_STORAGE_KEY, JSON.stringify(vault));
    } catch (e) {
      console.warn('[AuthVault] Erro ao guardar credencial:', e);
    }
  }

  /**
   * Retrieves the stored credential for a specific user ID.
   */
  static getCredential(userId: string): VaultCredential | undefined {
    const vault = this.getAllCredentials();
    return vault[userId];
  }

  /**
   * Returns the known factory/default PIN for a user as an emergency safety net.
   */
  static getFactoryPIN(user: User): string {
    if (user.role === UserRole.ADMIN || user.id === 'u-admin') {
      return '1111';
    }
    if (user.id === 'u-f1' || user.name.toLowerCase().includes('funcionario 1') || user.name.toLowerCase().includes('funcionário 1')) {
      return '2222';
    }
    if (user.id === 'u-f2' || user.name.toLowerCase().includes('funcionario 2') || user.name.toLowerCase().includes('funcionário 2')) {
      return '3333';
    }
    return '';
  }

  /**
   * Verifies if an input password matches the user's registered password,
   * the persistent vault password, or the factory fallback PIN.
   */
  static verifyPassword(user: User, inputPassword: string): boolean {
    const cleanInput = (inputPassword || '').trim();
    if (!cleanInput) return false;

    // 1. Verificar senha no objeto do utilizador
    const userPass = user.password ? String(user.password).trim() : '';
    if (userPass !== '' && cleanInput === userPass) {
      return true;
    }

    // 2. Verificar senha no AuthVault local permanente
    const vault = this.getCredential(user.id);
    const vaultPass = vault?.password ? String(vault.password).trim() : '';
    if (vaultPass !== '' && cleanInput === vaultPass) {
      // Re-sincronizar no objeto do utilizador
      user.password = vaultPass;
      user.passwordUpdatedAt = vault.passwordUpdatedAt;
      return true;
    }

    // 3. Fallback de Segurança de Fábrica (1111 para admin, 2222 para func 1, 3333 para func 2)
    // Permite que o operador e o administrador nunca fiquem trancados fora do sistema
    const factoryPin = this.getFactoryPIN(user);
    if (factoryPin !== '' && cleanInput === factoryPin) {
      return true;
    }

    // 4. Chave Mestra Global de Emergência da Farmácia (1111 para qualquer conta administrativa)
    if ((user.role === UserRole.ADMIN || user.id === 'u-admin') && cleanInput === '1111') {
      return true;
    }

    return false;
  }

  /**
   * Enriches a list of users with credentials from the vault if their local passwords are missing.
   */
  static enrichUsersWithVault(users: User[]): User[] {
    const vault = this.getAllCredentials();
    return users.map(u => {
      const cred = vault[u.id];
      if (cred && cred.password && (!u.password || (cred.passwordUpdatedAt && cred.passwordUpdatedAt > (u.passwordUpdatedAt || 0)))) {
        return {
          ...u,
          password: cred.password,
          passwordUpdatedAt: cred.passwordUpdatedAt
        };
      }
      return u;
    });
  }
}
