import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileSpreadsheet, Search, Plus, LogOut, Upload, Clock, Zap, User as UserIcon, Trash2 } from 'lucide-react';
import { db } from '../services/db';
import type { Workbook, WorkbookVersion } from '../services/db';
import * as ExcelJS from 'exceljs';
import { QuickEstimateModal } from '../components/QuickEstimateModal';
import type { CartItem } from '../components/QuickEstimateModal';

export function Dashboard() {
  const [workbooks, setWorkbooks] = useState<Workbook[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isVersionsModalOpen, setIsVersionsModalOpen] = useState(false);
  const [isQuickEstimateOpen, setIsQuickEstimateOpen] = useState(false);
  const [pendingQuickItems, setPendingQuickItems] = useState<CartItem[] | null>(null);
  
  const [selectedWorkbook, setSelectedWorkbook] = useState<Workbook | null>(null);
  const [workbookVersions, setWorkbookVersions] = useState<WorkbookVersion[]>([]);
  
  const navigate = useNavigate();

  // Header form states
  const [formEscola, setFormEscola] = useState('');
  const [formCodEscola, setFormCodEscola] = useState('');
  const [formSRE, setFormSRE] = useState('METROPOLITANA B');
  const [formMunicipio, setFormMunicipio] = useState('');
  const [formISS, setFormISS] = useState('5');
  const [formServicos, setFormServicos] = useState('');
  const [formEngenheiro, setFormEngenheiro] = useState('');
  const [formCrea, setFormCrea] = useState('');
  const [formDataElaboracao, setFormDataElaboracao] = useState('');

  const [toast, setToast] = useState<{message: string, type: 'success' | 'error'} | null>(null);

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const list = await db.workbooks.list();
    setWorkbooks(list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()));
    
    const user = await db.auth.getUser();
    if (user) {
      if (user.nome) setFormEngenheiro(user.nome);
      if (user.crea) setFormCrea(user.crea);
    }
  };

  const handleLogout = async () => {
    await db.auth.signOut();
    navigate('/login');
  };

  const handleOpenVersions = async (wb: Workbook) => {
    setSelectedWorkbook(wb);
    const versions = await db.versions.list(wb.id);
    setWorkbookVersions(versions);
    setIsVersionsModalOpen(true);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const user = await db.auth.getUser();
    if (!user) return;

    const newWb = await db.workbooks.create({
      user_id: user.id,
      escola: formEscola,
      cod_escola: formCodEscola,
      municipio: formMunicipio,
      sre: formSRE,
      iss: formISS,
      servicos: formServicos,
      engenheiro: formEngenheiro,
      crea: formCrea,
      data_elaboracao: formDataElaboracao
    });

    if (pendingQuickItems && pendingQuickItems.length > 0) {
      const itemsToSave = pendingQuickItems.map(item => ({
        item_code: item.item,
        quantity: item.quantity,
        memory: '',
        location: ''
      }));
      await db.items.saveAll(newWb.id, itemsToSave);
      setPendingQuickItems(null);
    }
    
    navigate(`/editor/${newWb.id}`);
  };

  const handleImportExcel = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const user = await db.auth.getUser();
      if (!user) return;

      const arrayBuffer = await file.arrayBuffer();
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(arrayBuffer);
      const ws = workbook.getWorksheet("Plan1");

      if (!ws) {
        showToast("Aba 'Plan1' não encontrada no arquivo.", "error");
        return;
      }

      // Lê o cabeçalho
      const escola = ws.getCell('B2').value?.toString() || 'Importada';
      const codEscola = ws.getCell('D2').value?.toString() || '';
      const sre = ws.getCell('G2').value?.toString() || '';
      const municipio = ws.getCell('B3').value?.toString() || '';
      let iss = ws.getCell('D3').value;
      iss = iss !== null && iss !== undefined ? (parseFloat(iss.toString()) * 100).toString() : '5';
      const servicos = ws.getCell('F3').value?.toString() || '';

      const newWb = await db.workbooks.create({
        user_id: user.id,
        escola,
        cod_escola: codEscola,
        municipio,
        sre,
        iss,
        servicos
      });

      const importedItems: any[] = [];
      ws.eachRow((row) => {
        const itemCodeCell = row.getCell(1).value;
        if (itemCodeCell) {
          const itemCode = itemCodeCell.toString().trim();
          let qty = row.getCell(4).value;
          if (qty && typeof qty === 'object' && 'result' in qty) {
             qty = (qty as any).result;
          }
          if (qty !== null && qty !== undefined && qty !== '') {
            const memory = row.getCell(7).value?.toString() || '';
            const location = row.getCell(8).value?.toString() || '';
            importedItems.push({
              item_code: itemCode,
              quantity: qty.toString(),
              memory,
              location
            });
          }
        }
      });

      if (importedItems.length > 0) {
        await db.items.saveAll(newWb.id, importedItems);
      }

      showToast(`Planilha importada! Redirecionando...`, "success");
      setTimeout(() => navigate(`/editor/${newWb.id}`), 1000);

    } catch (error) {
      console.error(error);
      showToast("Erro ao ler o arquivo XLSX.", "error");
    } finally {
      event.target.value = '';
    }
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm("Tem certeza que deseja excluir este orçamento?")) {
      await db.workbooks.delete(id);
      loadData();
    }
  };

  const filteredWorkbooks = workbooks.filter(w => 
    w.escola.toLowerCase().includes(searchTerm.toLowerCase()) ||
    w.municipio.toLowerCase().includes(searchTerm.toLowerCase()) ||
    w.cod_escola.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col">
      <header className="bg-emerald-800 text-white shadow-md p-4 sticky top-0 z-10">
        <div className="container mx-auto flex justify-between items-center">
          <div className="flex items-center gap-3">
            <FileSpreadsheet size={28} className="text-emerald-300" />
            <h1 className="text-xl font-bold tracking-wide">Orçamentos SEEMG</h1>
          </div>
          <div className="flex items-center gap-4">
            <button 
              onClick={() => navigate('/account')}
              className="flex items-center gap-2 text-emerald-200 hover:text-white transition-colors text-sm font-medium"
            >
              <UserIcon size={18} /> Minha Conta
            </button>
            <div className="w-px h-4 bg-emerald-700/50"></div>
            <button 
              onClick={handleLogout}
              className="flex items-center gap-2 text-emerald-200 hover:text-white transition-colors text-sm font-medium"
            >
              <LogOut size={18} /> Sair
            </button>
          </div>
        </div>
      </header>

      <main className="container mx-auto flex-1 p-4 py-8">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
          <div className="relative w-full md:max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
            <input 
              type="text" 
              placeholder="Buscar por escola, município ou código..." 
              className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-200 shadow-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>
          
          <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
            <button 
              onClick={() => setIsQuickEstimateOpen(true)}
              className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-indigo-50 text-indigo-700 border border-indigo-200 px-4 py-2 rounded-lg hover:bg-indigo-100 transition-colors shadow-sm font-medium"
            >
              <Zap size={18} /> Orçamento Rápido
            </button>
            <label className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-white border border-slate-300 text-slate-700 px-4 py-2 rounded-lg hover:bg-slate-50 transition-colors shadow-sm font-medium cursor-pointer">
              <Upload size={18} /> Importar XLSX
              <input type="file" accept=".xlsx" className="hidden" onChange={handleImportExcel} />
            </label>
            <button 
              onClick={() => setIsModalOpen(true)}
              className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 transition-colors shadow-sm font-medium"
            >
              <Plus size={18} /> Novo Orçamento
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredWorkbooks.map(wb => (
            <div 
              key={wb.id} 
              onClick={() => handleOpenVersions(wb)}
              className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 hover:shadow-md transition-shadow cursor-pointer hover:border-emerald-300 group flex flex-col"
            >
              <div className="flex justify-between items-start mb-3">
                <span className="text-xs font-mono bg-slate-100 text-slate-600 px-2 py-1 rounded">
                  {wb.cod_escola || 'S/ COD'}
                </span>
                <span className="text-xs font-medium text-emerald-700 bg-emerald-50 px-2 py-1 rounded">
                  {new Date(wb.created_at).toLocaleDateString('pt-BR')}
                </span>
              </div>
              <h3 className="text-lg font-bold text-slate-800 line-clamp-2 mb-1 group-hover:text-emerald-700 transition-colors">
                {wb.escola || 'Escola sem nome'}
              </h3>
              <p className="text-sm text-slate-500 mb-4">{wb.municipio} - {wb.sre}</p>
              
              <div className="mt-auto pt-4 border-t border-slate-100 flex justify-between items-center">
                <span className="text-xs text-slate-400 font-medium">Clique para abrir</span>
                <button 
                  onClick={(e) => handleDelete(wb.id, e)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  title="Excluir Planilha"
                >
                  <Trash2 size={16} />
                  <span className="text-xs font-bold">Excluir</span>
                </button>
              </div>
            </div>
          ))}
          {filteredWorkbooks.length === 0 && (
            <div className="col-span-full py-12 text-center text-slate-500">
              Nenhum orçamento encontrado.
            </div>
          )}
        </div>
      </main>

      {/* MODAL NOVO ORÇAMENTO */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex justify-center items-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                <Plus className="text-emerald-600" /> Criar Novo Orçamento
              </h2>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <LogOut size={20} className="rotate-45" />
              </button>
            </div>
            
            <form onSubmit={handleCreate} className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">Escola Estadual</label>
                  <input type="text" value={formEscola} onChange={e => setFormEscola(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-emerald-500 outline-none" placeholder="Ex: E.E. Afonso Pena" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Cód. Escola</label>
                  <input type="text" value={formCodEscola} onChange={e => setFormCodEscola(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-emerald-500 outline-none" placeholder="Ex: 12345" />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">Município</label>
                  <input type="text" value={formMunicipio} onChange={e => setFormMunicipio(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-emerald-500 outline-none" placeholder="Ex: Belo Horizonte" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">S.R.E.</label>
                  <input type="text" value={formSRE} onChange={e => setFormSRE(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-emerald-500 outline-none" />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">Serviços da Planilha</label>
                  <input type="text" value={formServicos} onChange={e => setFormServicos(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-emerald-500 outline-none" placeholder="Ex: Reforma do Telhado" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Taxa ISS (%)</label>
                  <input type="number" step="0.01" value={formISS} onChange={e => setFormISS(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-emerald-500 outline-none" />
                </div>

                <div className="col-span-full border-t border-slate-100 mt-2 pt-4">
                  <h3 className="text-sm font-semibold text-slate-700 mb-3">Informações Opcionais Adicionais</h3>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Engenheiro(a)</label>
                  <input type="text" value={formEngenheiro} onChange={e => setFormEngenheiro(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-emerald-500 outline-none" placeholder="Nome" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">CREA</label>
                  <input type="text" value={formCrea} onChange={e => setFormCrea(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-emerald-500 outline-none" placeholder="Número" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Data Elaboração</label>
                  <input type="date" value={formDataElaboracao} onChange={e => setFormDataElaboracao(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-emerald-500 outline-none" />
                </div>
              </div>
              
              <div className="pt-6 flex justify-end gap-3 border-t border-slate-100 mt-6 sticky bottom-0 bg-white">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-5 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
                  Cancelar
                </button>
                <button type="submit" className="px-5 py-2.5 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors shadow-sm">
                  Salvar e Abrir Planilha
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL DE VERSÕES */}
      {isVersionsModalOpen && selectedWorkbook && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex justify-center items-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                <Clock className="text-emerald-600" /> Versões do Orçamento
              </h2>
              <div className="flex gap-2">
                <button 
                  onClick={(e) => {
                    setIsVersionsModalOpen(false);
                    if(selectedWorkbook) handleDelete(selectedWorkbook.id, e);
                  }} 
                  className="flex items-center gap-2 px-3 py-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors text-sm font-medium"
                >
                  <Trash2 size={18} />
                  Excluir Planilha
                </button>
                <button onClick={() => setIsVersionsModalOpen(false)} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
                  <LogOut size={20} className="rotate-45" />
                </button>
              </div>
            </div>
            
            <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
              <div 
                onClick={() => navigate(`/editor/${selectedWorkbook.id}`)}
                className="bg-emerald-50 border border-emerald-200 p-4 rounded-xl cursor-pointer hover:bg-emerald-100 transition-colors flex justify-between items-center"
              >
                <div>
                  <h3 className="font-bold text-emerald-800">Rascunho Atual (Trabalhando)</h3>
                  <p className="text-xs text-emerald-600 mt-1">Sua sessão atual com as últimas modificações.</p>
                </div>
                <div className="bg-emerald-600 text-white p-2 rounded-full">
                  <Plus size={16} />
                </div>
              </div>

              {workbookVersions.length > 0 ? (
                <div className="mt-6">
                  <h3 className="text-sm font-semibold text-slate-500 mb-3 uppercase tracking-wider">Histórico na Nuvem</h3>
                  <div className="space-y-3">
                    {workbookVersions.map(v => (
                      <div 
                        key={v.id}
                        onClick={() => navigate(`/editor/${selectedWorkbook.id}?version=${v.id}`)}
                        className="bg-white border border-slate-200 p-4 rounded-xl cursor-pointer hover:border-slate-300 hover:shadow-sm transition-all flex justify-between items-center group"
                      >
                        <div>
                          <h4 className="font-medium text-slate-700">Versão Salva</h4>
                          <p className="text-xs text-slate-500 mt-1">{new Date(v.created_at).toLocaleString('pt-BR')}</p>
                        </div>
                        <div className="text-slate-300 group-hover:text-emerald-600 transition-colors">
                          <LogOut className="rotate-180" size={18} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="mt-6 text-center py-6 bg-slate-50 rounded-xl border border-slate-100 border-dashed">
                  <p className="text-slate-500 text-sm">Nenhuma versão salva na nuvem ainda.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* QUICK ESTIMATE MODAL */}
      {isQuickEstimateOpen && (
        <QuickEstimateModal onClose={(items?: CartItem[]) => {
          setIsQuickEstimateOpen(false);
          if (items && items.length > 0) {
            setPendingQuickItems(items);
            setIsModalOpen(true);
            showToast("Itens do orçamento rápido aguardando efetivação. Preencha os dados da escola.", "success");
          }
        }} />
      )}

      {/* TOAST NOTIFICATION */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 pointer-events-none">
          <div className={`px-6 py-4 rounded-xl shadow-2xl flex items-center gap-3 animate-in fade-in slide-in-from-bottom-4 duration-300 ${toast.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'}`}>
            <span className="font-medium text-sm">{toast.message}</span>
          </div>
        </div>
      )}
    </div>
  );
}
