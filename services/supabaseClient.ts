import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let supabaseClientInstance: SupabaseClient | null = null;

const STORAGE_URL_KEY = 'pharma_supabase_url';
const STORAGE_ANON_KEY = 'pharma_supabase_anon_key';

/**
 * Checks if the Supabase URL and Anon Key are correctly configured.
 */
export function getCleanSupabaseUrl(): string {
  const customUrl = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_URL_KEY) : null;
  const rawUrl = (customUrl && customUrl.trim()) || import.meta.env.VITE_SUPABASE_URL || '';
  let cleanUrl = rawUrl.trim();
  
  // Remove trailing slashes
  while (cleanUrl.endsWith('/')) {
    cleanUrl = cleanUrl.slice(0, -1);
  }
  
  // Strip /rest/v1 if included by user copy-paste mistake
  if (cleanUrl.endsWith('/rest/v1')) {
    cleanUrl = cleanUrl.substring(0, cleanUrl.length - 8);
  }
  
  while (cleanUrl.endsWith('/')) {
    cleanUrl = cleanUrl.slice(0, -1);
  }
  
  return cleanUrl;
}

export function getCleanSupabaseAnonKey(): string {
  const customKey = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_ANON_KEY) : null;
  const rawKey = (customKey && customKey.trim()) || import.meta.env.VITE_SUPABASE_ANON_KEY || '';
  return rawKey.trim();
}

export function isSupabaseConfigured(): boolean {
  const url = getCleanSupabaseUrl();
  const anonKey = getCleanSupabaseAnonKey();
  
  return !!(
    url && 
    anonKey && 
    url !== 'your_supabase_url_here' && 
    anonKey !== 'your_supabase_anon_key_here' &&
    url.length > 0 &&
    anonKey.length > 0
  );
}

export function saveSupabaseCredentials(url: string, anonKey: string): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_URL_KEY, url.trim());
    localStorage.setItem(STORAGE_ANON_KEY, anonKey.trim());
    supabaseClientInstance = null; // force recreation
  }
}

export function clearSupabaseCredentials(): void {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(STORAGE_URL_KEY);
    localStorage.removeItem(STORAGE_ANON_KEY);
    supabaseClientInstance = null;
  }
}

/**
 * Returns the lazy-initialized Supabase Client.
 * If credentials are not set, returns null (enables graceful local-only mode).
 */
export function getSupabase(): SupabaseClient | null {
  if (!isSupabaseConfigured()) {
    return null;
  }
  
  if (!supabaseClientInstance) {
    const url = getCleanSupabaseUrl();
    const anonKey = getCleanSupabaseAnonKey();
    supabaseClientInstance = createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
      realtime: {
        params: {
          eventsPerSecond: 10
        }
      }
    });
  }
  
  return supabaseClientInstance;
}

export function isQuotaExceededError(err: any): boolean {
  if (!err) return false;
  let str = '';
  try {
    str = (typeof err === 'string' 
      ? err 
      : `${err.name || ''} ${err.message || ''} ${err.details || ''} ${err.hint || ''} ${err.code || ''} ${JSON.stringify(err)}`
    ).toLowerCase();
  } catch {
    str = String(err).toLowerCase();
  }
  
  return (
    str.includes('exceed_egress_quota') ||
    str.includes('spend caps') ||
    str.includes('spend cap') ||
    str.includes('restricted due to the following violations') ||
    str.includes('upgrade their plan') ||
    str.includes('exceeded its quota') ||
    str.includes('quota exceeded') ||
    str.includes('payment required') ||
    str.includes('failed to fetch') ||
    str.includes('networkerror') ||
    str.includes('network request failed') ||
    str.includes('load failed') ||
    str.includes('err_connection') ||
    str.includes('err_internet_disconnected') ||
    str.includes('typeerror') ||
    str.includes('fetch')
  );
}

export function isNetworkOrFetchError(err: any): boolean {
  if (!err) return false;
  const str = (typeof err === 'string' 
    ? err 
    : `${err.name || ''} ${err.message || ''} ${err.details || ''} ${err.hint || ''} ${err.code || ''}`
  ).toLowerCase();
  
  return (
    str.includes('failed to fetch') ||
    str.includes('networkerror') ||
    str.includes('network request failed') ||
    str.includes('load failed') ||
    str.includes('err_connection') ||
    str.includes('err_internet_disconnected') ||
    str.includes('typeerror: failed to fetch')
  );
}

export function safeUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    try {
      return crypto.randomUUID();
    } catch {
      // Fallback
    }
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Tests connection to the Supabase instance.
 */
export async function testSupabaseConnection(): Promise<{ success: boolean; message: string; isQuotaExceeded?: boolean }> {
  if (!isSupabaseConfigured()) {
    return { 
      success: false, 
      message: 'Supabase não está configurado. Por favor, adicione as chaves no arquivo .env ou no modal de configuração.' 
    };
  }

  const client = getSupabase();
  if (!client) {
    return { success: false, message: 'Falha ao inicializar o cliente Supabase.' };
  }

  try {
    // Attempt a simple lightweight select from the products table
    const { error } = await client.from('products').select('id').limit(1);
    if (error) {
      if (isQuotaExceededError(error)) {
        return {
          success: false,
          isQuotaExceeded: true,
          message: 'Aviso: O seu projeto do Supabase atingiu a quota de transferência gratuita (exceed_egress_quota). Aceda a supabase.com -> Project Settings -> Billing para remover o Spend Cap ou atualizar o plano. O sistema continuará a funcionar em modo offline local seguro.'
        };
      }

      // If table doesn't exist yet, it's actually a successful connection (credentials work),
      // but schema is missing.
      if (error.code === 'PGRST116' || error.message?.includes('does not exist')) {
        return { 
          success: true, 
          message: 'Conectado com sucesso! Observação: O esquema/tabelas ainda não foram criados no Supabase. Por favor, execute a migration SQL.' 
        };
      }
      return { success: false, message: `Erro de conexão: ${error.message} (Código: ${error.code})` };
    }
    return { success: true, message: 'Conectado com sucesso ao Supabase! Tabelas e conexões funcionando perfeitamente.' };
  } catch (err: any) {
    if (isQuotaExceededError(err)) {
      return {
        success: false,
        isQuotaExceeded: true,
        message: 'Aviso: O seu projeto do Supabase atingiu a quota de transferência gratuita (exceed_egress_quota). Aceda a supabase.com -> Project Settings -> Billing para remover o Spend Cap ou atualizar o plano.'
      };
    }
    return { success: false, message: `Erro de rede ou conexão: ${err?.message || err}` };
  }
}

