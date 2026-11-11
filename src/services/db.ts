import { supabase } from './supabase';

export interface User {
  id: string;
  email: string;
  nome: string;
  crea: string;
  sre?: string;
  total?: number;
  finalizado?: number;
  revisao?: number;
  andamento?: number;
}

export interface Workbook {
  id: string;
  user_id: string;
  valor_total?: number;
  escola: string;
  cod_escola: string;
  municipio: string;
  sre: string;
  servicos: string;
  iss: string;
  base_precos?: string;
  engenheiro?: string;
  crea?: string;
  data_elaboracao?: string;
  rev?: string;
  status?: string;
  /** Free-form notes/scratch calculations, kept out of the exported sheet and PDF. */
  observacoes?: string;
  created_at: string;
  updated_at: string;
}

export interface WorkbookItem {
  id: string;
  workbook_id: string;
  item_code: string;
  quantity: string;
  memory: string;
  location: string;
}

export interface WorkbookVersion {
  id: string;
  workbook_id: string;
  created_at: string;
  items_json: string;
  name?: string;
}

export interface WorkbookMember {
  user_id: string;
  nome: string;
  email: string;
  role: 'leitor' | 'editor';
  created_at: string;
}

export type SharingErrorKind =
  | 'forbidden'      // caller is not the owner
  | 'not_found'      // no user registered with that e-mail
  | 'invalid'        // refused by the rules (sharing with yourself, role unavailable)
  | 'unavailable'    // database/sharing.sql has not been run on this project yet
  | 'unknown';

export class SharingError extends Error {
  kind: SharingErrorKind;
  constructor(kind: SharingErrorKind, message: string) {
    super(message);
    this.name = 'SharingError';
    this.kind = kind;
  }
}

/**
 * Maps what the share_workbook() function raises onto something the UI can
 * branch on. Codes are the ones declared in database/sharing.sql; the
 * "unavailable" ones are what PostgREST answers when a function or table does
 * not exist, i.e. the migration has not been applied.
 */
function toSharingError(error: { code?: string; message?: string; status?: number }): SharingError {
  switch (error.code) {
    case '42501': return new SharingError('forbidden', error.message || 'Sem permissão');
    case 'P0002': return new SharingError('not_found', error.message || 'Usuário não encontrado');
    case '22023': return new SharingError('invalid', error.message || 'Pedido inválido');
    case 'PGRST202': // function not found in the schema cache
    case 'PGRST205': // table not found in the schema cache
    case '42883':    // undefined_function
    case '42P01':    // undefined_table
      return new SharingError('unavailable', 'O compartilhamento ainda não foi habilitado no banco de dados.');
    default:
      return new SharingError('unknown', error.message || 'Erro ao compartilhar');
  }
}

export const db = {
  auth: {
    /**
     * Id of the signed-in user, read from the session rather than from the
     * users table, so it is available even when the profile row is missing.
     */
    getUserId: async (): Promise<string | null> => {
      const { data: { session } } = await supabase.auth.getSession();
      return session ? session.user.id : null;
    },
    getUser: async (): Promise<User | null> => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return null;
      
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', session.user.id)
        .single();
        
      if (error) return null;
      return data as User;
    },
    signUp: async (email: string, password: string, nome: string, crea: string, sre: string): Promise<User | null> => {
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { nome, crea, sre },
          emailRedirectTo: 'https://orcamentos-seemg.netlify.app'
        }
      });
      if (authError) throw authError;
      
      if (!authData.user) return null;
      
      // Attempt to return the user from public.users if the trigger already ran, otherwise construct a temporary one
      const { data } = await supabase.from('users').select('*').eq('id', authData.user.id).single();
      return data || { id: authData.user.id, email, nome, crea, sre };
    },
    signIn: async (email: string, password: string): Promise<User> => {
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (authError) throw authError;

      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', authData.user.id)
        .single();
        
      if (error) throw error;
      return data as User;
    },
    signInWithGoogle: async (): Promise<void> => {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: 'https://orcamentos-seemg.netlify.app',
          queryParams: {
            prompt: 'select_account',
            hd: 'educacao.mg.gov.br'
          }
        }
      });
      if (error) throw error;
    },
    signInWithPasskey: async (): Promise<User> => {
      const { data: authData, error: authError } = await supabase.auth.signInWithPasskey();
      if (authError) throw authError;

      if (!authData?.user) throw new Error("Usuário não encontrado");

      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', authData.user.id)
        .single();
        
      if (error) throw error;
      return data as User;
    },
    registerPasskey: async (): Promise<void> => {
      const { error } = await supabase.auth.registerPasskey();
      if (error) throw error;
    },
    listPasskeys: async (): Promise<any[]> => {
      const result = await supabase.auth.passkey.list();
      if (result.error) throw result.error;
      return result.data || [];
    },
    updateUser: async (data: Partial<User>): Promise<User> => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Usuário não logado");
      
      const { data: updated, error } = await supabase
        .from('users')
        .update(data)
        .eq('id', session.user.id)
        .select()
        .single();
        
      if (error) throw error;
      return updated as User;
    },
    updatePassword: async (password: string): Promise<void> => {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
    },
    signOut: async () => {
      await supabase.auth.signOut();
    }
  },
  workbooks: {
    list: async (): Promise<Workbook[]> => {
      const { data, error } = await supabase
        .from('workbooks')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as Workbook[];
    },
    get: async (id: string): Promise<Workbook | null> => {
      const { data, error } = await supabase
        .from('workbooks')
        .select('*')
        .eq('id', id)
        .single();
      if (error && error.code !== 'PGRST116') throw error;
      return data as Workbook | null;
    },
    create: async (data: Omit<Workbook, 'id' | 'created_at' | 'updated_at'>): Promise<Workbook> => {
      const { data: newWb, error } = await supabase
        .from('workbooks')
        .insert([data])
        .select()
        .single();
      if (error) throw error;
      return newWb as Workbook;
    },
    update: async (id: string, data: Partial<Workbook>): Promise<Workbook | null> => {
      const { data: updatedWb, error } = await supabase
        .from('workbooks')
        .update({ ...data, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return updatedWb as Workbook;
    },
    delete: async (id: string): Promise<void> => {
      const { error } = await supabase
        .from('workbooks')
        .delete()
        .eq('id', id);
      if (error) throw error;
    }
  },
  items: {
    list: async (workbook_id: string): Promise<WorkbookItem[]> => {
      const { data, error } = await supabase
        .from('workbook_items')
        .select('*')
        .eq('workbook_id', workbook_id);
      if (error) throw error;
      return (data || []) as WorkbookItem[];
    },
    saveAll: async (workbook_id: string, itemsData: Omit<WorkbookItem, 'id' | 'workbook_id'>[]): Promise<void> => {
      await supabase.from('workbook_items').delete().eq('workbook_id', workbook_id);
      
      if (itemsData.length > 0) {
        const newItems = itemsData.map(item => ({ ...item, workbook_id }));
        const { error } = await supabase.from('workbook_items').insert(newItems);
        if (error) throw error;
      }
    }
  },
  versions: {
    list: async (workbook_id: string): Promise<WorkbookVersion[]> => {
      const { data, error } = await supabase
        .from('workbook_versions')
        .select('*')
        .eq('workbook_id', workbook_id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as WorkbookVersion[];
    },
    create: async (workbook_id: string, items: any[]): Promise<WorkbookVersion> => {
      const newVersion = {
        workbook_id,
        items_json: items // JSONB no Supabase
      };
      
      const { data, error } = await supabase
        .from('workbook_versions')
        .insert([newVersion])
        .select()
        .single();
      if (error) throw error;
      return data as WorkbookVersion;
    },
    update: async (id: string, data: Partial<WorkbookVersion>): Promise<WorkbookVersion> => {
      const { data: updatedVersion, error } = await supabase
        .from('workbook_versions')
        .update(data)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return updatedVersion as WorkbookVersion;
    },
    delete: async (id: string): Promise<void> => {
      const { error } = await supabase
        .from('workbook_versions')
        .delete()
        .eq('id', id);
      if (error) throw error;
    }
  },
  sharing: {
    /** Members of a workbook. Only the owner gets rows back. */
    list: async (workbook_id: string): Promise<WorkbookMember[]> => {
      const { data, error } = await supabase.rpc('list_workbook_members', { p_workbook_id: workbook_id });
      if (error) throw toSharingError(error);
      return (data || []) as WorkbookMember[];
    },
    /** Gives the user with this e-mail read access to the workbook. */
    share: async (workbook_id: string, email: string): Promise<WorkbookMember> => {
      const { data, error } = await supabase.rpc('share_workbook', {
        p_workbook_id: workbook_id,
        p_email: email,
        p_role: 'leitor',
      });
      if (error) throw toSharingError(error);
      return { ...(data as Omit<WorkbookMember, 'created_at'>), created_at: new Date().toISOString() };
    },
    /** The owner revokes someone's access, or a member leaves a shared workbook. */
    remove: async (workbook_id: string, user_id: string): Promise<void> => {
      const { error } = await supabase
        .from('workbook_members')
        .delete()
        .eq('workbook_id', workbook_id)
        .eq('user_id', user_id);
      if (error) throw toSharingError(error);
    },
    /** Owner name for each workbook that was shared with the current user. */
    ownerNames: async (workbook_ids: string[]): Promise<Record<string, string>> => {
      if (workbook_ids.length === 0) return {};
      const { data, error } = await supabase.rpc('shared_owner_names', { p_workbook_ids: workbook_ids });
      // The names only decorate the card, so a database that has not been
      // migrated yet must not stop the dashboard from loading.
      if (error || !data) return {};
      return Object.fromEntries((data as { workbook_id: string; owner_nome: string }[]).map(r => [r.workbook_id, r.owner_nome]));
    },
  }
};
