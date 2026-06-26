import { useState } from 'react';

import { FileSpreadsheet, Lock, Mail, User as UserIcon, Award } from 'lucide-react';
import { db } from '../services/db';

export function Auth() {
  const [isRegistering, setIsRegistering] = useState(false);
  const [nome, setNome] = useState('');
  const [crea, setCrea] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');


  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      if (isRegistering && (!nome || !crea)) {
        throw new Error('Preencha os campos obrigatórios para cadastro.');
      }
      const user = await db.auth.signIn(email, isRegistering ? nome : '', isRegistering ? crea : '');
      if (user) {
        window.location.href = '/dashboard';
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
              {loading ? 'Aguarde...' : isRegistering ? 'Criar Conta' : 'Entrar'}
            </button>
            
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
