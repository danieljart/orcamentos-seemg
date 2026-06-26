import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileSpreadsheet, Lock, Mail, User as UserIcon, Award, Fingerprint } from 'lucide-react';
import { db } from '../services/db';

export function Auth() {
  const [isRegistering, setIsRegistering] = useState(false);
  const [nome, setNome] = useState('');
  const [crea, setCrea] = useState('');
  const [sre, setSre] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');


  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      if (isRegistering && (!nome || !crea || !sre)) {
        throw new Error('Preencha os campos obrigatórios para cadastro.');
      }
      
      let user;
      if (isRegistering) {
        user = await db.auth.signUp(email, password, nome, crea, sre);
        if (user) {
          setError('Cadastro realizado! Verifique seu e-mail para confirmar a conta (caso exigido) ou clique em Entrar.');
          return;
        }
      } else {
        user = await db.auth.signIn(email, password);
        if (user) {
          window.location.href = '/dashboard';
        }
      }
    } catch (err: any) {
      setError(err.message || 'Erro de autenticação');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col justify-center items-center p-4">
      <div className="bg-white max-w-md w-full rounded-2xl shadow-xl overflow-hidden border border-slate-200">
        <div className="bg-emerald-800 p-8 flex flex-col items-center justify-center text-white">
          <FileSpreadsheet size={48} className="text-emerald-300 mb-4" />
          <h1 className="text-2xl font-bold tracking-wide">Orçamentos SEEMG</h1>
          <p className="text-emerald-200/80 text-sm mt-2">Sistema de Gerenciamento na Nuvem</p>
        </div>
        
        <div className="p-8">
          <div className="flex justify-center gap-4 mb-6">
            <button 
              type="button"
              className={`pb-2 px-1 text-sm font-medium transition-colors border-b-2 ${!isRegistering ? 'border-emerald-600 text-emerald-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
              onClick={() => { setIsRegistering(false); setError(''); }}
            >
              Login
            </button>
            <button 
              type="button"
              className={`pb-2 px-1 text-sm font-medium transition-colors border-b-2 ${isRegistering ? 'border-emerald-600 text-emerald-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
              onClick={() => { setIsRegistering(true); setError(''); }}
            >
              Criar Conta
            </button>
          </div>

          <form onSubmit={handleAuth} className="space-y-4">
            {error && (
              <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm border border-red-100">
                {error}
              </div>
            )}
            
            {isRegistering && (
              <>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Nome Completo (Engenheiro)</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <UserIcon size={16} className="text-slate-400" />
                    </div>
                    <input
                      type="text"
                      required={isRegistering}
                      maxLength={100}
                      className="w-full pl-10 pr-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none transition-shadow"
                      placeholder="Nome do Engenheiro(a)"
                      value={nome}
                      onChange={e => setNome(e.target.value)}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Registro CREA</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Award size={16} className="text-slate-400" />
                    </div>
                    <input
                      type="text"
                      required={isRegistering}
                      className="w-full pl-10 pr-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none transition-shadow"
                      placeholder="Número do CREA"
                      value={crea}
                      onChange={e => setCrea(e.target.value)}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">SRE</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Award size={16} className="text-slate-400" />
                    </div>
                    <select
                      required={isRegistering}
                      className="w-full pl-10 pr-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none transition-shadow bg-white appearance-none"
                      value={sre}
                      onChange={e => setSre(e.target.value)}
                    >
                      <option value="" disabled>Selecione a SRE</option>
                      <option value="SRE Metropolitana A">SRE Metropolitana A</option>
                      <option value="SRE Metropolitana B">SRE Metropolitana B</option>
                      <option value="SRE Metropolitana C">SRE Metropolitana C</option>
                      <option value="SRE Caxambu">SRE Caxambu</option>
                      <option value="SRE Carangola">SRE Carangola</option>
                      <option value="SRE Varginha">SRE Varginha</option>
                      <option value="SRE Uberlândia">SRE Uberlândia</option>
                      <option value="SRE Montes Claros">SRE Montes Claros</option>
                      <option value="SRE Governador Valadares">SRE Governador Valadares</option>
                    </select>
                  </div>
                </div>
              </>
            )}

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">E-mail</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Mail size={16} className="text-slate-400" />
                </div>
                <input
                  type="email"
                  required
                  className="w-full pl-10 pr-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none transition-shadow"
                  placeholder="seu@email.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Senha</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock size={16} className="text-slate-400" />
                </div>
                <input
                  type="password"
                  required
                  className="w-full pl-10 pr-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none transition-shadow"
                  placeholder="••••••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2 px-4 rounded-lg transition-colors mt-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Aguarde...' : isRegistering ? 'Criar Conta' : 'Entrar com E-mail'}
            </button>
            
            {!isRegistering && (
              <>
                <div className="relative my-4">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-slate-300"></div>
                  </div>
                  <div className="relative flex justify-center text-sm">
                    <span className="px-2 bg-white text-slate-500">Ou continuar com</span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={async () => {
                    try {
                      setLoading(true);
                      await db.auth.signInWithGoogle();
                    } catch (err: any) {
                      setError(err.message || 'Erro ao entrar com Google');
                      setLoading(false);
                    }
                  }}
                  disabled={loading}
                  className="w-full bg-white hover:bg-slate-50 text-slate-700 font-medium py-2 px-4 border border-slate-300 rounded-lg shadow-sm flex justify-center items-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                  </svg>
                  Google
                </button>

                <button
                  type="button"
                  onClick={async () => {
                    try {
                      setLoading(true);
                      const u = await db.auth.signInWithPasskey();
                      if (u) {
                        window.location.href = '/dashboard';
                      }
                    } catch (err: any) {
                      setError(err.message || 'Erro ao entrar com Passkey');
                      setLoading(false);
                    }
                  }}
                  disabled={loading}
                  className="w-full bg-slate-900 hover:bg-slate-800 text-white font-medium py-2 px-4 border border-transparent rounded-lg shadow-sm flex justify-center items-center gap-2 transition-colors mt-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Fingerprint size={20} />
                  Entrar com Passkey
                </button>
              </>
            )}
            
            <p className="text-xs text-center text-slate-500 mt-4">
              {isRegistering 
                ? 'Para testar, preencha todos os campos e use qualquer senha.' 
                : 'Para testar, use qualquer e-mail e senha cadastrados. (Mock DB)'}
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
