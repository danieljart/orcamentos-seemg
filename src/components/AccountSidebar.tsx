import { useState, useEffect, useCallback } from 'react';
import { User as UserIcon, Save, HardHat, Fingerprint, X, LogOut } from 'lucide-react';
import { db } from '../services/db';
import type { User } from '../services/db';

interface AccountSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  onLogout: () => void;
}

export function AccountSidebar({ isOpen, onClose, onLogout }: AccountSidebarProps) {
  const [nome, setNome] = useState('');
  const [crea, setCrea] = useState('');
  const [sre, setSre] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [hasPasskey, setHasPasskey] = useState(false);
  
  const [toast, setToast] = useState<{message: string, type: 'success' | 'error'} | null>(null);

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const loadUser = useCallback(async () => {
    const u = await db.auth.getUser();
    if (u) {
      setNome(u.nome || '');
      setCrea(u.crea || '');
      setSre(u.sre || '');
      setEmail(u.email || '');
      
      try {
        const passkeys = await db.auth.listPasskeys();
        setHasPasskey(passkeys.length > 0);
      } catch (err) {
        // ignore
      }
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      loadUser();
    }
  }, [isOpen, loadUser]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const updates: Partial<User> = { nome, crea, sre, email };
      await db.auth.updateUser(updates);
      showToast("Dados atualizados com sucesso!", "success");
      setSenha('');
    } catch (error) {
      console.error(error);
      showToast("Erro ao atualizar dados.", "error");
    }
  };

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-40 transition-opacity"
          onClick={onClose}
        />
      )}
      
      {/* Sidebar */}
      <div 
        className={`fixed top-0 right-0 h-full w-full sm:w-96 bg-white shadow-2xl z-50 transform transition-transform duration-300 ease-in-out flex flex-col ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}
      >
        {/* TOAST */}
        {toast && (
          <div className={`absolute top-4 left-4 right-4 px-4 py-3 rounded-xl shadow-lg flex items-center justify-center gap-3 animate-in slide-in-from-top-2 z-50 ${toast.type === 'success' ? 'bg-emerald-800 text-white' : 'bg-red-600 text-white'}`}>
            <span className="font-medium text-sm text-center">{toast.message}</span>
          </div>
        )}

        <div className="flex items-center justify-between p-6 border-b border-slate-100 bg-emerald-50/50 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center shadow-inner">
              <UserIcon size={20} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-800">Minha Conta</h2>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors">
            <X size={24} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          <form onSubmit={handleSave} className="p-6 space-y-6">
            
            {(!crea || !sre) && (
              <div className="bg-amber-50 text-amber-800 border border-amber-200 p-4 rounded-xl flex items-start gap-3">
                <svg className="w-5 h-5 mt-0.5 text-amber-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <div>
                  <h4 className="font-bold text-sm">Complete seu perfil</h4>
                  <p className="text-xs mt-1">Preencha seu CREA e SRE para conseguir gerar orçamentos corretamente.</p>
                </div>
              </div>
            )}

            <div className="space-y-4">
              <h3 className="text-base font-bold text-slate-800 flex items-center gap-2 border-b border-slate-100 pb-2">
                <HardHat size={18} className="text-emerald-600" />
                Dados Profissionais
              </h3>
              
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Nome Completo do Engenheiro</label>
                <input
                  type="text"
                  required
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all text-slate-700 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Registro no CREA</label>
                <input
                  type="text"
                  required
                  value={crea}
                  onChange={(e) => setCrea(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all text-slate-700 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">SRE</label>
                <input
                  type="text"
                  value={sre}
                  onChange={(e) => setSre(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all text-slate-700 text-sm"
                />
              </div>
            </div>

            <div className="space-y-4 pt-4">
              <h3 className="text-base font-bold text-slate-800 flex items-center gap-2 border-b border-slate-100 pb-2">
                <UserIcon size={18} className="text-emerald-600" />
                Dados de Acesso
              </h3>
              
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">E-mail</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all text-slate-700 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Nova Senha (opcional)</label>
                <input
                  type="password"
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all text-slate-700 text-sm"
                />
              </div>
            </div>

            {!hasPasskey && (
              <div className="space-y-4 pt-4">
                <h3 className="text-base font-bold text-slate-800 flex items-center gap-2 border-b border-slate-100 pb-2">
                  <Fingerprint size={18} className="text-emerald-600" />
                  Acesso por Biometria
                </h3>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await db.auth.registerPasskey();
                      showToast('Dispositivo registrado com sucesso!', 'success');
                      setHasPasskey(true);
                    } catch (err: any) {
                      showToast(err.message || 'Erro ao registrar', 'error');
                    }
                  }}
                  className="flex items-center justify-center gap-2 w-full px-4 py-2 bg-slate-900 text-white text-sm font-bold rounded-lg hover:bg-slate-800 transition-colors shadow-sm active:scale-[0.98]"
                >
                  <Fingerprint size={16} />
                  Registrar este dispositivo
                </button>
              </div>
            )}

            <div className="pt-6">
              <button
                type="submit"
                className="w-full flex justify-center items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white py-3 rounded-xl font-bold shadow-md hover:shadow-lg transition-all active:scale-[0.98]"
              >
                <Save size={20} />
                Salvar Alterações
              </button>
            </div>

          </form>
        </div>

        {/* Footer with Logout */}
        <div className="p-6 border-t border-slate-100 bg-slate-50 shrink-0 mb-safe">
          <button 
            onClick={onLogout}
            className="w-full flex items-center justify-center gap-2 text-red-600 hover:text-white hover:bg-red-600 border border-red-200 px-4 py-3 rounded-xl font-bold transition-colors shadow-sm"
          >
            <LogOut size={20} />
            Sair da Conta
          </button>
        </div>

      </div>
    </>
  );
}
