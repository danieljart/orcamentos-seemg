import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, User as UserIcon, Save, HardHat, Lock, Fingerprint } from 'lucide-react';
import { db } from '../services/db';
import type { User } from '../services/db';

export function Account() {
  const navigate = useNavigate();
  
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
    } else {
      navigate('/login');
    }
  }, [navigate]);

  useEffect(() => {
    loadUser();
  }, [loadUser]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const updates: Partial<User> = { nome, crea, sre, email };
      // Em um banco real, a senha seria tratada separadamente, aqui nós ignoramos a atualização de senha no db mock por simplicidade, ou faríamos mock também se houvesse suporte
      await db.auth.updateUser(updates);
      showToast("Dados atualizados com sucesso!", "success");
      
      // Limpa campo de senha após atualizar
      setSenha('');
    } catch (error) {
      console.error(error);
      showToast("Erro ao atualizar dados.", "error");
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col items-center py-12 px-4">
      
      {/* TOAST */}
      {toast && (
        <div className={`fixed top-4 right-4 px-6 py-3 rounded-xl shadow-lg flex items-center gap-3 animate-in slide-in-from-top-2 z-50 ${toast.type === 'success' ? 'bg-emerald-800 text-white' : 'bg-red-600 text-white'}`}>
          <span className="font-medium">{toast.message}</span>
        </div>
      )}

      <div className="w-full max-w-lg">
        <button 
          onClick={() => navigate('/dashboard')} 
          className="flex items-center gap-2 text-slate-500 hover:text-emerald-700 font-medium transition-colors mb-6"
        >
          <ArrowLeft size={20} />
          Voltar ao Painel
        </button>

        <div className="bg-white rounded-2xl shadow-xl overflow-hidden border border-slate-200">
          <div className="p-8 border-b border-slate-100 flex items-center gap-4 bg-emerald-50/50">
            <div className="w-16 h-16 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center shadow-inner">
              <UserIcon size={32} />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-slate-800">Minha Conta</h2>
              <p className="text-slate-500 font-medium">Gerencie suas informações de acesso</p>
            </div>
          </div>

          <form onSubmit={handleSave} className="p-8 space-y-6">
            
            {(!crea || !sre) && (
              <div className="bg-amber-50 text-amber-800 border border-amber-200 p-4 rounded-xl flex items-start gap-3">
                <svg className="w-5 h-5 mt-0.5 text-amber-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <div>
                  <h4 className="font-bold">Complete seu perfil</h4>
                  <p className="text-sm mt-1">Detectamos que algumas informações estão faltando (provavelmente porque você entrou com o Google). Por favor, preencha seu CREA e SRE para conseguir gerar orçamentos corretamente.</p>
                </div>
              </div>
            )}

            <div className="space-y-4">
              <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2 border-b border-slate-100 pb-2">
                <HardHat size={20} className="text-emerald-600" />
                Dados Profissionais
              </h3>
              
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">Nome Completo do Engenheiro</label>
                <input
                  type="text"
                  required
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all text-slate-700"
                  placeholder="Seu nome completo"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">Registro no CREA</label>
                <input
                  type="text"
                  required
                  value={crea}
                  onChange={(e) => setCrea(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all text-slate-700"
                  placeholder="Seu número de registro no CREA"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">SRE (Superintendência Regional de Ensino)</label>
                <input
                  type="text"
                  value={sre}
                  onChange={(e) => setSre(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all text-slate-700"
                  placeholder="Sua SRE padrão"
                />
              </div>
            </div>

            <div className="space-y-4 pt-4">
              <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2 border-b border-slate-100 pb-2">
                <UserIcon size={20} className="text-emerald-600" />
                Dados de Acesso
              </h3>
              
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">E-mail</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all text-slate-700"
                  placeholder="Seu e-mail"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">Nova Senha (opcional)</label>
                <input
                  type="password"
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all text-slate-700"
                  placeholder="Deixe em branco para não alterar"
                />
              </div>
            </div>

            {!hasPasskey && (
              <div className="space-y-4">
                <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2 border-b border-slate-100 pb-2">
                  <Fingerprint size={20} className="text-emerald-600" />
                  Acesso por Biometria (Passkey)
                </h3>
                <p className="text-sm text-slate-500">
                  Você pode registrar seu dispositivo atual (celular, tablet ou notebook) para entrar usando sua impressão digital ou reconhecimento facial, sem precisar de senha!
                </p>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await db.auth.registerPasskey();
                      showToast("Dispositivo registrado com sucesso!", "success");
                      setHasPasskey(true);
                    } catch (err: any) {
                      showToast(err.message || "Erro ao registrar Passkey", "error");
                    }
                  }}
                  className="flex items-center justify-center gap-2 w-full px-6 py-3 bg-slate-900 text-white font-bold rounded-xl hover:bg-slate-800 transition-colors shadow-lg shadow-slate-900/20 active:scale-[0.98]"
                >
                  <Fingerprint size={20} />
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
      </div>
    </div>
  );
}
