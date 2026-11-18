import { useEffect, useState } from 'react';
import { X, Upload, FileSpreadsheet, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';
import { SchoolSearch } from '../SchoolSearch';
import {
  AJUSTE_TIPOS, SUBTIPOS_AJUSTE, REFERENTE_OPCOES, OBJETO_OPCOES, tipoInfo, parseMoney, num, brl,
} from '../../lib/ajuste';
import type { AjusteData, AjusteItem, AjusteObjeto, AjusteTipo } from '../../lib/ajuste';
import { lerPlanilhaContrato } from '../../lib/ajusteImport';
import type { ContratoLido } from '../../lib/ajusteImport';

export interface DadosWorkbook {
  escola: string;
  cod_escola: string;
  municipio: string;
  sre: string;
  servicos: string;
  engenheiro: string;
  crea: string;
  data_elaboracao: string;
  base_precos: '2025' | '2026';
  status: string;
}

export interface DadosResultado {
  workbook: DadosWorkbook;
  data: AjusteData;
  /** Itens lidos da planilha de contrato escolhida no formulário (só na criação). */
  itensContrato?: AjusteItem[];
}

interface Props {
  open: boolean;
  mode: 'create' | 'edit';
  initialWorkbook: DadosWorkbook;
  initialData: AjusteData;
  userSre?: string;
  isSaving?: boolean;
  onSubmit: (r: DadosResultado) => void;
  onClose: () => void;
}

/** Campo de valor em reais que aceita "1.234,56" e mostra formatado ao sair. */
function MoneyInput({ value, onChange, placeholder }: { value: number; onChange: (n: number) => void; placeholder?: string }) {
  const [txt, setTxt] = useState(value ? num(value) : '');
  useEffect(() => { setTxt(value ? num(value) : ''); }, [value]);
  return (
    <input
      inputMode="decimal"
      value={txt}
      placeholder={placeholder || '0,00'}
      onChange={e => setTxt(e.target.value)}
      onBlur={() => { const n = parseMoney(txt); onChange(n); setTxt(n ? num(n) : ''); }}
      className={inputCls + ' text-right tabular-nums'}
    />
  );
}

/** Percentual digitado como "23,32" e guardado como 0,2332. */
function PercentInput({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const [txt, setTxt] = useState(value ? num(value * 100, 2) : '');
  useEffect(() => { setTxt(value ? num(value * 100, 2) : ''); }, [value]);
  return (
    <div className="relative">
      <input
        inputMode="decimal"
        value={txt}
        onChange={e => setTxt(e.target.value)}
        onBlur={() => { const n = parseMoney(txt) / 100; onChange(n); setTxt(n ? num(n * 100, 2) : ''); }}
        className={inputCls + ' text-right tabular-nums pr-8'}
      />
      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">%</span>
    </div>
  );
}

const inputCls = 'w-full h-10 px-3 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-sm text-slate-700 dark:text-slate-200 outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500';
const labelCls = 'block text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1';

function Campo({ label, children, className = '' }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className={labelCls}>{label}</span>
      {children}
    </label>
  );
}

export function AjusteDadosModal({ open, mode, initialWorkbook, initialData, userSre, isSaving, onSubmit, onClose }: Props) {
  const [wb, setWb] = useState<DadosWorkbook>(initialWorkbook);
  const [data, setData] = useState<AjusteData>(initialData);
  const [anteriores, setAnteriores] = useState('');
  const [contrato, setContrato] = useState<ContratoLido | null>(null);
  const [usarReal, setUsarReal] = useState(true);
  const [arquivo, setArquivo] = useState('');
  const [lendo, setLendo] = useState(false);
  const [erroArquivo, setErroArquivo] = useState('');

  useEffect(() => {
    if (!open) return;
    setWb(initialWorkbook);
    setData(initialData);
    setAnteriores(initialData.ajustesAnteriores.map(p => num(p * 100, 2)).join('; '));
    setContrato(null);
    setArquivo('');
    setErroArquivo('');
    // Recarrega só ao abrir; os valores iniciais mudam a cada render do pai.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const info = tipoInfo(data.tipo);
  const set = <K extends keyof AjusteData>(k: K, v: AjusteData[K]) => setData(d => ({ ...d, [k]: v }));
  const setW = <K extends keyof DadosWorkbook>(k: K, v: DadosWorkbook[K]) => setWb(w => ({ ...w, [k]: v }));
  const comMeta = data.subtipo === 'com_meta' || data.subtipo === 'com_meta_projeto';

  const lerArquivo = async (file: File) => {
    setLendo(true);
    setErroArquivo('');
    try {
      const lido = await lerPlanilhaContrato(file);
      setContrato(lido);
      setArquivo(file.name);
      if (lido.percentuais && lido.percentuais.length) {
        setAnteriores(prev => prev.trim() ? prev : lido.percentuais!.map(p => num(p * 100, 2)).join('; '));
      }
      // O que a planilha traz preenche o formulário, sem apagar o que já foi digitado.
      setData(d => ({
        ...d,
        tc: d.tc || lido.tc || '',
        valorTC: d.valorTC || lido.valorTC || 0,
        bdiObra: lido.bdiObra || d.bdiObra,
        bdiProjeto: lido.bdiProjeto || d.bdiProjeto,
        // O fator usa sempre o contrato original: num ajuste anterior ele está no quadro do rodapé.
        valorContratado: d.valorContratado || lido.valorContratado || lido.totalGeral || 0,
        numero: lido.formato === 'ajuste' && lido.numeroAjuste
          ? String((parseInt(lido.numeroAjuste, 10) || 0) + 1).padStart(2, '0')
          : d.numero,
      }));
    } catch (err: any) {
      setContrato(null);
      setErroArquivo(err?.message || 'Não foi possível ler a planilha.');
    } finally {
      setLendo(false);
    }
  };

  const enviar = (e: React.FormEvent) => {
    e.preventDefault();
    const ajustesAnteriores = anteriores
      .split(/[;\n]/)
      .map(s => s.trim())
      .filter(Boolean)
      .map(s => parseMoney(s.replace('%', '')) / 100);
    const itens = contrato ? (contrato.formato === 'ajuste' && usarReal && contrato.itensReal ? contrato.itensReal : contrato.itens) : undefined;
    onSubmit({ workbook: wb, data: { ...data, ajustesAnteriores }, itensContrato: itens });
  };

  return (
    <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-[70] flex items-start justify-center p-4 pt-[4vh] overflow-y-auto" onClick={onClose}>
      <form
        onSubmit={enviar}
        onClick={e => e.stopPropagation()}
        className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-3xl overflow-hidden border border-slate-200 dark:border-slate-700"
      >
        <div className="flex items-start justify-between gap-4 p-5 border-b border-slate-200 dark:border-slate-700">
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">{info.titulo}</div>
            <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100">{mode === 'create' ? 'Nova solicitação' : 'Dados da solicitação'}</h3>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200" aria-label="Fechar"><X size={20} /></button>
        </div>

        <div className="p-5 space-y-6 max-h-[70vh] overflow-y-auto">
          {mode === 'edit' && (
            <Campo label="Tipo de solicitação">
              <select value={data.tipo} onChange={e => set('tipo', e.target.value as AjusteTipo)} className={inputCls}>
                {AJUSTE_TIPOS.map(t => <option key={t.id} value={t.id}>{t.titulo}</option>)}
              </select>
            </Campo>
          )}

          <section className="space-y-3">
            <h4 className="text-sm font-bold text-slate-700 dark:text-slate-200">Escola e objeto</h4>
            <Campo label="Escola">
              <SchoolSearch
                userSre={userSre}
                value={wb.escola}
                onChange={v => setW('escola', v)}
                onSelect={esc => setWb(w => ({ ...w, escola: esc.nome, cod_escola: esc.codigo, municipio: esc.municipio, sre: esc.sre }))}
                placeholder="Buscar escola pelo nome, código ou município..."
              />
            </Campo>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Campo label="CODESC"><input value={wb.cod_escola} onChange={e => setW('cod_escola', e.target.value)} className={inputCls} /></Campo>
              <Campo label="Município"><input value={wb.municipio} onChange={e => setW('municipio', e.target.value)} className={inputCls} /></Campo>
              <Campo label="SRE"><input value={wb.sre} onChange={e => setW('sre', e.target.value)} className={inputCls} /></Campo>
            </div>
            <Campo label="Serviços (meta do Termo de Compromisso)">
              <input value={wb.servicos} onChange={e => setW('servicos', e.target.value)} className={inputCls} placeholder="Ex.: REFORMA DA COZINHA COM ADEQUAÇÃO À RDC 216" />
            </Campo>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Campo label="Objeto (planilha)">
                <select value={data.objeto} onChange={e => set('objeto', e.target.value as AjusteObjeto)} className={inputCls}>
                  {OBJETO_OPCOES.map(o => <option key={o}>{o}</option>)}
                </select>
              </Campo>
              <Campo label="Referente a">
                <select value={data.referente} onChange={e => set('referente', e.target.value)} className={inputCls}>
                  {REFERENTE_OPCOES.map(o => <option key={o}>{o}</option>)}
                </select>
              </Campo>
              <Campo label="Base de preços SEE">
                <select value={wb.base_precos} onChange={e => setW('base_precos', e.target.value as '2025' | '2026')} className={inputCls}>
                  <option value="2026">SEEMG Rev 00/2026</option>
                  <option value="2025">SEEMG Rev 01/2025</option>
                </select>
              </Campo>
            </div>
          </section>

          <section className="space-y-3">
            <h4 className="text-sm font-bold text-slate-700 dark:text-slate-200">Termo de Compromisso e contrato</h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Campo label="TC / PAC nº"><input value={data.tc} onChange={e => set('tc', e.target.value)} className={inputCls} placeholder="1023750/2024" /></Campo>
              <Campo label="Valor do TC (sem eng. fiscal)"><MoneyInput value={data.valorTC} onChange={n => set('valorTC', n)} /></Campo>
              <Campo label="Valor total contratado"><MoneyInput value={data.valorContratado} onChange={n => set('valorContratado', n)} placeholder="calculado da planilha" /></Campo>
              <Campo label="Valor liberado"><MoneyInput value={data.valorLiberado} onChange={n => set('valorLiberado', n)} /></Campo>
              <Campo label="BDI obra (contrato)"><PercentInput value={data.bdiObra} onChange={n => set('bdiObra', n)} /></Campo>
              <Campo label="BDI projeto (contrato)"><PercentInput value={data.bdiProjeto} onChange={n => set('bdiProjeto', n)} /></Campo>
            </div>
            {data.valorTC > 0 && data.valorContratado > 0 && (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Fator de desconto: <strong className="text-slate-700 dark:text-slate-200">{num(data.valorContratado / data.valorTC, 4)}</strong>, aplicado ao preço SEE dos serviços que não estão no contrato.
              </p>
            )}
          </section>

          <section className="space-y-3">
            <h4 className="text-sm font-bold text-slate-700 dark:text-slate-200">{info.alvo === 'recurso' ? 'Saldo' : 'Ajuste'}</h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {(data.tipo === 'ajuste' || data.tipo === 'saldo_complementar') && (
                <Campo label={data.tipo === 'ajuste' ? 'Ajuste nº' : 'Saldo nº'}><input value={data.numero} onChange={e => set('numero', e.target.value)} className={inputCls} /></Campo>
              )}
              <Campo label="Nº processo SEI desta solicitação"><input value={data.seiProcesso} onChange={e => set('seiProcesso', e.target.value)} className={inputCls} /></Campo>
              <Campo label="Nº SEI do atendimento inicial"><input value={data.seiInicial} onChange={e => set('seiInicial', e.target.value)} className={inputCls} /></Campo>
            </div>
            {data.tipo === 'ajuste' && (
              <Campo label="Tipo de ajuste">
                <select value={data.subtipo} onChange={e => set('subtipo', e.target.value)} className={inputCls}>
                  {SUBTIPOS_AJUSTE.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </Campo>
            )}
            {info.alvo === 'recurso' && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Campo label="Disponível em conta"><MoneyInput value={data.recursoEmConta} onChange={n => set('recursoEmConta', n)} /></Campo>
                <Campo label="Previsto no TC, a liberar"><MoneyInput value={data.recursoALiberar} onChange={n => set('recursoALiberar', n)} /></Campo>
                <Campo label="Aditivo de valor ao TC"><MoneyInput value={data.recursoAditivo} onChange={n => set('recursoAditivo', n)} /></Campo>
                <p className="sm:col-span-3 text-xs text-slate-500 dark:text-slate-400">
                  Recurso total: <strong className="text-slate-700 dark:text-slate-200">{brl(data.recursoEmConta + data.recursoALiberar + data.recursoAditivo)}</strong>. A marretada fecha o acréscimo neste valor.
                </p>
              </div>
            )}
            {data.tipo !== 'alteracao_projeto' && (
              <Campo label="Percentuais de ajustes/saldos anteriores já validados (%; separe por ;)">
                <input value={anteriores} onChange={e => setAnteriores(e.target.value)} className={inputCls} placeholder="Ex.: 12,50; 4,30" />
              </Campo>
            )}
            <Campo label="Meta do Termo de Compromisso">
              <textarea value={data.meta} onChange={e => set('meta', e.target.value)} rows={2} className={inputCls + ' h-auto py-2'} />
            </Campo>
            {comMeta && (
              <Campo label="Nova meta proposta">
                <textarea value={data.novaMeta} onChange={e => set('novaMeta', e.target.value)} rows={2} className={inputCls + ' h-auto py-2'} />
              </Campo>
            )}
          </section>

          <section className="space-y-3">
            <h4 className="text-sm font-bold text-slate-700 dark:text-slate-200">Responsável técnico</h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Campo label="Engenheiro(a)"><input value={wb.engenheiro} onChange={e => setW('engenheiro', e.target.value)} className={inputCls} /></Campo>
              <Campo label="CREA/CAU/CFT"><input value={wb.crea} onChange={e => setW('crea', e.target.value)} className={inputCls} /></Campo>
              <Campo label="Data da elaboração"><input type="date" value={wb.data_elaboracao} onChange={e => setW('data_elaboracao', e.target.value)} className={inputCls} /></Campo>
            </div>
            {mode === 'edit' && (
              <Campo label="Status">
                <select value={wb.status} onChange={e => setW('status', e.target.value)} className={inputCls}>
                  <option>Em andamento</option>
                  <option>Em revisão</option>
                  <option>Finalizado</option>
                </select>
              </Campo>
            )}
          </section>

          {mode === 'create' && (
            <section className="space-y-3">
              <h4 className="text-sm font-bold text-slate-700 dark:text-slate-200">Planilha de contrato</h4>
              <label className={`flex items-center gap-3 rounded-xl border-2 border-dashed p-4 cursor-pointer transition-colors ${contrato ? 'border-emerald-400 bg-emerald-50/60 dark:bg-emerald-950/20' : 'border-slate-300 dark:border-slate-600 hover:border-emerald-400'}`}>
                {lendo ? <Loader2 className="animate-spin text-emerald-600" size={22} /> : contrato ? <CheckCircle2 className="text-emerald-600" size={22} /> : <Upload className="text-slate-400" size={22} />}
                <div className="flex-1 min-w-0 text-sm">
                  {contrato ? (
                    <>
                      <div className="font-semibold text-slate-800 dark:text-slate-100 truncate"><FileSpreadsheet size={14} className="inline mr-1" />{arquivo}</div>
                      <div className="text-slate-500 dark:text-slate-400">
                        {contrato.formato === 'ajuste' ? 'Planilha de ajuste anterior' : 'Planilha de serviços'} · {(usarReal && contrato.itensReal ? contrato.itensReal : contrato.itens).length} serviços
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="font-semibold text-slate-700 dark:text-slate-200">Importar a planilha de contrato homologada (.xlsx)</div>
                      <div className="text-slate-500 dark:text-slate-400">Ou a planilha do ajuste anterior. Também dá para importar depois, no editor.</div>
                    </>
                  )}
                </div>
                <input type="file" accept=".xlsx,.xls" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) lerArquivo(f); e.target.value = ''; }} />
              </label>
              {erroArquivo && (
                <p className="flex items-start gap-2 text-sm text-rose-600 dark:text-rose-400"><AlertTriangle size={16} className="shrink-0 mt-0.5" />{erroArquivo}</p>
              )}
              {contrato?.formato === 'ajuste' && contrato.itensReal && (
                <div className="flex flex-col gap-1 text-sm text-slate-600 dark:text-slate-300">
                  <label className="flex items-center gap-2"><input type="radio" checked={usarReal} onChange={() => setUsarReal(true)} className="accent-emerald-600" /> Usar o REAL A EXECUTAR do ajuste anterior como contratado (próximo ajuste)</label>
                  <label className="flex items-center gap-2"><input type="radio" checked={!usarReal} onChange={() => setUsarReal(false)} className="accent-emerald-600" /> Usar a coluna CONTRATADO original</label>
                </div>
              )}
            </section>
          )}
        </div>

        <div className="flex justify-end gap-3 p-5 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-700 rounded-lg">Cancelar</button>
          <button
            type="submit"
            disabled={isSaving || !wb.escola.trim()}
            className="flex items-center gap-2 px-5 py-2 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg shadow-sm"
          >
            {isSaving && <Loader2 className="animate-spin" size={16} />}
            {mode === 'create' ? 'Criar e abrir' : 'Salvar dados'}
          </button>
        </div>
      </form>
    </div>
  );
}
