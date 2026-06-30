import { useState, useMemo, useEffect } from 'react';
import { Search, ChevronRight, ChevronDown, X, Calculator, ShoppingCart, Plus, Minus, Check } from 'lucide-react';

interface CatalogItem {
  item: string;
  description: string;
  unit: string;
  price: number;
  isCategory: boolean;
}

export interface CartItem extends CatalogItem {
  quantity: string;
}

export function QuickEstimateModal({ onClose }: { onClose: (items?: CartItem[]) => void }) {
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedCategories, setExpandedCategories] = useState<string[]>([]);
  const [cartItems, setCartItems] = useState<CartItem[]>([]);

  useEffect(() => {
    fetch('/catalogo.json')
      .then(res => res.json())
      .then(data => setCatalog(data));
  }, []);

  const toggleCategory = (itemCode: string) => {
    setExpandedCategories(prev => 
      prev.includes(itemCode) ? prev.filter(c => c !== itemCode) : [...prev, itemCode]
    );
  };

  const updateCart = (item: CatalogItem, qtyStr: string) => {
    const qty = parseFloat(qtyStr.replace(',', '.'));
    if (isNaN(qty) || qty <= 0) {
      setCartItems(prev => prev.filter(c => c.item !== item.item));
    } else {
      setCartItems(prev => {
        const existing = prev.find(c => c.item === item.item);
        if (existing) {
          return prev.map(c => c.item === item.item ? { ...c, quantity: qtyStr } : c);
        } else {
          return [...prev, { ...item, quantity: qtyStr }];
        }
      });
    }
  };

  const handleIncrement = (item: CatalogItem) => {
    const existing = cartItems.find(c => c.item === item.item);
    const curr = existing ? parseFloat(existing.quantity.replace(',', '.')) : 0;
    updateCart(item, (curr + 1).toString());
  };

  const handleDecrement = (item: CatalogItem) => {
    const existing = cartItems.find(c => c.item === item.item);
    if (!existing) return;
    const curr = parseFloat(existing.quantity.replace(',', '.'));
    if (curr <= 1) {
      updateCart(item, '0');
    } else {
      updateCart(item, (curr - 1).toString());
    }
  };

  const filteredCategories = useMemo(() => {
    if (!searchTerm) {
      return catalog.filter(c => c.isCategory && c.item.endsWith('0000')).map(cat => ({
        ...cat,
        children: catalog.filter(c => !c.isCategory && c.item.startsWith(cat.item.substring(0, 2)))
      }));
    }

    const normalize = (s: string) => (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const term = normalize(searchTerm);

    const matchingItems = catalog.filter(c => 
      !c.isCategory && (normalize(c.description).includes(term) || normalize(c.item).includes(term))
    );

    const categoriesWithMatches = catalog.filter(c => c.isCategory && c.item.endsWith('0000')).map(cat => ({
      ...cat,
      children: matchingItems.filter(c => c.item.startsWith(cat.item.substring(0, 2)))
    })).filter(cat => cat.children.length > 0);

    return categoriesWithMatches;
  }, [catalog, searchTerm]);

  const cartTotal = cartItems.reduce((acc, item) => {
    const q = parseFloat(item.quantity.replace(',', '.')) || 0;
    return acc + (q * item.price);
  }, 0);

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex justify-center items-center z-50 p-4">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-6xl h-[85vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        <div className="p-4 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-900/50">
          <h2 className="text-xl font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
            <Calculator className="text-emerald-600" /> Orçamento Rápido
          </h2>
          <button onClick={() => onClose()} className="text-slate-400 hover:text-slate-600 dark:text-slate-400 transition-colors p-1 bg-white dark:bg-slate-800 rounded-full shadow-sm">
            <X size={20} />
          </button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* LADO ESQUERDO: CATÁLOGO */}
          <div className="flex-1 flex flex-col border-r border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50">
            <div className="p-4 border-b border-slate-100 dark:border-slate-700 bg-white dark:bg-slate-800">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                <input 
                  type="text" 
                  placeholder="Buscar por nome ou código do serviço..." 
                  className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all text-slate-700 dark:text-slate-300"
                  value={searchTerm}
                  onChange={e => {
                    setSearchTerm(e.target.value);
                    if (e.target.value) {
                      setExpandedCategories(catalog.filter(c => c.isCategory).map(c => c.item));
                    } else {
                      setExpandedCategories([]);
                    }
                  }}
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {filteredCategories.length > 0 ? (
                filteredCategories.map(cat => {
                  const isExpanded = expandedCategories.includes(cat.item);
                  return (
                    <div key={cat.item} className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden bg-white dark:bg-slate-800 shadow-sm">
                      <div 
                        className={`flex items-center gap-3 p-3 cursor-pointer hover:bg-slate-50 dark:bg-slate-900/50 transition-colors ${isExpanded ? 'bg-slate-50 dark:bg-slate-900/50 border-b border-slate-100 dark:border-slate-700' : ''}`}
                        onClick={() => toggleCategory(cat.item)}
                      >
                        {isExpanded ? <ChevronDown size={18} className="text-slate-400" /> : <ChevronRight size={18} className="text-slate-400" />}
                        <span className="font-mono text-sm bg-slate-100 dark:bg-slate-800/50 text-slate-600 dark:text-slate-400 px-2 py-0.5 rounded">{cat.item}</span>
                        <span className="font-bold text-slate-700 dark:text-slate-300 text-sm uppercase tracking-wide">{cat.description}</span>
                      </div>
                      {isExpanded && (
                        <div className="p-3 bg-white dark:bg-slate-800 space-y-2">
                          {cat.children.map(item => {
                            const cartItem = cartItems.find(c => c.item === item.item);
                            const qty = cartItem ? cartItem.quantity : '';
                            
                            return (
                              <div key={item.item} className={`flex justify-between items-center gap-4 p-3 rounded-xl border transition-all ${cartItem ? 'border-emerald-300 bg-emerald-50/20 dark:border-emerald-600/50 dark:bg-emerald-900/20' : 'border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 hover:border-slate-300 dark:hover:border-slate-500'}`}>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 mb-1">
                                    <span className="font-mono text-xs bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400 px-2 py-0.5 rounded">
                                      {item.item}
                                    </span>
                                    <span className="font-bold text-slate-800 dark:text-slate-200 text-sm">
                                      {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.price)} <span className="text-slate-500 dark:text-slate-400 font-normal text-xs">/ {item.unit}</span>
                                    </span>
                                  </div>
                                  <p className="text-sm text-slate-600 dark:text-slate-400 leading-snug line-clamp-2" title={item.description}>{item.description}</p>
                                </div>
                                <div className="flex items-center gap-2 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-1 shadow-sm">
                                  {cartItem ? (
                                    <>
                                      <button onClick={() => handleDecrement(item)} className="p-1 hover:bg-slate-100 dark:bg-slate-800/50 rounded text-slate-600 dark:text-slate-400">
                                        <Minus size={16} />
                                      </button>
                                      <input 
                                        type="text"
                                        value={qty}
                                        onChange={(e) => updateCart(item, e.target.value)}
                                        className="w-12 text-center text-sm font-bold text-slate-700 dark:text-slate-300 focus:outline-none bg-transparent"
                                      />
                                      <button onClick={() => handleIncrement(item)} className="p-1 hover:bg-slate-100 dark:bg-slate-800/50 rounded text-slate-600 dark:text-slate-400">
                                        <Plus size={16} />
                                      </button>
                                    </>
                                  ) : (
                                    <button 
                                      onClick={() => handleIncrement(item)}
                                      className="px-4 py-1.5 text-sm font-bold text-emerald-600 dark:text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 rounded-md transition-colors"
                                    >
                                      Adicionar
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })
              ) : (
                <div className="text-center py-12 text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-800 rounded-xl border border-dashed border-slate-200 dark:border-slate-700">
                  Nenhum serviço encontrado.
                </div>
              )}
            </div>
          </div>

          {/* LADO DIREITO: CARRINHO (ORÇAMENTO) */}
          <div className="w-96 bg-white dark:bg-slate-800 flex flex-col shadow-[-4px_0_15px_-3px_rgba(0,0,0,0.05)] z-10">
            <div className="p-4 border-b border-slate-100 dark:border-slate-700 flex items-center gap-2 bg-emerald-50 dark:bg-emerald-900/20">
              <ShoppingCart size={20} className="text-emerald-600 dark:text-emerald-500" />
              <h3 className="font-bold text-emerald-900 dark:text-emerald-100">Itens Selecionados</h3>
              <span className="ml-auto bg-emerald-200 text-emerald-800 text-xs font-bold px-2 py-1 rounded-full">
                {cartItems.length}
              </span>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {cartItems.length > 0 ? (
                cartItems.map(item => (
                  <div key={item.item} className="flex flex-col gap-2 p-3 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-100 dark:border-slate-700">
                    <div className="flex justify-between items-start gap-2">
                      <span className="text-xs font-mono text-slate-500 dark:text-slate-400">{item.item}</span>
                      <button onClick={() => updateCart(item, '0')} className="text-slate-400 hover:text-red-500">
                        <X size={14} />
                      </button>
                    </div>
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-300 line-clamp-2">{item.description}</p>
                    <div className="flex justify-between items-end mt-1">
                      <div className="flex items-center gap-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded p-0.5">
                        <button onClick={() => handleDecrement(item)} className="p-0.5 hover:bg-slate-100 dark:bg-slate-800/50 rounded text-slate-600 dark:text-slate-400"><Minus size={14}/></button>
                        <span className="text-xs font-bold w-8 text-center">{item.quantity}</span>
                        <button onClick={() => handleIncrement(item)} className="p-0.5 hover:bg-slate-100 dark:bg-slate-800/50 rounded text-slate-600 dark:text-slate-400"><Plus size={14}/></button>
                      </div>
                      <span className="text-sm font-bold text-emerald-700">
                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.price * (parseFloat(item.quantity.replace(',','.')) || 0))}
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-slate-400 space-y-3 opacity-50">
                  <ShoppingCart size={48} />
                  <p className="text-sm text-center">Seu orçamento está vazio.<br/>Adicione itens do catálogo.</p>
                </div>
              )}
            </div>

            <div className="p-4 border-t border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-slate-500 dark:text-slate-400 font-medium">Sub-total</span>
                <span className="text-xl font-black text-slate-800 dark:text-slate-200">
                  {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cartTotal)}
                </span>
              </div>
              <button 
                disabled={cartItems.length === 0}
                onClick={() => onClose(cartItems)}
                className={`w-full py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all shadow-md ${cartItems.length > 0 ? 'bg-emerald-600 hover:bg-emerald-700 text-white hover:shadow-lg active:scale-[0.98]' : 'bg-slate-200 dark:bg-slate-700 text-slate-400 cursor-not-allowed shadow-none'}`}
              >
                <Check size={20} />
                Efetivar Orçamento
              </button>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
