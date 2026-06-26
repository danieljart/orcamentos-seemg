import { supabase } from './supabase';

export interface User {
  id: string;
  email: string;
  nome: string;
  crea: string;
  sre?: string;
}

export interface Workbook {
  id: string;
  user_id: string;
  escola: string;
  cod_escola: string;
  municipio: string;
  sre: string;
  servicos: string;
  iss: string;
  engenheiro?: string;
  crea?: string;
  data_elaboracao?: string;
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
}

export const db = {
  auth: {
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
    signUp: async (email: string, password: string, nome: string, crea: string): Promise<User | null> => {
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { nome, crea },
          emailRedirectTo: 'https://orcamentos-seemg.netlify.app'
        }
      });
      if (authError) throw authError;
      
      if (!authData.user) return null;
      
      // Attempt to return the user from public.users if the trigger already ran, otherwise construct a temporary one
      const { data } = await supabase.from('users').select('*').eq('id', authData.user.id).single();
      return data || { id: authData.user.id, email, nome, crea };
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
    }
  }
};
