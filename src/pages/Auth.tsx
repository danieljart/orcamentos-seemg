import { useState } from 'react';
import { FileSpreadsheet, Lock, Mail, User as UserIcon, Award, Fingerprint } from 'lucide-react';
import { db } from '../services/db';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export function Auth() {
  const [isRegistering, setIsRegistering] = useState(false);
  const [nome, setNome] = useState('');
  const [crea, setCrea] = useState('');
  const [sre, setSre] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccessMessage('');

    try {
      if (isRegistering && (!nome || !crea || !sre || !email || !password)) {
        throw new Error('Preencha todos os campos obrigatórios para cadastro.');
      }
      
      const finalEmail = (email.includes('@') && !isRegistering) ? email.trim() : `${email.split('@')[0].trim()}@educacao.mg.gov.br`;
      
      let user;
      if (isRegistering) {
        user = await db.auth.signUp(finalEmail, password, nome, crea, sre);
        if (user) {
          setSuccessMessage('Cadastro realizado! Verifique a caixa de entrada do seu e-mail para confirmar a conta.');
          setIsRegistering(false);
          return;
        }
      } else {
        user = await db.auth.signIn(finalEmail, password);
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
    <div className="min-h-screen bg-slate-100 dark:bg-slate-800/50 flex flex-col justify-center items-center p-4">
      <div className="bg-white dark:bg-slate-800 max-w-md w-full rounded-2xl shadow-xl overflow-hidden border border-slate-200 dark:border-slate-700">
        <div className="bg-emerald-800 p-8 flex flex-col items-center justify-center text-white">
          <FileSpreadsheet size={48} className="text-emerald-300 mb-4" />
          <h1 className="text-2xl font-bold tracking-wide">Portal de Orçamentos SEE-MG</h1>
        </div>
        
        <div className="p-8">
          <div className="flex justify-center gap-4 mb-6">
            <button 
              type="button"
              className={`pb-2 px-1 text-sm font-medium transition-colors border-b-2 ${!isRegistering ? 'border-emerald-600 text-emerald-700' : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:text-slate-300'}`}
              onClick={() => { setIsRegistering(false); setError(''); setSuccessMessage(''); }}
            >
              Login
            </button>
            <button 
              type="button"
              className={`pb-2 px-1 text-sm font-medium transition-colors border-b-2 ${isRegistering ? 'border-emerald-600 text-emerald-700' : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:text-slate-300'}`}
              onClick={() => { setIsRegistering(true); setError(''); setSuccessMessage(''); }}
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

            {successMessage && (
              <div className="bg-emerald-50 text-emerald-600 p-3 rounded-lg text-sm border border-emerald-100">
                {successMessage}
              </div>
            )}
            
            {isRegistering && (
              <>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Nome Completo (Engenheiro)</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <UserIcon size={16} className="text-slate-400" />
                    </div>
                    <input
                      type="text"
                      required={isRegistering}
                      maxLength={100}
                      className="w-full pl-10 pr-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none transition-shadow"
                      placeholder="Nome do Engenheiro(a)"
                      value={nome}
                      onChange={e => setNome(e.target.value)}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Registro CREA</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Award size={16} className="text-slate-400" />
                    </div>
                    <input
                      type="text"
                      required={isRegistering}
                      className="w-full pl-10 pr-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none transition-shadow"
                      placeholder="Número do CREA"
                      value={crea}
                      onChange={e => setCrea(e.target.value)}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">SRE</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none z-10">
                      <Award size={16} className="text-slate-400" />
                    </div>
                    <Select value={sre} onValueChange={setSre} required={isRegistering}>
                      <SelectTrigger className="w-full pl-10 pr-3 h-[42px] border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none bg-white dark:bg-slate-800">
                        <SelectValue placeholder="Selecione a SRE" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Órgão Central">Órgão Central</SelectItem>
                        <SelectItem value="SRE Almenara">SRE Almenara</SelectItem>
                        <SelectItem value="SRE Araçuaí">SRE Araçuaí</SelectItem>
                        <SelectItem value="SRE Barbacena">SRE Barbacena</SelectItem>
                        <SelectItem value="SRE Campo Belo">SRE Campo Belo</SelectItem>
                        <SelectItem value="SRE Carangola">SRE Carangola</SelectItem>
                        <SelectItem value="SRE Caratinga">SRE Caratinga</SelectItem>
                        <SelectItem value="SRE Caxambu">SRE Caxambu</SelectItem>
                        <SelectItem value="SRE Conselheiro Lafaiete">SRE Conselheiro Lafaiete</SelectItem>
                        <SelectItem value="SRE Coronel Fabriciano">SRE Coronel Fabriciano</SelectItem>
                        <SelectItem value="SRE Curvelo">SRE Curvelo</SelectItem>
                        <SelectItem value="SRE Diamantina">SRE Diamantina</SelectItem>
                        <SelectItem value="SRE Divinópolis">SRE Divinópolis</SelectItem>
                        <SelectItem value="SRE Governador Valadares">SRE Governador Valadares</SelectItem>
                        <SelectItem value="SRE Guanhães">SRE Guanhães</SelectItem>
                        <SelectItem value="SRE Itajubá">SRE Itajubá</SelectItem>
                        <SelectItem value="SRE Ituiutaba">SRE Ituiutaba</SelectItem>
                        <SelectItem value="SRE Janaúba">SRE Janaúba</SelectItem>
                        <SelectItem value="SRE Januária">SRE Januária</SelectItem>
                        <SelectItem value="SRE Juiz De Fora">SRE Juiz De Fora</SelectItem>
                        <SelectItem value="SRE Leopoldina">SRE Leopoldina</SelectItem>
                        <SelectItem value="SRE Manhuaçu">SRE Manhuaçu</SelectItem>
                        <SelectItem value="SRE Metropolitana A">SRE Metropolitana A</SelectItem>
                        <SelectItem value="SRE Metropolitana B">SRE Metropolitana B</SelectItem>
                        <SelectItem value="SRE Metropolitana C">SRE Metropolitana C</SelectItem>
                        <SelectItem value="SRE Monte Carmelo">SRE Monte Carmelo</SelectItem>
                        <SelectItem value="SRE Montes Claros">SRE Montes Claros</SelectItem>
                        <SelectItem value="SRE Muriaé">SRE Muriaé</SelectItem>
                        <SelectItem value="SRE Nova Era">SRE Nova Era</SelectItem>
                        <SelectItem value="SRE Ouro Preto">SRE Ouro Preto</SelectItem>
                        <SelectItem value="SRE Paracatu">SRE Paracatu</SelectItem>
                        <SelectItem value="SRE Pará De Minas">SRE Pará De Minas</SelectItem>
                        <SelectItem value="SRE Passos">SRE Passos</SelectItem>
                        <SelectItem value="SRE Patos De Minas">SRE Patos De Minas</SelectItem>
                        <SelectItem value="SRE Patrocínio">SRE Patrocínio</SelectItem>
                        <SelectItem value="SRE Pirapora">SRE Pirapora</SelectItem>
                        <SelectItem value="SRE Ponte Nova">SRE Ponte Nova</SelectItem>
                        <SelectItem value="SRE Pouso Alegre">SRE Pouso Alegre</SelectItem>
                        <SelectItem value="SRE Poços De Caldas">SRE Poços De Caldas</SelectItem>
                        <SelectItem value="SRE Sete Lagoas">SRE Sete Lagoas</SelectItem>
                        <SelectItem value="SRE São João Del Rei">SRE São João Del Rei</SelectItem>
                        <SelectItem value="SRE São Sebastião Do Paraíso">SRE São Sebastião Do Paraíso</SelectItem>
                        <SelectItem value="SRE Teófilo Otoni">SRE Teófilo Otoni</SelectItem>
                        <SelectItem value="SRE Uberaba">SRE Uberaba</SelectItem>
                        <SelectItem value="SRE Uberlândia">SRE Uberlândia</SelectItem>
                        <SelectItem value="SRE Ubá">SRE Ubá</SelectItem>
                        <SelectItem value="SRE Unaí">SRE Unaí</SelectItem>
                        <SelectItem value="SRE Varginha">SRE Varginha</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </>
            )}

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">E-mail Institucional</label>
              <div className="relative flex items-stretch">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none z-10">
                  <Mail size={16} className="text-slate-400" />
                </div>
                <input
                  type="text"
                  required
                  className={`w-full pl-10 pr-3 py-2 border border-slate-300 dark:border-slate-600 focus:ring-2 focus:ring-emerald-500 outline-none transition-shadow ${(!email.includes('@') || isRegistering) ? 'rounded-l-lg' : 'rounded-lg'}`}
                  placeholder="nome.sobrenome"
                  value={email}
                  onChange={e => {
                    const val = e.target.value;
                    setEmail(isRegistering ? val.replace(/@.*$/, '') : val);
                  }}
                />
                {(!email.includes('@') || isRegistering) && (
                  <span className="flex items-center px-3 bg-slate-100 dark:bg-slate-800/50 border border-l-0 border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-400 text-sm rounded-r-lg font-medium whitespace-nowrap">
                    @educacao.mg.gov.br
                  </span>
                )}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Senha</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock size={16} className="text-slate-400" />
                </div>
                <input
                  type="password"
                  required
                  className="w-full pl-10 pr-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none transition-shadow"
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
            
            <div className="relative my-4">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-300 dark:border-slate-600"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400">Ou continuar com</span>
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
              className="w-full bg-white dark:bg-slate-800 hover:bg-slate-50 dark:bg-slate-900/50 text-slate-700 dark:text-slate-300 font-medium py-2 px-4 border border-slate-300 dark:border-slate-600 rounded-lg shadow-sm flex justify-center items-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
              Google
            </button>

            {!isRegistering && (
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
            )}
            
          </form>
          </div>
        </div>
        
        <div className="mt-8 text-center text-[10px] text-slate-400 dark:text-slate-500 flex flex-col items-center gap-1">
          <a href="https://danieljardim3d.netlify.app" target="_blank" rel="noopener noreferrer" className="font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors">Desenvolvido por D de Design</a>
          <a href="mailto:d.de.design1809@gmail.com" className="hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors">d.de.design1809@gmail.com</a>
        </div>
      </div>
    );
  }
