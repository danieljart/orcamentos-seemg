// Mock Database Service using LocalStorage
// This will be replaced by Supabase later

export interface User {
  id: string;
  email: string;
  nome: string;
  crea: string;
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
  items_json: string; // Serialized items at that time
}

// In-memory mock or localStorage based for prototyping
export const db = {
  auth: {
    getUser: async (): Promise<User | null> => {
      const u = localStorage.getItem('user');
      return u ? JSON.parse(u) : null;
    },
    signIn: async (email: string, nome: string, crea: string): Promise<User> => {
      let existingUser: User | null = null;
      try {
        const u = localStorage.getItem('user');
        if (u) existingUser = JSON.parse(u);
      } catch(e){}

      const user: User = { 
        id: existingUser?.id || (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2)), 
        email, 
        nome: nome || existingUser?.nome || '', 
        crea: crea || existingUser?.crea || ''
      };
      localStorage.setItem('user', JSON.stringify(user));
      return user;
    },
    updateUser: async (data: Partial<User>): Promise<User> => {
      const u = localStorage.getItem('user');
      if (!u) throw new Error("Usuário não logado");
      const user: User = JSON.parse(u);
      const updatedUser = { ...user, ...data };
      localStorage.setItem('user', JSON.stringify(updatedUser));
      return updatedUser;
    },
    signOut: async () => {
      localStorage.removeItem('user');
    }
  },
  workbooks: {
    list: async (): Promise<Workbook[]> => {
      const wbs = localStorage.getItem('workbooks');
      return wbs ? JSON.parse(wbs) : [];
    },
    get: async (id: string): Promise<Workbook | null> => {
      const wbs: Workbook[] = JSON.parse(localStorage.getItem('workbooks') || '[]');
      return wbs.find(w => w.id === id) || null;
    },
    create: async (data: Omit<Workbook, 'id' | 'created_at' | 'updated_at'>): Promise<Workbook> => {
      const wbs: Workbook[] = JSON.parse(localStorage.getItem('workbooks') || '[]');
      const newWb: Workbook = {
        ...data,
        id: crypto.randomUUID(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      wbs.push(newWb);
      localStorage.setItem('workbooks', JSON.stringify(wbs));
      return newWb;
    },
    update: async (id: string, data: Partial<Workbook>): Promise<Workbook | null> => {
      const wbs: Workbook[] = JSON.parse(localStorage.getItem('workbooks') || '[]');
      const index = wbs.findIndex(w => w.id === id);
      if (index === -1) return null;
      wbs[index] = { ...wbs[index], ...data, updated_at: new Date().toISOString() };
      localStorage.setItem('workbooks', JSON.stringify(wbs));
      return wbs[index];
    },
    delete: async (id: string): Promise<void> => {
      let wbs: Workbook[] = JSON.parse(localStorage.getItem('workbooks') || '[]');
      wbs = wbs.filter(w => w.id !== id);
      localStorage.setItem('workbooks', JSON.stringify(wbs));
      
      // Cascade delete items
      const allItemsString = localStorage.getItem('workbook_items');
      if (allItemsString) {
        let allItems: WorkbookItem[] = JSON.parse(allItemsString);
        allItems = allItems.filter(i => i.workbook_id !== id);
        localStorage.setItem('workbook_items', JSON.stringify(allItems));
      }

      // Cascade delete versions
      const allVersionsString = localStorage.getItem('workbook_versions');
      if (allVersionsString) {
        let allVersions: WorkbookVersion[] = JSON.parse(allVersionsString);
        allVersions = allVersions.filter(v => v.workbook_id !== id);
        localStorage.setItem('workbook_versions', JSON.stringify(allVersions));
      }
    }
  },
  items: {
    list: async (workbook_id: string): Promise<WorkbookItem[]> => {
      const allItems: WorkbookItem[] = JSON.parse(localStorage.getItem('workbook_items') || '[]');
      return allItems.filter(i => i.workbook_id === workbook_id);
    },
    saveAll: async (workbook_id: string, itemsData: Omit<WorkbookItem, 'id' | 'workbook_id'>[]): Promise<void> => {
      let allItems: WorkbookItem[] = JSON.parse(localStorage.getItem('workbook_items') || '[]');
      allItems = allItems.filter(i => i.workbook_id !== workbook_id);
      
      const newItems = itemsData.map(data => ({
        ...data,
        id: crypto.randomUUID(),
        workbook_id
      }));

      allItems.push(...newItems);
      localStorage.setItem('workbook_items', JSON.stringify(allItems));
    }
  },
  versions: {
    list: async (workbook_id: string): Promise<WorkbookVersion[]> => {
      const allVersions: WorkbookVersion[] = JSON.parse(localStorage.getItem('workbook_versions') || '[]');
      return allVersions.filter(v => v.workbook_id === workbook_id).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    },
    create: async (workbook_id: string, items: any[]): Promise<WorkbookVersion> => {
      const allVersions: WorkbookVersion[] = JSON.parse(localStorage.getItem('workbook_versions') || '[]');
      const newVersion: WorkbookVersion = {
        id: crypto.randomUUID(),
        workbook_id,
        created_at: new Date().toISOString(),
        items_json: JSON.stringify(items)
      };
      allVersions.push(newVersion);
      localStorage.setItem('workbook_versions', JSON.stringify(allVersions));
      return newVersion;
    }
  }
};
