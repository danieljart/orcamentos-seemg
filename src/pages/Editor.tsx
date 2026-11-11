import { useState, useEffect, useMemo, useCallback, useRef, memo, useDeferredValue } from 'react';
import type { ReactNode } from 'react';
import { Search, Plus, Trash2, Download, FileSpreadsheet, CheckCircle, Edit2, X, Calculator, Save, AlertTriangle, ChevronRight, Printer, Loader2, History, Eye, EyeOff, Copy, CheckSquare, Share2, Lock, ChevronDown, StickyNote } from 'lucide-react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import * as ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { db } from '../services/db';
import type { Workbook } from '../services/db';
import { SchoolSearch } from '../components/SchoolSearch';
import { ShareModal } from '../components/ShareModal';
import { NotesPanel } from '../components/NotesPanel';
import { getIssForMunicipio, saveIssForMunicipio } from '../lib/iss';
import { loadCatalog, loadExternalCatalog, getTemplatePath, DEFAULT_PRICE_BASE, getPriceBaseLabel, isExternalCode, BASE_OPTIONS, ALL_BASES } from '../lib/catalog';
import type { PriceBase, CatalogSource, BaseId } from '../lib/catalog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '../components/ui/dropdown-menu';
import { ThemeToggle } from '../components/ThemeToggle';
import { PrintableSpreadsheet } from '../components/PrintableSpreadsheet';
import { toJpeg } from 'html-to-image';
import jsPDF from 'jspdf';

interface CatalogItem {
  item: string;
  description: string;
  unit: string;
  price: number;
  isCategory: boolean;
  rows: number[];
  extendedDescription?: string;
  source?: CatalogSource;
  table?: string;
  group?: string;
  level?: number;
}

/**
 * True for an item the SEE template has no row of its own for, which therefore
 * has to be written into the "OUTROS" block on export: the hand-written custom
 * items (260001_…) and everything taken from the SETOP and SUDECAP bases.
 */
const usesOutrosSection = (code: string): boolean => code.startsWith('2600') || isExternalCode(code);

interface SelectedItemOccurrence {
  id: string;
  quantity: string;
  memory: string;
  location: string;
}

interface SelectedItem extends CatalogItem {
  occurrences: SelectedItemOccurrence[];
  customCode?: string;
  customTitle?: string;
  customDescription?: string;
  customUnit?: string;
  customPrice?: number;
}

import { evaluateMath } from '../lib/math';

interface TreeNode extends CatalogItem {
  children: TreeNode[];
}

const SUPERSCRIPT_DIGITS: Record<string, string> = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' };

/**
 * Flattens an ExcelJS cell value to plain text.
 *
 * A cell is not always a string: rich text arrives as { richText: [...] },
 * formulas as { formula, result }, hyperlinks as { text, hyperlink }. Calling
 * toString() on any of those yields "[object Object]", which is how that
 * string ended up stored as a unit. Superscript runs are mapped to the
 * matching Unicode character so "M" + superscript "2" reads back as "M²".
 */
const cellText = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toLocaleDateString('pt-BR');
  if (typeof value !== 'object') return String(value);

  const cell = value as any;
  if (Array.isArray(cell.richText)) {
    return cell.richText.map((run: any) => {
      const text = run?.text ?? '';
      if (run?.font?.vertAlign === 'superscript') {
        return String(text).replace(/[0-9]/g, (d: string) => SUPERSCRIPT_DIGITS[d]);
      }
      return String(text);
    }).join('');
  }
  if ('result' in cell) return cell.result === null || cell.result === undefined ? '' : String(cell.result);
  if ('text' in cell) return String(cell.text);
  if ('error' in cell) return '';
  return '';
};

/**
 * Budgets saved before cellText() existed can carry the literal string
 * "[object Object]" as their unit. Dropping it here lets the item fall back to
 * the unit from the catalogue instead of showing that string on screen and in
 * the export.
 */
const sanitizeUnit = (unit: unknown): string | undefined => {
  if (typeof unit !== 'string') return undefined;
  const trimmed = unit.trim();
  return trimmed && trimmed !== '[object Object]' ? trimmed : undefined;
};

/**
 * Grows row heights so nothing is clipped in the exported sheet.
 *
 * Excel only auto-fits a row's height while editing it; a file written by a
 * library keeps whatever height it was given, so long memories of calculation
 * and long locations come out cut off mid-line. There is no text metrics API
 * here, so the number of lines is estimated from the text length against the
 * width of the columns the cell spans, taking merges into account.
 *
 * Heights are only ever increased: rows the template sized deliberately, such
 * as the header band, keep their own height unless their content needs more.
 */
function growRowsToFitContent(worksheet: any): void {
  const DEFAULT_COLUMN_WIDTH = 8.43;
  const FALLBACK_FONT_SIZE = 11;
  // Width is counted in characters of the default font. Text set in a larger
  // font fits proportionally fewer, and the 0.95 leaves a little slack so a
  // word that wraps early does not spill past the last visible line.
  const charsPerWidthUnit = (fontSize: number) => (FALLBACK_FONT_SIZE / fontSize) * 0.95;

  const columnWidth = (col: number): number => {
    const column = worksheet.getColumn(col);
    return (column && column.width) || DEFAULT_COLUMN_WIDTH;
  };

  // Map every merged cell to the range it belongs to, so a description that
  // spans B:F is measured against all of those columns together.
  const spanByAnchor = new Map<string, { lastCol: number }>();
  const covered = new Set<string>();
  const merges: string[] = worksheet.model && worksheet.model.merges ? worksheet.model.merges : [];

  for (const range of merges) {
    const [from, to] = range.split(':');
    const start = from && from.match(/([A-Z]+)(\d+)/);
    const end = to && to.match(/([A-Z]+)(\d+)/);
    if (!start || !end) continue;

    const colOf = (letters: string) => letters.split('').reduce((acc, ch) => acc * 26 + (ch.charCodeAt(0) - 64), 0);
    const c1 = colOf(start[1]);
    const c2 = colOf(end[1]);
    const r1 = parseInt(start[2], 10);
    const r2 = parseInt(end[2], 10);

    spanByAnchor.set(`${r1}:${c1}`, { lastCol: c2 });
    for (let r = r1; r <= r2; r++) {
      for (let c = c1; c <= c2; c++) {
        if (r !== r1 || c !== c1) covered.add(`${r}:${c}`);
      }
    }
  }

  worksheet.eachRow((row: any, rowNumber: number) => {
    let neededLines = 1;
    let largestFont = FALLBACK_FONT_SIZE;

    for (let col = 1; col <= 12; col++) {
      if (covered.has(`${rowNumber}:${col}`)) continue;

      const cell = row.getCell(col);
      const text = cellText(cell.value);
      if (!text) continue;

      const span = spanByAnchor.get(`${rowNumber}:${col}`);
      const lastCol = span ? span.lastCol : col;
      let width = 0;
      for (let c = col; c <= lastCol; c++) width += columnWidth(c);

      const fontSize = (cell.font && cell.font.size) || FALLBACK_FONT_SIZE;
      largestFont = Math.max(largestFont, fontSize);

      const capacity = Math.max(1, Math.floor(width * charsPerWidthUnit(fontSize)));
      const lines = text
        .split(/\r?\n/)
        .reduce((sum, line) => sum + Math.max(1, Math.ceil(line.length / capacity)), 0);

      neededLines = Math.max(neededLines, lines);
    }

    const lineHeight = largestFont * 1.3;
    const needed = Math.ceil(neededLines * lineHeight);
    if (!row.height || row.height < needed) {
      row.height = needed;
    }
  });
}

/**
 * Cleans a stored quantity string for display. Typing normally always goes
 * through evaluateMath, which already rounds to 2 decimals, but some rows
 * were written before that rounding existed (or arrived via import/clone),
 * and showing those raw can print a float tail like 21.431099999999997.
 */
const formatQty = (q: string): string => {
  if (!q) return q;
  const evaluated = evaluateMath(q);
  return evaluated || q;
};

const getItemTotalQuantity = (item: SelectedItem): number => {
  if (!item.occurrences) return 0;
  const sum = item.occurrences.reduce((acc, occ) => acc + (Number(evaluateMath(occ.quantity)) || 0), 0);
  // evaluateMath already rounds each occurrence to 2 decimals, but summing
  // several of those floats can still land on e.g. 13.770000000000001
  // (binary floating point), which then printed straight in the UI and the
  // exported sheet. Rounding the sum the same way keeps it a clean number.
  return Math.round(sum * 100) / 100;
};

/** Accent- and case-insensitive form used for catalogue searching. */
const normalizeSearchText = (s: string): string =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Normalizing a description is not free, and the search walks every node of
// every active base on each keystroke. The tree nodes are rebuilt only when
// the catalogue itself changes, so caching per node object is enough and the
// entries are collected along with the nodes.
const normalizedDescriptions = new WeakMap<object, string>();
const normalizedDescriptionOf = (node: { description: string }): string => {
  const cached = normalizedDescriptions.get(node);
  if (cached !== undefined) return cached;
  const value = normalizeSearchText(node.description);
  normalizedDescriptions.set(node, value);
  return value;
};

// Pure occurrence helpers — no closure over component state, just the
// setState passed in — so both Editor and the memoized BudgetItemRow below
// can call them directly.
const updateOccurrence = (state: SelectedItemOccurrence[], setState: React.Dispatch<React.SetStateAction<SelectedItemOccurrence[]>>, id: string, field: keyof SelectedItemOccurrence, value: string) => {
  setState(state.map(occ => occ.id === id ? { ...occ, [field]: value } : occ));
};

const handleOccurrenceMathChange = (state: SelectedItemOccurrence[], setState: React.Dispatch<React.SetStateAction<SelectedItemOccurrence[]>>, id: string, value: string) => {
  const result = evaluateMath(value);
  setState(state.map(occ => occ.id === id ? { ...occ, memory: value, quantity: result ? String(result) : occ.quantity } : occ));
};

const addOccurrence = (setState: React.Dispatch<React.SetStateAction<SelectedItemOccurrence[]>>) => {
  setState(prev => [...prev, { id: Math.random().toString(36).substring(2, 11), memory: '', quantity: '', location: '' }]);
};

const removeOccurrence = (setState: React.Dispatch<React.SetStateAction<SelectedItemOccurrence[]>>, id: string) => {
  setState(prev => prev.filter(occ => occ.id !== id));
};

const duplicateOccurrence = (setState: React.Dispatch<React.SetStateAction<SelectedItemOccurrence[]>>, occ: SelectedItemOccurrence) => {
  setState(prev => {
    const index = prev.findIndex(o => o.id === occ.id);
    const newOcc = { ...occ, id: Math.random().toString(36).substring(2, 11) };
    const newArr = [...prev];
    if (index !== -1) {
      newArr.splice(index + 1, 0, newOcc);
    } else {
      newArr.push(newOcc);
    }
    return newArr;
  });
};

function buildTree(items: CatalogItem[]): TreeNode[] {
  const root: TreeNode[] = [];
  const stack: { node: TreeNode, prefix: string }[] = [];

  for (const item of items) {
    // Skip 260002-260006 (old slots), only keep 260001 as the single "Add Custom" button
    if (['260002', '260003', '260004', '260005', '260006'].includes(item.item)) {
      continue;
    }
    const node: TreeNode = { ...item, children: [] };
    let isCat = item.isCategory;
    
    if (node.item === '260001') {
      node.description = '+ Adicionar Item Personalizado';
      node.isCategory = false;
      isCat = false;
    }
    
    if (isCat) {
      const prefix = item.item.replace(/(00)+$/, '');
      while (stack.length > 0 && !prefix.startsWith(stack[stack.length - 1].prefix)) {
        stack.pop();
      }
      if (stack.length === 0) {
        root.push(node);
      } else {
        stack[stack.length - 1].node.children.push(node);
      }
      stack.push({ node, prefix });
    } else {
      if (stack.length === 0) {
        root.push(node);
      } else {
        stack[stack.length - 1].node.children.push(node);
      }
    }
  }
  return root;
}

/**
 * Builds the branch of the catalogue tree for the SETOP and SUDECAP bases.
 *
 * The SEE codes encode their own nesting, which buildTree reads off the digits;
 * their codes do not, so the shape comes from the fields the generators wrote:
 * each table (edificação, rodoviárias, consultoria) holds its group headers,
 * and each group holds its services. Services listed before any group header
 * hang directly off their table, which is where the source puts them.
 */
function buildExternalTree(items: CatalogItem[]): TreeNode[] {
  const tables = new Map<string, TreeNode>();
  const groups = new Map<string, TreeNode>();

  for (const item of items) {
    const node: TreeNode = { ...item, children: [] };

    if (item.level === 0) {
      tables.set(item.item, node);
    } else if (item.level === 1) {
      groups.set(item.item, node);
      tables.get(item.table || '')?.children.push(node);
    } else {
      const parent = groups.get(item.group || '') || tables.get(item.table || '');
      parent?.children.push(node);
    }
  }

  // Groups the tables shipped with no services under them would render as
  // dead ends, so they are left out.
  const nonEmpty = (node: TreeNode): boolean => node.children.length > 0;
  for (const table of tables.values()) {
    table.children = table.children.filter(child => !child.isCategory || nonEmpty(child));
  }

  return Array.from(tables.values()).filter(nonEmpty);
}

interface CustomItemFieldsShape {
  code: string;
  title: string;
  description: string;
  unit: string;
  price: number;
}

const EMPTY_OCCURRENCES: SelectedItemOccurrence[] = [];
const EMPTY_CUSTOM_FIELDS: CustomItemFieldsShape = { code: '', title: '', description: '', unit: '', price: 0 };

interface BudgetItemRowProps {
  item: SelectedItem;
  isReadOnly: boolean;
  isEditing: boolean;
  isCopySource: boolean;
  copyModeActive: boolean;
  isInCopySelection: boolean;
  isDescExpanded: boolean;
  // Only meaningful while isEditing; the parent passes the stable EMPTY_*
  // constants above for every other row, so those 139 other rows see the
  // exact same prop value every render and memo can skip them.
  editFormOccurrences: SelectedItemOccurrence[];
  setEditFormOccurrences: React.Dispatch<React.SetStateAction<SelectedItemOccurrence[]>>;
  editCustomItemFields: CustomItemFieldsShape;
  setEditCustomItemFields: React.Dispatch<React.SetStateAction<CustomItemFieldsShape>>;
  onToggleForCopy: (itemCode: string) => void;
  onStartCopy: (itemId: string, e: React.MouseEvent) => void;
  onToggleDescription: (itemCode: string, e: React.MouseEvent) => void;
  onEdit: (item: SelectedItem) => void;
  onRemove: (itemCode: string) => void;
  onCancelEdit: () => void;
  onSaveEdit: (itemCode: string) => void;
}

/**
 * One row of the budget list, split out of the big Object.entries(...).map()
 * below and wrapped in memo so it only re-renders when ITS OWN props change.
 * Before this, every keystroke in one item's edit form — memory, quantity,
 * location, even an unrelated budget — re-built the JSX for every other item
 * in the list too (measured well over 100ms per keystroke on a 140-item
 * budget), because the whole list lived in one render pass with no
 * boundaries. The callbacks passed in are all reference-stable (see the
 * ref-backed wrappers in Editor), which is what makes the memo comparison
 * actually hold for the rows that aren't being touched.
 */
const BudgetItemRow = memo(function BudgetItemRow({
  item, isReadOnly, isEditing, isCopySource, copyModeActive, isInCopySelection, isDescExpanded,
  editFormOccurrences, setEditFormOccurrences, editCustomItemFields, setEditCustomItemFields,
  onToggleForCopy, onStartCopy, onToggleDescription, onEdit, onRemove, onCancelEdit, onSaveEdit,
}: BudgetItemRowProps) {
  const isCustom = usesOutrosSection(item.item);
  const price = item.customPrice !== undefined ? item.customPrice : item.price;
  const totalQty = getItemTotalQuantity(item);

  return (
    <div className={`flex flex-col border rounded-lg transition-all overflow-hidden ${isCopySource ? 'border-emerald-400 dark:border-emerald-600 ring-2 ring-emerald-300 dark:ring-emerald-700 bg-emerald-50/50 dark:bg-emerald-900/30' : isEditing ? 'border-emerald-200 dark:border-emerald-800 bg-emerald-50/30 dark:bg-emerald-900/20' : 'border-slate-200 dark:border-slate-700 bg-slate-200 dark:bg-slate-800/80 print:bg-white hover:border-emerald-200 dark:hover:border-emerald-700'}`}>
      <div className="p-3 hover:shadow-md transition-shadow group relative">
        <div className="w-full min-w-0">
          <div className="print:hidden">
            <div className="flex items-center justify-between mb-0.5">
              <div className="flex items-center gap-2">
              {copyModeActive && !isCopySource && (
                <button onClick={(e) => { e.stopPropagation(); onToggleForCopy(item.item); }} className="text-slate-400 hover:text-emerald-600">
                  {isInCopySelection ? <CheckSquare size={16} className="text-emerald-600" /> : <div className="w-4 h-4 border-2 border-slate-300 rounded" />}
                </button>
              )}
              <span className="inline-flex items-center justify-center h-[18px] text-[10px] leading-none font-mono font-bold bg-slate-100 dark:bg-slate-700/50 text-slate-700 dark:text-slate-300 px-1.5 rounded border border-slate-200 dark:border-slate-600">{item.customCode || item.item}</span>
              <span className="inline-flex items-center justify-center h-[18px] text-[10px] leading-none font-medium text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-900/50 px-1.5 rounded border border-slate-200 dark:border-slate-700">
                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(price)}
              </span>
              <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400">{totalQty} {item.customUnit || item.unit}</span>
              </div>
              {!isEditing && !isReadOnly && (
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity print:hidden">
                  <button onClick={(e) => onStartCopy(item.item, e)} className={`p-1.5 rounded ${isCopySource ? 'bg-emerald-100 text-emerald-600' : 'text-slate-400 hover:bg-slate-100 dark:bg-slate-800/50 hover:text-emerald-600'}`} title="Copiar Memória">
                    <Copy size={14}/>
                  </button>
                  <button onClick={() => onEdit(item)} className="p-1.5 text-slate-400 hover:bg-slate-100 dark:bg-slate-800/50 hover:text-emerald-600 rounded" title="Editar">
                    <Edit2 size={14}/>
                  </button>
                  <button onClick={() => onRemove(item.item)} className="p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500 rounded" title="Remover">
                    <Trash2 size={14}/>
                  </button>
                </div>
              )}
            </div>
            <div className="flex justify-between items-start gap-2">
              <div className="flex flex-col flex-1">
                <div className="flex items-start gap-1">
                  <div className={`flex-1 ${isDescExpanded ? '' : 'line-clamp-3'}`}>
                    <p className="text-sm text-slate-800 dark:text-slate-200 font-medium leading-snug whitespace-pre-wrap" title={item.customTitle || item.customDescription || item.description}>
                      {item.customTitle || item.customDescription || item.description}
                    </p>
                    {item.customTitle && item.customDescription && (
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 whitespace-pre-wrap">{item.customDescription}</p>
                    )}
                    {(item.extendedDescription && isDescExpanded) && (
                      <div className="text-xs text-slate-500 dark:text-slate-400 whitespace-pre-wrap mt-2 pt-2 border-t border-slate-200 dark:border-slate-700 font-normal">{item.extendedDescription}</div>
                    )}
                  </div>
                  {(item.extendedDescription || (item.customDescription && item.customDescription.length > 50) || item.description.length > 80) && (
                    <button onClick={(e) => onToggleDescription(item.item, e)} className="p-0.5 text-slate-400 hover:text-emerald-600 transition-colors shrink-0 mt-0.5" title="Ver descrição completa">
                      {isDescExpanded ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  )}
                </div>
              </div>
              <span className="text-xs font-bold text-slate-600 dark:text-slate-200 whitespace-nowrap bg-slate-100 dark:bg-slate-700/50 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-600 mt-0.5">
                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalQty * price)}
              </span>
            </div>
            {(item.occurrences && item.occurrences.length > 1) ? (
              <div className="mt-3 text-[11px] border-t border-dashed border-emerald-200 dark:border-slate-700 pt-2 flex flex-col gap-1 w-full">
                {item.occurrences.map((occ) => {
                  const subtotal = (Number(evaluateMath(occ.quantity)) || 0) * price;
                  return (
                    <div key={occ.id} className="flex flex-wrap justify-between items-center text-slate-600 dark:text-slate-300 bg-emerald-100/40 dark:bg-emerald-900/20 p-1.5 rounded gap-2">
                      <span className="flex-1 min-w-[120px] truncate" title={occ.location}><b>Local:</b> {occ.location || '-'}</span>
                      <span className="flex-1 min-w-[100px] truncate" title={occ.memory}><b>Memória:</b> {occ.memory || '-'}</span>
                      <span className="w-[80px]"><b>Qtd:</b> {formatQty(occ.quantity)} {item.customUnit || item.unit}</span>
                      <span className="w-[120px] text-right font-medium text-emerald-700 dark:text-emerald-400"><b>Subtotal:</b> {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(subtotal)}</span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-1"><b>Local:</b> {item.occurrences?.map(o => o.location).filter(Boolean).join(' | ') || '-'}</p>
            )}
          </div>

          {/* Layout Específico para Impressão */}
          <div className="hidden print:block print:!text-black">
            <div className="flex justify-between items-start mb-1 border-b pb-1">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center justify-center h-[18px] text-[10px] leading-none font-mono font-bold text-slate-700 bg-slate-100 dark:bg-slate-700/50 dark:text-slate-300 print:!text-black print:bg-slate-100 px-1.5 rounded border border-slate-200 dark:border-slate-600 print:border-slate-300">{item.customCode || item.item}</span>
                <div className="flex flex-col">
                  <span className="text-sm font-bold text-slate-800 dark:text-slate-200 print:!text-black line-clamp-2">{item.customTitle || item.customDescription || item.description}</span>
                  {item.customTitle && item.customDescription && (
                    <span className="text-xs font-normal text-slate-500 dark:text-slate-400 print:!text-black line-clamp-1">{item.customDescription}</span>
                  )}
                </div>
              </div>
            </div>
            <div className="text-xs text-slate-700 dark:text-slate-300 print:!text-black mt-2 space-y-1">
              {item.occurrences?.map((occ) => (
                <div key={occ.id} className="grid gap-2 border-b border-dashed border-slate-200 dark:border-slate-700 pb-1 grid-cols-5">
                  <p className="truncate col-span-2"><strong>Local:</strong> {occ.location || '-'}</p>
                  <p className="truncate" title={occ.memory}><strong>Memória:</strong> {occ.memory || '-'}</p>
                  <p><strong>Qtd:</strong> {formatQty(occ.quantity)} {item.customUnit || item.unit}</p>
                  <p><strong>{item.occurrences!.length > 1 ? 'Subtotal' : 'Total'}:</strong> {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format((Number(evaluateMath(occ.quantity)) || 0) * price)}</p>
                </div>
              ))}
              {item.occurrences!.length > 1 && (
                <div className="flex justify-end gap-6 pt-1 font-bold text-slate-800 dark:text-slate-200 print:!text-black">
                  <p>Qtd Total: {totalQty} {item.customUnit || item.unit}</p>
                  <p>Unitário: {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(price)}</p>
                  <p>Preço Total: {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalQty * price)}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* RIGHT INLINE FORM */}
      {isEditing && (
        <div className="p-3 bg-emerald-50/50 dark:bg-emerald-900/20 border-t border-emerald-100 dark:border-emerald-800 flex flex-col gap-3">
          {isCustom && (
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 mb-2 p-3 bg-white dark:bg-slate-800 rounded border border-emerald-200">
              <div className="sm:col-span-1">
                <label className="text-xs font-bold text-slate-600 dark:text-slate-400 block mb-1">Código</label>
                <input type="text" value={editCustomItemFields.code} onChange={e => setEditCustomItemFields({...editCustomItemFields, code: e.target.value})} className="w-full px-2 py-1.5 rounded border text-sm outline-none focus:border-emerald-500" />
              </div>
              <div className="sm:col-span-3">
                <label className="text-xs font-bold text-slate-600 dark:text-slate-400 block mb-1">Título</label>
                <input type="text" value={editCustomItemFields.title} onChange={e => setEditCustomItemFields({...editCustomItemFields, title: e.target.value})} className="w-full px-2 py-1.5 rounded border text-sm outline-none focus:border-emerald-500" placeholder="Ex: Piso Cerâmico" />
              </div>
              <div className="sm:col-span-4">
                <label className="text-xs font-bold text-slate-600 dark:text-slate-400 block mb-1">Descrição</label>
                <input type="text" value={editCustomItemFields.description} onChange={e => setEditCustomItemFields({...editCustomItemFields, description: e.target.value})} className="w-full px-2 py-1.5 rounded border text-sm outline-none focus:border-emerald-500" placeholder="Detalhes opcionais..." />
              </div>
              <div className="sm:col-span-2">
                <label className="text-xs font-bold text-slate-600 dark:text-slate-400 block mb-1">Unidade</label>
                <input type="text" value={editCustomItemFields.unit} onChange={e => setEditCustomItemFields({...editCustomItemFields, unit: e.target.value})} className="w-full px-2 py-1.5 rounded border text-sm outline-none focus:border-emerald-500" />
              </div>
              <div className="sm:col-span-2">
                <label className="text-xs font-bold text-slate-600 dark:text-slate-400 block mb-1">Preço</label>
                <input type="number" step="0.01" value={editCustomItemFields.price} onChange={e => setEditCustomItemFields({...editCustomItemFields, price: Number(e.target.value)})} className="w-full px-2 py-1.5 rounded border text-sm outline-none focus:border-emerald-500" />
              </div>
            </div>
          )}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {editFormOccurrences.map((occ, idx) => (
              <div key={occ.id} className="bg-white dark:bg-slate-800 p-3 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm space-y-2.5">
                <div className="flex items-center justify-between pb-1 border-b border-slate-100 dark:border-slate-700/60">
                  <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
                    Local #{idx + 1}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => duplicateOccurrence(setEditFormOccurrences, occ)}
                      className="text-slate-400 hover:text-emerald-600 p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-700"
                      title="Duplicar Local"
                    >
                      <Copy size={13}/>
                    </button>
                    {editFormOccurrences.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeOccurrence(setEditFormOccurrences, occ.id)}
                        className="text-red-400 hover:text-red-600 p-1 rounded hover:bg-red-50 dark:hover:bg-red-950/30"
                        title="Remover Local"
                      >
                        <Trash2 size={13}/>
                      </button>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-[1fr_56px] gap-2 items-start">
                  <div className="min-w-0">
                    <label className="flex items-center gap-1 text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                      <Calculator size={12} className="text-emerald-600"/> Memória de Cálculo
                    </label>
                    <input
                      type="text"
                      className="w-full px-2.5 py-1.5 border border-slate-300 dark:border-slate-600 rounded text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                      placeholder="Ex: 2*5, 3^2, raiz(16)"
                      value={occ.memory}
                      onChange={e => handleOccurrenceMathChange(editFormOccurrences, setEditFormOccurrences, occ.id, e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1 text-center truncate" title={`Qtd. (${item.customUnit || item.unit})`}>
                      Qtd
                    </label>
                    <input
                      type="number"
                      className="w-full px-1 py-1.5 border border-slate-300 dark:border-slate-600 rounded text-sm focus:ring-2 focus:ring-emerald-500 outline-none bg-white dark:bg-slate-800 text-center font-bold"
                      placeholder="Qtd"
                      value={occ.quantity}
                      onChange={e => updateOccurrence(editFormOccurrences, setEditFormOccurrences, occ.id, 'quantity', e.target.value)}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Local de Intervenção</label>
                  <input
                    type="text"
                    list="locations-list"
                    className="w-full px-2.5 py-1.5 border border-slate-300 dark:border-slate-600 rounded text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                    placeholder="Ex: Bloco A, Sala 3"
                    value={occ.location}
                    onChange={e => updateOccurrence(editFormOccurrences, setEditFormOccurrences, occ.id, 'location', e.target.value)}
                  />
                </div>
              </div>
            ))}
          </div>
          <div className="flex justify-between items-center mt-1">
            <button onClick={() => addOccurrence(setEditFormOccurrences)} className="text-sm font-medium text-emerald-600 hover:text-emerald-700 flex items-center gap-1">
              <Plus size={16}/> Adicionar Local
            </button>
            <div className="flex gap-2">
              <button onClick={onCancelEdit} className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:bg-slate-700 rounded-md">Cancelar</button>
              <button onClick={() => onSaveEdit(item.item)} className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-md flex items-center gap-2">
                <CheckCircle size={16}/> Salvar Alterações
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

export function Editor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const versionId = searchParams.get('version');

  const [workbook, setWorkbook] = useState<Workbook | null>(null);

  // Ownership decides what the editor allows. A workbook opened through a
  // share belongs to someone else, and the database only lets that user read
  // it, so every way of changing it is switched off here instead of failing
  // later against the database. The two stay false until both the workbook
  // and the session user are known, so an owner is never briefly locked out.
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const isReadOnly = !!workbook && currentUserId !== null && workbook.user_id !== currentUserId;
  const isOwner = !!workbook && currentUserId !== null && workbook.user_id === currentUserId;
  const [sharedByName, setSharedByName] = useState('');
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);

  // Free-form notes kept with the workbook, never written into the exported
  // XLSX or PDF. Hidden by default; a button in the header shows/hides the
  // panel. notesUnavailable is set the first time a save fails because
  // database/notepad.sql has not been run yet, so it doesn't fail silently.
  const [isNotesOpen, setIsNotesOpen] = useState(false);
  const [notesText, setNotesText] = useState('');
  const [isSavingNotes, setIsSavingNotes] = useState(false);
  const [notesUnavailable, setNotesUnavailable] = useState(false);

  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  // SETOP and SUDECAP together: their codes never collide, so one list serves lookups.
  const [externalCatalog, setExternalCatalog] = useState<CatalogItem[]>([]);
  const [activeBases, setActiveBases] = useState<BaseId[]>(ALL_BASES);
  const [priceBase, setPriceBase] = useState<PriceBase>(DEFAULT_PRICE_BASE);
  const [searchTerm, setSearchTerm] = useState('');
  // Same idea as the budget search below: the catalogue tree spans the SEE,
  // SETOP and SUDECAP bases together (around ten thousand entries), so its
  // filtering runs against the deferred value and never blocks typing.
  const deferredSearchTerm = useDeferredValue(searchTerm);
  // Filters the services already in the budget; the catalogue search above is separate.
  const [budgetSearch, setBudgetSearch] = useState('');
  // The input itself always shows what was just typed; the filtering of the
  // list runs against this deferred copy, at a lower priority, so a big
  // budget re-filtering can never hold up the next character appearing.
  const deferredBudgetSearch = useDeferredValue(budgetSearch);
  // Tracks which result the user has navigated to with Enter.
  const [budgetSearchIdx, setBudgetSearchIdx] = useState(0);
  
  const [selectedItems, setSelectedItems] = useState<SelectedItem[]>([]);
  interface HistoryState {
    items: SelectedItem[];
    description: string;
    timestamp: Date;
  }

  const [history, setHistory] = useState<HistoryState[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [lastSavedItemsJson, setLastSavedItemsJson] = useState<string>('');
  
  const [expandedDescriptions, setExpandedDescriptions] = useState<Set<string>>(new Set());
  const [copyMemoryMode, setCopyMemoryMode] = useState<string | null>(null);
  const [selectedItemsForCopy, setSelectedItemsForCopy] = useState<Set<string>>(new Set());


  const [isExporting, setIsExporting] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Form states for inline editing
  const [activeFormItem, setActiveFormItem] = useState<string | null>(null);
  const [formOccurrences, setFormOccurrences] = useState<SelectedItemOccurrence[]>([]);
  const [customItemFields, setCustomItemFields] = useState({ code: '', title: '', description: '', unit: '', price: 0 });

  // States for right-side inline editing
  const [activeRightEditItem, setActiveRightEditItem] = useState<string | null>(null);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [editFormOccurrences, setEditFormOccurrences] = useState<SelectedItemOccurrence[]>([]);
  const [editCustomItemFields, setEditCustomItemFields] = useState({ code: '', title: '', description: '', unit: '', price: 0 });

  // States for Header Edit
  const [isHeaderEditModalOpen, setIsHeaderEditModalOpen] = useState(false);
  const [headerForm, setHeaderForm] = useState<Partial<Workbook>>({});

  // Toast Notification state
  const [toast, setToast] = useState<{message: string, type: 'success' | 'error'} | null>(null);

  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importCandidateItems, setImportCandidateItems] = useState<SelectedItem[]>([]);
  const [importSearchTerm, setImportSearchTerm] = useState('');
  const [importLocationFilter, setImportLocationFilter] = useState('all');
  const [selectedImportItems, setSelectedImportItems] = useState<Set<string>>(new Set());

  const [userSre, setUserSre] = useState('');
  const [userName, setUserName] = useState('');

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const updateItems = (newItems: SelectedItem[] | ((prev: SelectedItem[]) => SelectedItem[]), description: string = 'Alteração no orçamento') => {
    if (isReadOnly) return;
    setSelectedItems(prev => {
      let next = typeof newItems === 'function' ? newItems(prev) : newItems;
      next = [...next].sort((a, b) => a.item.localeCompare(b.item));
      setHistory(h => {
        const newHistory = h.slice(0, historyIndex + 1);
        newHistory.push({ items: next, description, timestamp: new Date() });
        setHistoryIndex(newHistory.length - 1);
        return newHistory;
      });
      return next;
    });
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isReadOnly) return;
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        if (historyIndex > 0) {
          setHistoryIndex(prev => {
            const nextIdx = prev - 1;
            setSelectedItems(history[nextIdx].items);
            return nextIdx;
          });
        }
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        if (historyIndex < history.length - 1) {
          setHistoryIndex(prev => {
            const nextIdx = prev + 1;
            setSelectedItems(history[nextIdx].items);
            return nextIdx;
          });
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [history, historyIndex, isReadOnly]);

  // Draft Auto-save
  useEffect(() => {
    // Waits for the session user so the draft is never written before
    // ownership is known, and never at all by someone who only reads: saveAll
    // deletes the rows before inserting, which for a reader would be refused
    // halfway through.
    if (!id || historyIndex === -1 || currentUserId === null || isReadOnly) return;
    // Opening a past version (?version=...) is for looking at it, not for
    // silently replacing the live draft with it the moment a second passes.
    if (versionId) return;
    // Never write the very first, untouched state right after load: if the
    // initial fetch of the draft came back empty or incomplete without
    // throwing (a dropped connection, a backgrounded tab, ...), this would be
    // the one save that persists that wrong snapshot over the real data.
    // Once the user makes any change, history grows past this single entry
    // and autosaving resumes normally.
    if (historyIndex === 0 && history.length === 1) return;
    const saveDraft = async () => {
      await db.items.saveAll(id, selectedItems.map(i => {
        // SETOP and SUDECAP services are stored like custom items: the SEE catalogue has
        // no entry to rebuild their description, unit and price from.
        const payload = usesOutrosSection(i.item)
          ? { occurrences: i.occurrences, source: i.source, custom: { code: i.customCode, title: i.customTitle, description: i.customDescription, unit: i.customUnit, price: i.customPrice } }
          : { occurrences: i.occurrences };
        
        return {
          item_code: i.item,
          quantity: '',
          memory: JSON.stringify(payload),
          location: ''
        } as any;
      }));
    };
    const timer = setTimeout(saveDraft, 1000);
    return () => clearTimeout(timer);
  }, [selectedItems, id, historyIndex, currentUserId, isReadOnly, versionId, history.length]);

  // Notes Auto-save. Runs independently of the draft/items autosave above —
  // it only ever touches workbooks.observacoes, never the item rows or the
  // exported sheet.
  useEffect(() => {
    if (!id || !workbook || isReadOnly || notesUnavailable) return;
    if (notesText === (workbook.observacoes || '')) return;
    setIsSavingNotes(true);
    const timer = setTimeout(async () => {
      try {
        await db.workbooks.update(id, { observacoes: notesText });
        setWorkbook(wb => wb ? { ...wb, observacoes: notesText } : wb);
      } catch (err: any) {
        // database/notepad.sql has not been run yet: the column doesn't
        // exist, so stop retrying for the rest of this session instead of
        // failing on every keystroke.
        if (err?.code === 'PGRST204' || err?.code === '42703') setNotesUnavailable(true);
        console.error('Erro ao salvar notas:', err);
      } finally {
        setIsSavingNotes(false);
      }
    }, 800);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notesText, id, isReadOnly, notesUnavailable]);

  const fetchUserProfile = async () => {
    try {
      // Taken from the session, not from the profile row, so a missing row
      // cannot leave the owner of a workbook looking like a stranger to it.
      setCurrentUserId(await db.auth.getUserId());
    } catch (err) {
      console.error('Error reading the session user:', err);
    }

    try {
      const u = await db.auth.getUser();
      if (u) {
        setUserSre(u.sre || '');
        if (u.nome) setUserName(u.nome);
      }
    } catch (err) {
      console.error('Error fetching user profile:', err);
    }
  };

  useEffect(() => {
    fetchUserProfile();
    if (!id) return;
    
    const loadData = async () => {
      const wb = await db.workbooks.get(id);
      if (!wb) {
        navigate('/dashboard');
        return;
      }
      setWorkbook(wb);
      setHeaderForm(wb);
      setNotesText(wb.observacoes || '');

      let loadedItems: any[] = [];
      
      if (versionId) {
        const versions = await db.versions.list(id);
        const version = versions.find(v => v.id === versionId);
        if (version) {
          const itemsJson = version.items_json;
          loadedItems = typeof itemsJson === 'string' ? JSON.parse(itemsJson) : itemsJson;
          setLastSavedItemsJson(typeof itemsJson === 'string' ? itemsJson : JSON.stringify(itemsJson));
        } else {
          showToast("Versão não encontrada.", "error");
        }
      } else {
        loadedItems = await db.items.list(id);
        const versions = await db.versions.list(id);
        if (versions.length > 0) {
          const itemsJson = versions[0].items_json;
          setLastSavedItemsJson(typeof itemsJson === 'string' ? itemsJson : JSON.stringify(itemsJson));
        } else {
          setLastSavedItemsJson(JSON.stringify(loadedItems));
        }
      }
      
      const currentBase = (wb.base_precos || '2025') as PriceBase;
      setPriceBase(currentBase);
      // All bases are awaited together: a budget may hold SETOP or SUDECAP
      // services, and restoring one needs its catalogue entry, so starting
      // without it would silently drop those items from the budget.
      const loadExternal = (base: 'SETOP' | 'SUDECAP') => loadExternalCatalog(base).catch(err => {
        console.error(`Base ${base} indisponível:`, err);
        return [] as CatalogItem[];
      });
      Promise.all([loadCatalog(currentBase), loadExternal('SETOP'), loadExternal('SUDECAP')])
        .then(([data, setopData, sudecapData]: [CatalogItem[], CatalogItem[], CatalogItem[]]) => {
          const externalData = [...setopData, ...sudecapData];
          setCatalog(data);
          setExternalCatalog(externalData);

          let restoredItems: SelectedItem[] = [];
          if (loadedItems.length > 0) {
            restoredItems = loadedItems.map((loaded): SelectedItem | null => {
              const itemCode = loaded.item_code || loaded.item;
              // Support dynamic custom item IDs like 260001_abc1234
              const isCustomDynamic = typeof itemCode === 'string' && itemCode.startsWith('260001_');
              const lookupCode = isCustomDynamic ? '260001' : itemCode;
              const catItem = isExternalCode(lookupCode)
                ? externalData.find(c => c.item === lookupCode)
                : data.find(c => c.item === lookupCode);
              if (!catItem) return null;
              
              let parsedOccurrences = loaded.occurrences;
              let customData = null;

              if (!parsedOccurrences && loaded.memory && typeof loaded.memory === 'string') {
                if (loaded.memory.startsWith('{')) {
                  try {
                    const parsed = JSON.parse(loaded.memory);
                    if (parsed.occurrences) {
                      parsedOccurrences = parsed.occurrences;
                      customData = parsed.custom;
                    }
                  } catch (e) {}
                } else if (loaded.memory.startsWith('[')) {
                  try {
                    parsedOccurrences = JSON.parse(loaded.memory);
                  } catch (e) {}
                }
              }

              // Fallback for cloud version loading (items_json contains everything)
              if (loaded.customCode || loaded.customDescription || loaded.customTitle) {
                 customData = { code: loaded.customCode, title: loaded.customTitle, description: loaded.customDescription, unit: loaded.customUnit, price: loaded.customPrice };
              }

              return {
                ...(catItem as CatalogItem),
                item: itemCode, // preserve the dynamic ID
                customCode: customData?.code,
                customTitle: customData?.title,
                customDescription: customData?.description,
                customUnit: sanitizeUnit(customData?.unit),
                customPrice: customData?.price,
                occurrences: parsedOccurrences || [{
                  id: loaded.id || Math.random().toString(36).substring(2, 11),
                  quantity: loaded.quantity || '',
                  memory: loaded.memory || '',
                  location: loaded.location || ''
                }]
              };
            }).filter((item): item is SelectedItem => item !== null);
          }
          
          restoredItems.sort((a, b) => a.item.localeCompare(b.item));
          setSelectedItems(restoredItems);
          setHistory([{ items: restoredItems, description: 'Estado Inicial', timestamp: new Date() }]);
          setHistoryIndex(0);

          if (searchParams.get('showImportModal') === 'true') {
            const pendingStr = sessionStorage.getItem('pendingImportItems');
            if (pendingStr) {
              try {
                const pendingItems = JSON.parse(pendingStr);
                const itemMap = new Map<string, SelectedItem>();
                pendingItems.forEach((loaded: any) => {
                  const itemCode = loaded.item_code || loaded.item;
                  const isCustom = itemCode.startsWith('2600');
                  const lookupCode = isCustom ? '260001' : itemCode;
                  const catItem = data.find(c => c.item === lookupCode);
                  if (catItem) {
                    let customData = null;
                    if (isCustom && loaded.memory) {
                       try {
                          const memData = JSON.parse(loaded.memory);
                          if (memData.custom) customData = memData.custom;
                       } catch(e) {}
                    }
                    const occ = {
                      id: Math.random().toString(36).substring(2, 11),
                      quantity: loaded.quantity || '',
                      memory: loaded.memory || '',
                      location: loaded.location || ''
                    };
                    if (itemMap.has(itemCode)) {
                      itemMap.get(itemCode)!.occurrences.push(occ);
                    } else {
                      itemMap.set(itemCode, {
                        ...catItem,
                        item: itemCode,
                        occurrences: [occ],
                        ...(customData && {
                          customCode: customData.code,
                          customTitle: customData.title,
                          customDescription: customData.title,
                          customUnit: sanitizeUnit(customData.unit),
                          customPrice: customData.price
                        })
                      });
                    }
                  }
                });
                
                const parsedItems = Array.from(itemMap.values());
                if (parsedItems.length > 0) {
                  setImportCandidateItems(parsedItems);
                  setSelectedImportItems(new Set());
                  setImportSearchTerm('');
                  setIsImportModalOpen(true);
                  sessionStorage.removeItem('pendingImportItems');
                  // Remove parameter from URL quietly
                  const newParams = new URLSearchParams(searchParams);
                  newParams.delete('showImportModal');
                  navigate(`?${newParams.toString()}`, { replace: true });
                }
              } catch (e) {
                console.error(e);
              }
            }
          }
        })
        .catch(console.error);
    };

    loadData();
  }, [id, navigate, versionId]);

  const seeTree = useMemo(() => buildTree(catalog), [catalog]);
  const setopTree = useMemo(() => buildExternalTree(externalCatalog.filter(c => c.source === 'SETOP')), [externalCatalog]);
  const sudecapTree = useMemo(() => buildExternalTree(externalCatalog.filter(c => c.source === 'SUDECAP')), [externalCatalog]);
  // Who the workbook was shared by, for the notice shown to a reader.
  useEffect(() => {
    if (!isReadOnly || !id) return;
    let cancelled = false;
    db.sharing.ownerNames([id]).then(names => {
      if (!cancelled && names[id]) setSharedByName(names[id]);
    });
    return () => { cancelled = true; };
  }, [isReadOnly, id]);

  // A string key of the item codes currently in the budget. Its VALUE (not
  // reference) stays the same while an existing item's memory, quantity or
  // location is edited — only adding or removing an item changes it — so a
  // useMemo keyed on it can tell "an item was added/removed" apart from
  // "the text inside one was edited", which raw `selectedItems` cannot: that
  // array gets a new reference on every keystroke in any budget field.
  const selectedItemCodesKey = useMemo(() => selectedItems.map(i => i.item).join('|'), [selectedItems]);
  const selectedItemCodesSet = useMemo(() => new Set(selectedItemCodesKey ? selectedItemCodesKey.split('|') : []), [selectedItemCodesKey]);

  const tree = useMemo(() => [
    ...(activeBases.includes('SEE') ? seeTree : []),
    ...(activeBases.includes('SETOP') ? setopTree : []),
    ...(activeBases.includes('SUDECAP') ? sudecapTree : []),
  ], [activeBases, seeTree, setopTree, sudecapTree]);

  // What a search turns up in the bases that are switched off, offered below the
  // real results so a service is never missed just because its base is unchecked.
  const otherBasesTree = useMemo(() => [
    ...(activeBases.includes('SEE') ? [] : seeTree),
    ...(activeBases.includes('SETOP') ? [] : setopTree),
    ...(activeBases.includes('SUDECAP') ? [] : sudecapTree),
  ], [activeBases, seeTree, setopTree, sudecapTree]);

  // The last base cannot be switched off: an empty catalogue panel would look broken.
  const toggleBase = (base: BaseId, on: boolean) => {
    setActiveBases(prev => {
      if (on) return prev.includes(base) ? prev : ALL_BASES.filter(b => b === base || prev.includes(b));
      return prev.length > 1 ? prev.filter(b => b !== base) : prev;
    });
  };
  const activeBasesLabel = activeBases.length === ALL_BASES.length
    ? 'Todas'
    : activeBases.length === 1
      ? BASE_OPTIONS.find(option => option.value === activeBases[0])?.short
      : `${activeBases.length} bases`;

  const handleClose = () => {
    const isSaved = JSON.stringify(selectedItems) === lastSavedItemsJson;
    // A reader has nothing to save, so never gets the "unsaved changes" prompt.
    if (!isSaved && !isReadOnly) {
      setShowCloseConfirm(true);
    } else {
      navigate('/dashboard');
    }
  };

  const openForm = (item: CatalogItem) => {
    if (isReadOnly) return;
    let targetItem = item;
    if (item.item === '260001') {
      setCustomItemFields({ code: '', title: '', description: '', unit: '', price: 0 });
    } else if (item.item.startsWith('2600')) {
      setCustomItemFields({ code: item.item, title: '', description: item.description, unit: item.unit, price: item.price });
    } else if (isExternalCode(item.item)) {
      // A SETOP or SUDECAP service lands in the "OUTROS" block, which is filled from the
      // custom fields, so they start out holding what its base says.
      setCustomItemFields({ code: item.item, title: '', description: item.description, unit: item.unit, price: item.price });
    }

    const existing = item.item === '260001' ? undefined : selectedItems.find(i => i.item === targetItem.item);
    if (existing) {
      setFormOccurrences(existing.occurrences.length > 0 ? existing.occurrences : [{ id: Math.random().toString(36).substring(2, 11), memory: '', quantity: '', location: '' }]);
      if (usesOutrosSection(existing.item)) {
        setCustomItemFields({ 
          code: existing.customCode || existing.item, 
          title: existing.customTitle || '',
          description: existing.customDescription || existing.description, 
          unit: existing.customUnit || existing.unit, 
          price: existing.customPrice !== undefined ? existing.customPrice : existing.price 
        });
      }
    } else {
      setFormOccurrences([{ id: Math.random().toString(36).substring(2, 11), memory: '', quantity: '', location: '' }]);
    }
    setActiveFormItem(targetItem.item);

    setTimeout(() => {
      const el = document.getElementById(`catalog-item-${targetItem.item}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 100);
  };

  const toggleDescription = (itemCode: string, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setExpandedDescriptions(prev => {
      if (prev.has(itemCode)) {
        return new Set();
      } else {
        return new Set([itemCode]);
      }
    });
  };

  const handleStartCopy = (itemId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setCopyMemoryMode(itemId);
    setSelectedItemsForCopy(new Set());
  };

  const toggleItemForCopy = (itemId: string) => {
    setSelectedItemsForCopy(prev => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  };

  const applyCopyMemory = () => {
    if (!copyMemoryMode || selectedItemsForCopy.size === 0) return;
    
    const sourceItem = selectedItems.find(i => i.item === copyMemoryMode);
    if (!sourceItem || !sourceItem.occurrences || sourceItem.occurrences.length === 0) {
       setCopyMemoryMode(null);
       return;
    }
    const newItems = selectedItems.map(item => {
      if (selectedItemsForCopy.has(item.item)) {
         const copiedOccurrences = sourceItem.occurrences!.map(occ => ({
             ...occ,
             id: Date.now().toString() + Math.random().toString()
         }));
         return { ...item, occurrences: copiedOccurrences };
      }
      return item;
    });
    
    
    setSelectedItems(newItems);
    setHistory(h => {
      const newHistory = [...h.slice(0, historyIndex + 1), { items: newItems, description: 'Memória de cálculo copiada', timestamp: new Date() }];
      setHistoryIndex(newHistory.length - 1);
      return newHistory;
    });
    setCopyMemoryMode(null);
  };

  const cancelCopyMemory = () => {
    setCopyMemoryMode(null);
    setSelectedItemsForCopy(new Set());
  };

  const saveForm = () => {
    if (!activeFormItem) return;
    const catItem = isExternalCode(activeFormItem)
      ? externalCatalog.find(c => c.item === activeFormItem)
      : catalog.find(c => c.item === activeFormItem || activeFormItem.startsWith(c.item));
    const baseCatItem = catalog.find(c => c.item === '260001');
    if (!catItem && !baseCatItem) return;

    const isCustom = activeFormItem === '260001' || usesOutrosSection(activeFormItem);
    const isNewCustom = activeFormItem === '260001';

    const uniqueId = isNewCustom ? `260001_${Math.random().toString(36).substring(2, 9)}` : activeFormItem;

    const sourceItem = isNewCustom ? baseCatItem! : (catItem || baseCatItem!);

    const newItem: SelectedItem = {
      ...sourceItem,
      item: uniqueId,
      occurrences: formOccurrences,
      ...(isCustom && {
        customCode: customItemFields.code,
        customTitle: customItemFields.title,
        customDescription: customItemFields.description,
        customUnit: customItemFields.unit,
        customPrice: Number(customItemFields.price)
      })
    };
    const isEditing = !isNewCustom && selectedItems.some(i => i.item === activeFormItem);
    updateItems(prev => {
      if (isNewCustom) {
        // Always append new custom item
        return [...prev, newItem];
      }
      const exists = prev.find(i => i.item === activeFormItem);
      if (exists) return prev.map(i => i.item === activeFormItem ? newItem : i);
      return [...prev, newItem];
    }, isEditing ? `Item ${sourceItem.item} editado` : `Item ${sourceItem.item} adicionado ao orçamento`);
    setActiveFormItem(null);
  };

  const openEditForm = (item: SelectedItem) => {
    if (isReadOnly) return;
    setEditFormOccurrences(item.occurrences.length > 0 ? item.occurrences : [{ id: Math.random().toString(36).substring(2, 11), memory: '', quantity: '', location: '' }]);
    if (usesOutrosSection(item.item)) {
      setEditCustomItemFields({
        code: item.customCode || item.item,
        title: item.customTitle || '',
        description: item.customDescription || item.description,
        unit: item.customUnit || item.unit,
        price: item.customPrice !== undefined ? item.customPrice : item.price
      });
    }
    setActiveRightEditItem(item.item);
  };

  const saveEditForm = (itemCode: string) => {
    const isCustom = usesOutrosSection(itemCode);
    updateItems(prev => prev.map(i => {
      if (i.item === itemCode) {
        return {
          ...i,
          occurrences: editFormOccurrences,
          ...(isCustom && {
            customCode: editCustomItemFields.code,
            customTitle: editCustomItemFields.title,
            customDescription: editCustomItemFields.description,
            customUnit: editCustomItemFields.unit,
            customPrice: Number(editCustomItemFields.price)
          })
        };
      }
      return i;
    }), `Ocorrências/valores de ${itemCode} alterados`);
    setActiveRightEditItem(null);
  };

  const handleRemoveItem = (itemCode: string) => {
    updateItems(prev => prev.filter(i => i.item !== itemCode), `Item ${itemCode} removido`);
  };

  // Reference-stable wrappers for BudgetItemRow (wrapped in React.memo).
  // These functions close over state that changes every keystroke
  // (editFormOccurrences, editCustomItemFields, historyIndex, ...), so a
  // plain useCallback with the "right" deps would still get a new identity
  // on exactly the renders where it matters, which would make memo compare
  // unequal on every one of the 140 rows and defeat the whole point. A ref
  // always holds the latest version of the function, and the stable wrapper
  // below just calls whatever is in the ref — so the prop identity handed to
  // every row never changes, while the behavior is always up to date.
  const toggleDescriptionRef = useRef(toggleDescription);
  toggleDescriptionRef.current = toggleDescription;
  const stableToggleDescription = useCallback((itemCode: string, e: React.MouseEvent) => toggleDescriptionRef.current(itemCode, e), []);

  const handleStartCopyRef = useRef(handleStartCopy);
  handleStartCopyRef.current = handleStartCopy;
  const stableHandleStartCopy = useCallback((itemId: string, e: React.MouseEvent) => handleStartCopyRef.current(itemId, e), []);

  const toggleItemForCopyRef = useRef(toggleItemForCopy);
  toggleItemForCopyRef.current = toggleItemForCopy;
  const stableToggleItemForCopy = useCallback((itemId: string) => toggleItemForCopyRef.current(itemId), []);

  const openEditFormRef = useRef(openEditForm);
  openEditFormRef.current = openEditForm;
  const stableOpenEditForm = useCallback((item: SelectedItem) => openEditFormRef.current(item), []);

  const saveEditFormRef = useRef(saveEditForm);
  saveEditFormRef.current = saveEditForm;
  const stableSaveEditForm = useCallback((itemCode: string) => saveEditFormRef.current(itemCode), []);

  const handleRemoveItemRef = useRef(handleRemoveItem);
  handleRemoveItemRef.current = handleRemoveItem;
  const stableHandleRemoveItem = useCallback((itemCode: string) => handleRemoveItemRef.current(itemCode), []);

  const stableCancelEdit = useCallback(() => setActiveRightEditItem(null), []);

  const handleImportExcelCandidate = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || isReadOnly) return;

    try {
      const arrayBuffer = await file.arrayBuffer();
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(arrayBuffer);
      const ws = wb.getWorksheet("Plan1");

      if (!ws) {
        showToast("Aba 'Plan1' não encontrada no arquivo.", "error");
        return;
      }

      const itemMap = new Map<string, SelectedItem>();
      let currentItemCode: string | null = null;
      let currentTotalQty = '';

      ws.eachRow((row) => {
        const colB = cellText(row.getCell(2).value).toUpperCase();
        const colC = cellText(row.getCell(3).value).toUpperCase();
        if ((colB + ' ' + colC).includes('TOTAL CUSTO =') || (colB + ' ' + colC).includes('TOTAL GERAL =') || (colB + ' ' + colC).includes('VALIDAÇÃO')) {
          currentItemCode = null;
          return;
        }

        const colA = cellText(row.getCell(1).value).trim();
        const isItemCode = /^\d{6}$/.test(colA) && !colA.endsWith('00');
        // A SETOP or SUDECAP service is exported into the OUTROS block under its own code,
        // so reading a sheet back has to recognise it there too.
        const isExternal = isExternalCode(colA);
        const isCustom = colA.startsWith('2600') || isExternal;

        let occMemory = cellText(row.getCell(7).value).trim();
        let occQtyVal = row.getCell(8).value;
        if (occQtyVal && typeof occQtyVal === 'object' && 'result' in occQtyVal) {
          occQtyVal = (occQtyVal as any).result;
        }
        let occQty = (occQtyVal !== null && occQtyVal !== undefined && occQtyVal !== '') ? String(occQtyVal).trim() : '';
        const occLocation = cellText(row.getCell(9).value).trim();

        if (isItemCode || isCustom) {
          currentItemCode = colA;
          let qty = row.getCell(4).value;
          if (qty && typeof qty === 'object' && 'result' in qty) {
            qty = (qty as any).result;
          }
          currentTotalQty = (qty !== null && qty !== undefined && qty !== '') ? String(qty).trim() : '';

          const lookupCode = isCustom ? '260001' : currentItemCode;
          const catItem = isExternal
            ? externalCatalog.find(c => c.item === colA)
            : catalog.find(c => c.item === lookupCode);

          if (catItem && (currentTotalQty || occQty || occMemory || occLocation)) {
            let customData = null;
            if (isCustom) {
              const titleStr = cellText(row.getCell(2).value);
              const customUnit = cellText(row.getCell(3).value).trim();
              const customPrice = parseFloat(cellText(row.getCell(5).value) || '0');
              customData = { code: currentItemCode, title: titleStr, unit: customUnit, price: customPrice };
            }

            const occ = {
              id: Math.random().toString(36).substring(2, 11),
              quantity: occQty || currentTotalQty || '1',
              memory: occMemory,
              location: occLocation
            };

            if (itemMap.has(currentItemCode)) {
              itemMap.get(currentItemCode)!.occurrences.push(occ);
            } else {
              itemMap.set(currentItemCode, {
                ...catItem,
                item: currentItemCode,
                occurrences: [occ],
                ...(isCustom && customData && {
                  customCode: customData.code,
                  customTitle: customData.title,
                  customDescription: customData.title,
                  customUnit: sanitizeUnit(customData.unit),
                  customPrice: customData.price
                })
              });
            }
          }
        } else if (currentItemCode && (occMemory || occQty || occLocation)) {
          if (itemMap.has(currentItemCode)) {
            const occ = {
              id: Math.random().toString(36).substring(2, 11),
              quantity: occQty || '1',
              memory: occMemory,
              location: occLocation
            };
            itemMap.get(currentItemCode)!.occurrences.push(occ);
          }
        } else if (colA && !isItemCode && !isCustom) {
          currentItemCode = null;
        }
      });
      
      const parsedItems = Array.from(itemMap.values());
      if (parsedItems.length === 0) {
        showToast("Nenhum item válido encontrado para importação.", "error");
        return;
      }
      
      setImportCandidateItems(parsedItems);
      setSelectedImportItems(new Set());
      setImportSearchTerm('');
      setIsImportModalOpen(true);
    } catch (error) {
      console.error(error);
      showToast("Erro ao ler o arquivo XLSX.", "error");
    } finally {
      event.target.value = '';
    }
  };

  const handleConfirmImport = () => {
    const itemsToMerge = importCandidateItems.filter(i => selectedImportItems.has(i.item));
    if (itemsToMerge.length === 0) {
      setIsImportModalOpen(false);
      return;
    }
    
    updateItems(prev => {
      const next = [...prev];
      itemsToMerge.forEach(importItem => {
        const existingIdx = next.findIndex(i => i.item === importItem.item);
        if (existingIdx >= 0) {
          next[existingIdx] = {
            ...next[existingIdx],
            occurrences: [...next[existingIdx].occurrences, ...importItem.occurrences]
          };
        } else {
          next.push(importItem);
        }
      });
      return next;
    }, `${itemsToMerge.length} itens importados via XLSX`);
    
    setIsImportModalOpen(false);
    showToast(`${itemsToMerge.length} itens importados com sucesso.`, 'success');
  };

  // ---- EXPORT LOGIC ----
  const handleExportExcel = async () => {
    if (!workbook) return;
    try {
      setIsExporting(true);

      const is2026 = priceBase === '2026';
      const templatePath = getTemplatePath(priceBase);
      const response = await fetch(templatePath);
      const arrayBuffer = await response.arrayBuffer();

      const srcWb = new ExcelJS.Workbook();
      await srcWb.xlsx.load(arrayBuffer);
      
      const srcWs = srcWb.getWorksheet("Plan1");
      if (!srcWs) {
        throw new Error("Aba 'Plan1' não encontrada no template.");
      }

      // 1. Fill Header
      srcWs.getCell('A2').value = `ESCOLA ESTADUAL: ${workbook.escola || ''}`;
      srcWs.getCell('C2').value = `COD ESCOLA: ${workbook.cod_escola || ''}`;
      srcWs.getCell('G2').value = workbook.sre || '';
      srcWs.getCell('A3').value = `MUNICÍPIO: ${workbook.municipio || ''}`;
      srcWs.getCell('D3').value = workbook.iss ? parseFloat(workbook.iss) / 100 : 0.05;
      srcWs.getCell('F3').value = workbook.servicos || '';

      // Dates & Revision
      const monthNames = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"];
      const d = workbook.data_elaboracao ? new Date(`${workbook.data_elaboracao}T00:00:00`) : new Date();
      const monthStr = monthNames[d.getMonth()];
      const yearStr = String(d.getFullYear()).slice(-2);
      const formattedDate = workbook.data_elaboracao ? d.toLocaleDateString('pt-BR') : '';

      // Locate key footer / summary rows dynamically from template
      let rowTech = 0;
      let rowRev = 0;
      let rowTotalCusto = 0;
      let rowBdiProj = 0;
      let rowBdiObra = 0;
      let rowTotalGeral = 0;

      srcWs.eachRow((row, r) => {
        const colA = String(row.getCell(1).value || '').toUpperCase();
        const colB = String(row.getCell(2).value || '').toUpperCase();
        const colC = String(row.getCell(3).value || '').toUpperCase();
        const colD = String(row.getCell(4).value || '').toUpperCase();
        const colH = String(row.getCell(8).value || '').toUpperCase();

        if (colA.includes('TÉCNICO RESPONSÁVEL') || colA.includes('NOME DO TÉCNICO')) rowTech = r;
        if (colA.includes('QUANDO DA CELEBRAÇÃO') || colH.includes('REV 0') || colH.includes('REV 1')) rowRev = r;
        if ((colB + ' ' + colC).includes('TOTAL CUSTO =')) rowTotalCusto = r;
        if (colD.includes('BDI PROJETO')) rowBdiProj = r;
        if (colD.includes('BDI OBRA')) rowBdiObra = r;
        if (colC.includes('TOTAL GERAL =')) rowTotalGeral = r;
      });

      // Fill Technical responsibility fields
      if (rowTech > 0) {
        if (is2026) {
          srcWs.getCell(`A${rowTech}`).value = `Nome do técnico responsável pela elaboração da planilha: ${workbook.engenheiro ? workbook.engenheiro.toUpperCase() : ''}`;
          srcWs.getCell(`E${rowTech}`).value = `CREA/CAU/CFT: ${workbook.crea || ''}`;
          srcWs.getCell(`H${rowTech}`).value = `Data da elaboração:`;
          srcWs.getCell(`I${rowTech}`).value = formattedDate;
        } else {
          srcWs.getCell(`A${rowTech}`).value = `Técnico responsável pela elaboração da planilha: ${workbook.engenheiro ? workbook.engenheiro.toUpperCase() : ''}`;
          srcWs.getCell(`E${rowTech}`).value = `CREA: ${workbook.crea || ''}`;
          srcWs.getCell(`H${rowTech}`).value = `Data da elaboração:`;
          srcWs.getCell(`I${rowTech}`).value = formattedDate;
        }
      }

      // Fill Revision block
      if (rowRev > 0) {
        if (is2026) {
          srcWs.getCell(`I${rowRev}`).value = `REV ${String(workbook.rev || '0').padStart(2, '0')}  ${monthStr}/${yearStr}`;
        } else {
          const revCell = srcWs.getCell(`I${rowRev}`);
          revCell.value = `REV ${String(workbook.rev || '1').padStart(2, '0')}\n${monthStr}/${yearStr}`;
          revCell.alignment = { wrapText: true, horizontal: 'center', vertical: 'middle' };
        }
      }

      // 2. Fill Item Occurrences, Quantities, and Custom Items

      // Every custom item is backed by the same catalogue entry (260001), so
      // resolving its rows through the catalogue sends them all to one pair of
      // template rows and only the last one survives the export. The template
      // ships one slot per custom item (260001..260006); hand each item its
      // own slot so the whole "OUTROS" section comes out.
      const CUSTOM_SLOT_CODES = ['260001', '260002', '260003', '260004', '260005', '260006'];
      const customSlots = CUSTOM_SLOT_CODES
        .map(code => catalog.find(c => c.item === code))
        .filter((slot): slot is CatalogItem => !!slot && Array.isArray(slot.rows) && slot.rows.length > 0)
        .map(slot => slot.rows);

      // Hand-written custom items and SETOP/SUDECAP services share this block: neither
      // has a row of its own in the SEE template.
      const customItems = selectedItems.filter(i => usesOutrosSection(i.item));
      const customRowsByItem = new Map<string, number[]>();
      customItems.forEach((item, idx) => {
        if (idx < customSlots.length) customRowsByItem.set(item.item, customSlots[idx]);
      });

      // Anything past the sixth slot gets rows appended after the last one,
      // so a budget is not capped at six services from outside the SEE base.
      const overflowItems = customItems.slice(customSlots.length);
      const overflowAnchorRow = customSlots.length > 0
        ? customSlots[customSlots.length - 1][customSlots[customSlots.length - 1].length - 1]
        : 0;

      const rowsForItem = (item: SelectedItem): number[] => {
        if (usesOutrosSection(item.item)) return customRowsByItem.get(item.item) || [];
        const catItem = catalog.find(c => c.item === item.item);
        return (catItem && catItem.rows && catItem.rows.length > 0) ? catItem.rows : item.rows;
      };

      /**
       * The code an item is grouped under. Everything in the OUTROS block
       * answers 260001 whatever its own code is, which keeps the category and
       * subtotal matching below working off plain code prefixes.
       */
      const categoryCodeOf = (item: SelectedItem): string =>
        usesOutrosSection(item.item) ? '260001' : item.item;

      const extraOccurrencesMap = new Map<number, SelectedItemOccurrence[]>();

      selectedItems.forEach(item => {
        const isCustom = usesOutrosSection(item.item);
        const targetRows = rowsForItem(item);
        if (targetRows.length === 0) return;

        const totalQty = getItemTotalQuantity(item);

        if (isCustom && targetRows.length > 0) {
          const mainRow = srcWs.getRow(targetRows[0]);
          if (item.customCode) mainRow.getCell(1).value = item.customCode;
          
          let richText = [];
          if (item.customTitle) {
            richText.push({ font: { bold: true }, text: item.customTitle + (item.customDescription ? '\r\n' : '') });
          }
          if (item.customDescription) {
            richText.push({ font: { bold: false }, text: item.customDescription });
          }
          if (richText.length > 0) {
            mainRow.getCell(2).value = { richText };
          } else if (item.customDescription) {
            mainRow.getCell(2).value = item.customDescription;
          }

          if (item.customUnit) mainRow.getCell(3).value = item.customUnit;
          if (item.customPrice !== undefined) mainRow.getCell(5).value = item.customPrice;
          mainRow.commit();
        }

        item.occurrences?.forEach((occ, idx) => {
          if (idx < targetRows.length) {
            const row = srcWs.getRow(targetRows[idx]);
            const occQtd = Number(evaluateMath(occ.quantity)) || 0;
            if (occ.memory) {
              const normalizedMemory = occ.memory.replace(/(^|[^0-9]),(\d)/g, '$10,$2');
              row.getCell(7).value = normalizedMemory;
            }
            if (occQtd > 0) {
              row.getCell(8).value = occQtd;
            }
            if (occ.location) row.getCell(9).value = occ.location;
            row.commit();
          }
        });

        // If there are more occurrences than allocated rows, store extras to emit new rows
        if (item.occurrences && item.occurrences.length > targetRows.length && targetRows.length > 0) {
          const lastRow = targetRows[targetRows.length - 1];
          extraOccurrencesMap.set(lastRow, item.occurrences.slice(targetRows.length));
        }

        if (totalQty > 0 && targetRows.length > 0) {
          srcWs.getRow(targetRows[0]).getCell(4).value = totalQty;
        }
      });

      // 3. Determine Whitelist of Rows to Keep
      const rowsToKeep = new Set<number>();
      for (let r = 1; r <= 5; r++) rowsToKeep.add(r);
      for (let r = rowTotalCusto; r <= srcWs.rowCount; r++) rowsToKeep.add(r);

      const activeCategoryCodes = new Set<string>();
      const categoryItemRowsMap = new Map<string, number[]>();

      selectedItems.forEach(item => {
        // Overflow items have no template rows of their own, but their
        // category header and subtotal still have to survive the pruning.
        const targetRows = rowsForItem(item);

        targetRows.forEach(r => rowsToKeep.add(r));
        const groupingCode = categoryCodeOf(item);
        catalog.forEach(cat => {
          if (cat.isCategory) {
            const prefix = cat.item.replace(/(00)+$/, '');
            if (groupingCode.startsWith(prefix)) {
              activeCategoryCodes.add(cat.item);
              cat.rows.forEach(r => rowsToKeep.add(r));
              if (cat.item.endsWith('0000')) {
                if (!categoryItemRowsMap.has(cat.item)) categoryItemRowsMap.set(cat.item, []);
                targetRows.forEach(r => categoryItemRowsMap.get(cat.item)!.push(r));
              }
            }
          }
        });
      });

      // Match category subtotal rows
      const categorySubtotalRowMap = new Map<string, number>();
      let currentCatCode = '';
      for (let r = 6; r < rowTotalCusto; r++) {
        const colA = String(srcWs.getRow(r).getCell(1).value || '').trim();
        if (colA && /^\d{2}0000$/.test(colA)) currentCatCode = colA;
        const colC = String(srcWs.getRow(r).getCell(3).value || '').toUpperCase();
        if (colC.includes('SUB-TOT') || colC.includes('SUB-TOTAL')) {
          if (activeCategoryCodes.has(currentCatCode)) {
            rowsToKeep.add(r);
            categorySubtotalRowMap.set(currentCatCode, r);
          }
        }
      }

      const sortedKeptRows = Array.from(rowsToKeep).sort((a, b) => a - b);
      
      // Destination row plan (handles extra occurrences seamlessly)
      interface DestRowPlanItem {
        type: 'src' | 'extra';
        oldR?: number;
        newR: number;
        sampleOldR?: number;
        extraOcc?: SelectedItemOccurrence;
        /** Set when the row opens an OUTROS item that had no slot left. */
        overflowItem?: SelectedItem;
      }
      const destRowPlan: DestRowPlanItem[] = [];
      const rowOldToNew = new Map<number, number>();
      /** Destination row carrying each overflow item's code, price and total. */
      const overflowMainRow = new Map<string, number>();
      let nextDestRow = 1;

      sortedKeptRows.forEach(oldR => {
        rowOldToNew.set(oldR, nextDestRow);
        destRowPlan.push({ type: 'src', oldR, newR: nextDestRow });
        nextDestRow++;

        // Services that found no free slot are written straight after the last
        // one, one row per occurrence, before the OUTROS subtotal.
        if (oldR === overflowAnchorRow && overflowItems.length > 0) {
          const sampleOldR = customSlots[customSlots.length - 1][0];
          overflowItems.forEach(item => {
            const occurrences = item.occurrences && item.occurrences.length > 0
              ? item.occurrences
              : [{ id: '', quantity: '', memory: '', location: '' }];
            occurrences.forEach((occ, idx) => {
              if (idx === 0) overflowMainRow.set(item.item, nextDestRow);
              destRowPlan.push({
                type: 'extra',
                sampleOldR,
                extraOcc: occ,
                overflowItem: idx === 0 ? item : undefined,
                newR: nextDestRow,
              });
              nextDestRow++;
            });
          });
        }

        if (extraOccurrencesMap.has(oldR)) {
          const extras = extraOccurrencesMap.get(oldR)!;
          extras.forEach(extraOcc => {
            destRowPlan.push({
              type: 'extra',
              sampleOldR: oldR,
              extraOcc,
              newR: nextDestRow
            });
            nextDestRow++;
          });
        }
      });

      // 4. Create Clean Destination Workbook with Automatic Recalculation enabled
      const destWb = new ExcelJS.Workbook();
      destWb.calcProperties.fullCalcOnLoad = true;
      const destWs = destWb.addWorksheet("Plan1", {
        views: srcWs.views,
        properties: srcWs.properties,
        pageSetup: srcWs.pageSetup
      });

      // Copy column widths and properties, ensuring Column I is wide enough for single line date
      for (let c = 1; c <= 15; c++) {
        const col = srcWs.getColumn(c);
        if (col && col.width) {
          destWs.getColumn(c).width = c === 9 ? Math.max(col.width, 16) : col.width;
        }
      }

      // Copy images / media from template (e.g. SEEMG / Minas Gerais coat of arms in A1)
      const srcMedia = (srcWb as any).media;
      const wsImages = srcWs.getImages ? srcWs.getImages() : [];
      if (srcMedia && srcMedia.length > 0 && wsImages.length > 0) {
        const mediaIdMap = new Map<number, number>();
        srcMedia.forEach((m: any, oldId: number) => {
          const newId = destWb.addImage({
            buffer: m.buffer,
            extension: m.extension,
          });
          mediaIdMap.set(oldId, newId);
        });

        const placed = new Set<string>();
        wsImages.forEach((img: any) => {
          const key = `${img.imageId}_${img.range?.tl?.col}_${img.range?.tl?.row}`;
          if (placed.has(key)) return;
          placed.add(key);

          const newImageId = mediaIdMap.get(img.imageId) ?? 0;
          if (img.range) {
            if (img.range.ext) {
              destWs.addImage(newImageId, {
                tl: { col: img.range.tl?.col ?? 0, row: img.range.tl?.row ?? 0 },
                ext: { width: img.range.ext.width || 81, height: img.range.ext.height || 66 },
                editAs: img.range.editAs || 'oneCell'
              } as any);
            } else if (img.range.br) {
              destWs.addImage(newImageId, {
                tl: { col: img.range.tl?.col ?? 0, row: img.range.tl?.row ?? 0 },
                br: { col: img.range.br?.col ?? 1, row: img.range.br?.row ?? 1 },
                editAs: img.range.editAs || 'oneCell'
              } as any);
            } else {
              destWs.addImage(newImageId, {
                tl: { col: 0, row: 0 },
                ext: { width: 81, height: 66 },
                editAs: 'oneCell'
              } as any);
            }
          }
        });
      }

      // Formula adjuster helper
      const adjustFormula = (formula: string) => {
        return formula.replace(/(\$?[A-Z]+\$?\d+):(\$?[A-Z]+\$?\d+)|(\$?[A-Z]+\$?\d+)/g, (_, rangeStart, rangeEnd, singleCell) => {
          if (singleCell) {
            const parts = singleCell.match(/(\$?[A-Z]+)(\$?)(\d+)/);
            if (!parts) return singleCell;
            const [, col, dol, rStr] = parts;
            const r = parseInt(rStr, 10);
            if (!rowOldToNew.has(r)) return '0';
            return `${col}${dol}${rowOldToNew.get(r)}`;
          } else {
            const parts1 = rangeStart.match(/(\$?[A-Z]+)(\$?)(\d+)/);
            const r1 = parseInt(parts1[3], 10);
            const parts2 = rangeEnd.match(/(\$?[A-Z]+)(\$?)(\d+)/);
            const r2 = parseInt(parts2[3], 10);
            const newR1 = rowOldToNew.get(r1) || 1;
            const newR2 = rowOldToNew.get(r2) || newR1;
            return `${parts1[1]}${parts1[2]}${newR1}:${parts2[1]}${parts2[2]}${newR2}`;
          }
        });
      };

      // Save cell styles per row to preserve borders perfectly
      const savedStyles = new Map<number, any[]>();
      sortedKeptRows.forEach(oldR => {
        const oldRow = srcWs.getRow(oldR);
        const colStyles: any[] = [];
        for (let c = 1; c <= 12; c++) {
          const oldCell = oldRow.getCell(c);
          colStyles[c] = oldCell.style ? JSON.parse(JSON.stringify(oldCell.style)) : null;
        }
        savedStyles.set(oldR, colStyles);
      });

      // Populate destWs rows from plan
      destRowPlan.forEach(plan => {
        const newRow = destWs.getRow(plan.newR);
        if (plan.type === 'src' && plan.oldR) {
          const oldRow = srcWs.getRow(plan.oldR);
          if (oldRow.height) newRow.height = oldRow.height;
          for (let c = 1; c <= 12; c++) {
            const oldCell = oldRow.getCell(c);
            const newCell = newRow.getCell(c);

            if (oldCell.formula && typeof oldCell.formula === 'string') {
              const currentVal = oldCell.value as any;
              newCell.value = {
                ...currentVal,
                formula: adjustFormula(oldCell.formula),
                result: oldCell.result !== undefined ? oldCell.result : undefined
              };
            } else if (oldCell.value !== null && oldCell.value !== undefined) {
              newCell.value = oldCell.value;
            }
          }
        } else if (plan.type === 'extra' && plan.sampleOldR && plan.extraOcc) {
          const sampleRow = srcWs.getRow(plan.sampleOldR);
          newRow.height = sampleRow.height || 20;
          const styles = savedStyles.get(plan.sampleOldR);
          for (let c = 1; c <= 12; c++) {
            if (styles && styles[c]) {
              newRow.getCell(c).style = JSON.parse(JSON.stringify(styles[c]));
            }
          }
          const occQtd = Number(evaluateMath(plan.extraOcc.quantity)) || 0;
          if (plan.extraOcc.memory) {
            newRow.getCell(7).value = plan.extraOcc.memory.replace(/(^|[^0-9]),(\d)/g, '$10,$2');
          }
          if (occQtd > 0) newRow.getCell(8).value = occQtd;
          if (plan.extraOcc.location) newRow.getCell(9).value = plan.extraOcc.location;

          // The first row of an overflow item also carries the item itself,
          // the way a template slot would.
          const item = plan.overflowItem;
          if (item) {
            if (item.customCode) newRow.getCell(1).value = item.customCode;

            const richText = [];
            if (item.customTitle) {
              richText.push({ font: { bold: true }, text: item.customTitle + (item.customDescription ? '\r\n' : '') });
            }
            if (item.customDescription) {
              richText.push({ font: { bold: false }, text: item.customDescription });
            }
            if (richText.length > 0) {
              newRow.getCell(2).value = { richText };
            } else if (item.customDescription) {
              newRow.getCell(2).value = item.customDescription;
            }

            if (item.customUnit) newRow.getCell(3).value = item.customUnit;
            const totalQty = getItemTotalQuantity(item);
            if (totalQty > 0) newRow.getCell(4).value = totalQty;
            if (item.customPrice !== undefined) newRow.getCell(5).value = item.customPrice;
          }
        }
        newRow.commit();
      });

      // Re-apply cell merges accurately
      const originalMerges = srcWs.model.merges ? [...srcWs.model.merges] : [];
      originalMerges.forEach(rangeStr => {
        const parts = rangeStr.split(':');
        if (parts.length === 2) {
          const startMatch = parts[0].match(/([A-Z]+)(\d+)/);
          const endMatch = parts[1].match(/([A-Z]+)(\d+)/);
          if (startMatch && endMatch) {
            const c1 = startMatch[1];
            const r1 = parseInt(startMatch[2], 10);
            const c2 = endMatch[1];
            const r2 = parseInt(endMatch[2], 10);

            if (rowOldToNew.has(r1) && rowOldToNew.has(r2)) {
              const newR1 = rowOldToNew.get(r1)!;
              const newR2 = rowOldToNew.get(r2)!;
              if (newR1 <= newR2 && !(newR1 === newR2 && c1 === c2)) {
                try {
                  destWs.mergeCells(`${c1}${newR1}:${c2}${newR2}`);
                } catch (e) {}
              }
            }
          }
        }
      });

      // Restore cell styles after merges to prevent border and outline corruption
      sortedKeptRows.forEach(oldR => {
        const newR = rowOldToNew.get(oldR);
        const styles = savedStyles.get(oldR);
        if (newR && styles) {
          for (let c = 1; c <= 12; c++) {
            if (styles[c]) {
              destWs.getRow(newR).getCell(c).style = styles[c];
            }
          }
        }
      });

      // Ensure Date cell in Column I doesn't wrap and aligns cleanly
      const newRowTech = rowOldToNew.get(rowTech);
      if (newRowTech) {
        const dateCell = destWs.getRow(newRowTech).getCell(9);
        dateCell.alignment = { wrapText: false, horizontal: 'center', vertical: 'middle' };
      }

      // Reconstruct Category Subtotal formulas with explicit results
      let totalCustoSum = 0;
      const subtotalResults = new Map<string, number>();

      categorySubtotalRowMap.forEach((oldSubtotalR, catCode) => {
        const newSubtotalR = rowOldToNew.get(oldSubtotalR);
        const itemRows = categoryItemRowsMap.get(catCode) || [];
        if (itemRows.length > 0 && newSubtotalR) {
          const newRowsForCat = itemRows.map(r => rowOldToNew.get(r)!).filter(Boolean);
          // Overflow rows sit after the last slot and still belong to OUTROS,
          // so the summed range has to reach them.
          if (catCode === '260000') {
            overflowMainRow.forEach(r => newRowsForCat.push(r));
          }
          const newFirstItemR = Math.min(...newRowsForCat);
          const newLastItemR = Math.max(...newRowsForCat);

          let catSum = 0;
          selectedItems.forEach(it => {
            if (categoryCodeOf(it).startsWith(catCode.slice(0, 2))) {
              const qty = getItemTotalQuantity(it);
              const pr = it.customPrice !== undefined ? it.customPrice : it.price;
              catSum += (qty * pr);
            }
          });
          catSum = Math.round(catSum * 100) / 100;
          totalCustoSum += catSum;
          subtotalResults.set(catCode, catSum);

          destWs.getRow(newSubtotalR).getCell(6).value = {
            formula: `SUM(F${newFirstItemR}:F${newLastItemR})`,
            result: catSum
          };
        }
      });

      totalCustoSum = Math.round(totalCustoSum * 100) / 100;

      // Item total formulas with explicit results (Col F: D * E)
      selectedItems.forEach(it => {
        const targetRows = rowsForItem(it);
        const newMainR = targetRows.length > 0
          ? rowOldToNew.get(targetRows[0])
          : overflowMainRow.get(it.item);
        if (newMainR) {
          const qty = getItemTotalQuantity(it);
          const pr = it.customPrice !== undefined ? it.customPrice : it.price;
          const itemTot = Math.round(qty * pr * 100) / 100;
          destWs.getRow(newMainR).getCell(6).value = {
            formula: `D${newMainR}*E${newMainR}`,
            result: itemTot
          };
        }
      });

      // Grand Total & Summary formulas with explicit results
      const newRowTotalCusto = rowOldToNew.get(rowTotalCusto);
      const newRowTotalGeral = rowOldToNew.get(rowTotalGeral);
      const newSubtotalRows = Array.from(categorySubtotalRowMap.values()).map(r => rowOldToNew.get(r)).filter(Boolean);

      if (newRowTotalCusto) {
        const newTotalCustoFormula = newSubtotalRows.length > 0
          ? newSubtotalRows.map(r => `F${r}`).join('+')
          : '0';
        destWs.getRow(newRowTotalCusto).getCell(6).value = {
          formula: newTotalCustoFormula,
          result: totalCustoSum
        };
      }

      // BDI formulas & results
      const hasCat24 = activeCategoryCodes.has('240000');
      const cat24SubtotalRow = categorySubtotalRowMap.get('240000');
      const newCat24SubtotalR = cat24SubtotalRow ? rowOldToNew.get(cat24SubtotalRow) : null;
      const cat24Total = subtotalResults.get('240000') || 0;

      const newRowBdiProj = rowOldToNew.get(rowBdiProj);
      const newRowBdiObra = rowOldToNew.get(rowBdiObra);

      const issVal = workbook.iss ? parseFloat(workbook.iss) : 5;

      // BDI Obra varies with municipal ISS:
      // 2026: 2% -> 22.78%, 2.5% -> 23.10%, 3% -> 23.42%, 4% -> 24.08%, 5% -> 24.74%
      // 2025: 2% -> 22.47%, 2.5% -> 22.79%, 3% -> 23.12%, 4% -> 23.77%, 5% -> 24.43%
      const bdiObraPct = is2026
        ? (issVal === 2 ? 0.2278 : issVal === 2.5 ? 0.2310 : issVal === 3 ? 0.2342 : issVal === 4 ? 0.2408 : 0.2474)
        : (issVal === 2 ? 0.2247 : issVal === 2.5 ? 0.2279 : issVal === 3 ? 0.2312 : issVal === 4 ? 0.2377 : 0.2443);

      // BDI Projeto has fixed rate: 29.58% in 2026, 29.26% in 2025
      const bdiProjPct = is2026 ? 0.2958 : 0.2926;

      let bdiProjVal = 0;
      if (newRowBdiProj) {
        const projFormula = is2026
          ? 'IF(+D3=2%,29.58%,IF(D3=3%,29.58%,IF(D3=4%,29.58%,IF(D3=5%,29.58%,0))))'
          : 'IF(+D3=2%,29.26%,IF(D3=3%,29.26%,IF(D3=4%,29.26%,IF(D3=5%,29.26%,0))))';
        destWs.getRow(newRowBdiProj).getCell(3).value = {
          formula: projFormula,
          result: bdiProjPct
        };
        const projRef = hasCat24 && newCat24SubtotalR ? `F${newCat24SubtotalR}` : '0';
        bdiProjVal = Math.round(cat24Total * bdiProjPct * 100) / 100;
        destWs.getRow(newRowBdiProj).getCell(6).value = {
          formula: `${projRef}*C${newRowBdiProj}`,
          result: bdiProjVal
        };
      }

      let bdiObraVal = 0;
      if (newRowBdiObra && newRowTotalCusto) {
        const obraFormula = is2026
          ? 'IF(+D3=2%,22.78%,IF(D3=3%,23.42%,IF(D3=4%,24.08%,IF(D3=5%,24.74%,0))))'
          : 'IF(+D3=2%,22.47%,IF(D3=3%,23.12%,IF(D3=4%,23.77%,IF(D3=5%,24.43%,0))))';
        destWs.getRow(newRowBdiObra).getCell(3).value = {
          formula: obraFormula,
          result: bdiObraPct
        };
        const projRef = hasCat24 && newCat24SubtotalR ? `F${newCat24SubtotalR}` : '0';
        bdiObraVal = Math.round((totalCustoSum - cat24Total) * bdiObraPct * 100) / 100;
        destWs.getRow(newRowBdiObra).getCell(6).value = {
          formula: `(F${newRowTotalCusto}-${projRef})*C${newRowBdiObra}`,
          result: bdiObraVal
        };
      }

      const totalGeralVal = Math.round((totalCustoSum + bdiProjVal + bdiObraVal) * 100) / 100;
      if (newRowTotalGeral && newRowTotalCusto && newRowBdiObra) {
        destWs.getRow(newRowTotalGeral).getCell(6).value = {
          formula: `SUM(F${newRowTotalCusto}:F${newRowBdiObra})`,
          result: totalGeralVal
        };
      }

      // Set Header ANALISADO cell (F4) dynamically pointing to shifted TOTAL GERAL row
      if (newRowTotalGeral) {
        destWs.getCell('F4').value = {
          formula: `F${newRowTotalGeral}`,
          result: totalGeralVal
        };
      }

      growRowsToFitContent(destWs);

      const buffer = await destWb.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });

      const escolaName = (workbook.escola || '').trim().toUpperCase();
      const servicosName = (workbook.servicos || '').trim().toUpperCase();
      const fileName = `PLANILHA DE SERVIÇOS - ${escolaName} - ${servicosName}.xlsx`;

      saveAs(blob, fileName);

    } catch (error) {
      console.error(error);
      showToast("Erro ao exportar a planilha. Verifique o console.", "error");
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportPdf = async () => {
    if (!workbook || selectedItems.length === 0 || isExportingPdf) return;
    setIsExportingPdf(true);
    try {
      const element = document.getElementById('printable-spreadsheet-export');
      if (!element) {
        showToast("Elemento para exportação não encontrado.", "error");
        return;
      }

      const escolaName = (workbook.escola || '').trim().toUpperCase();
      const servicosName = (workbook.servicos || '').trim().toUpperCase();
      const fileName = servicosName 
        ? `PLANILHA DE SERVIÇOS - ${escolaName} - ${servicosName}.pdf`
        : `PLANILHA DE SERVIÇOS - ${escolaName}.pdf`;

      // Temporarily reveal element on top for screenshot capture
      element.style.display = 'block';
      element.style.position = 'fixed';
      element.style.left = '0px';
      element.style.top = '0px';
      element.style.width = '1100px';
      element.style.zIndex = '999999';
      element.style.backgroundColor = '#ffffff';

      // Wait for browser to lay out and paint
      await new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 80)));

      let dataUrl = '';
      try {
        dataUrl = await toJpeg(element, {
          quality: 0.90,
          pixelRatio: 1.5,
          backgroundColor: '#ffffff'
        });
      } finally {
        element.style.display = 'none';
      }

      const pdf = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a4'
      });

      const pageWidth = 297;
      const pageHeight = 210;
      const margin = 6; // mm, on every side
      const printableWidth = pageWidth - (margin * 2); // 287mm
      const pageContentHeight = pageHeight - (margin * 2); // 200mm

      const img = new Image();
      img.src = dataUrl;
      await new Promise(resolve => {
        img.onload = resolve;
      });

      const imgHeightInMm = (img.height * printableWidth) / img.width;

      if (imgHeightInMm <= pageContentHeight) {
        // Fits on single page
        pdf.addImage(dataUrl, 'JPEG', margin, margin, printableWidth, imgHeightInMm);
      } else {
        // Multi-page handling
        let heightLeft = imgHeightInMm;
        let position = margin;

        pdf.addImage(dataUrl, 'JPEG', margin, position, printableWidth, imgHeightInMm);
        heightLeft -= pageContentHeight;

        while (heightLeft > 0) {
          position = margin - (imgHeightInMm - heightLeft);
          pdf.addPage();
          pdf.addImage(dataUrl, 'JPEG', margin, position, printableWidth, imgHeightInMm);
          heightLeft -= pageContentHeight;
        }
      }

      pdf.save(fileName);
      showToast("PDF baixado com sucesso!", "success");
    } catch (error) {
      console.error(error);
      showToast("Erro ao gerar PDF. Verifique o console.", "error");
    } finally {
      setIsExportingPdf(false);
    }
  };

  const is2026Base = priceBase === '2026';
  const getBdiRate = (iss?: string) => {
    switch (iss) {
      case '2': return is2026Base ? 0.2278 : 0.2246;
      case '2.5': return is2026Base ? 0.2310 : 0.2279;
      case '3': return is2026Base ? 0.2342 : 0.2312;
      case '4': return is2026Base ? 0.2408 : 0.2377;
      case '5': return is2026Base ? 0.2474 : 0.2443;
      default: return is2026Base ? 0.2474 : 0.2443;
    }
  };

  // Walks every item and every occurrence, so it is kept off the path of
  // keystrokes that don't change the budget itself (editing a draft field,
  // typing in a search box): those re-render the editor without touching
  // selectedItems.
  const { totalObra, totalProj, totalBudget } = useMemo(() => selectedItems.reduce((acc, item) => {
    const cost = getItemTotalQuantity(item) * (item.customPrice !== undefined ? item.customPrice : item.price);
    acc.totalBudget += cost;
    if (item.item.startsWith('24')) {
      acc.totalProj += cost;
    } else {
      acc.totalObra += cost;
    }
    return acc;
  }, { totalObra: 0, totalProj: 0, totalBudget: 0 }), [selectedItems]);

  const bdiRate = getBdiRate(workbook?.iss);
  const bdiProjRate = is2026Base ? 0.2958 : 0.2926;
  const bdiObraAmount = totalObra * bdiRate;
  const bdiProjAmount = totalProj * bdiProjRate;
  const bdiAmount = bdiObraAmount + bdiProjAmount;
  const grandTotal = totalBudget + bdiAmount;

  const saveToCloud = async () => {
    if (!workbook || isReadOnly) return;

    const serializeForCompare = (items: any[]) => JSON.stringify(items.map(i => ({
      item: i.item_code || i.item, // handle both formats
      occurrences: i.occurrences,
      customCode: i.customCode,
      customTitle: i.customTitle,
      customDescription: i.customDescription,
      customUnit: i.customUnit,
      customPrice: i.customPrice
    })));

    try {
      const lastSavedParsed = JSON.parse(lastSavedItemsJson);
      if (serializeForCompare(lastSavedParsed) === serializeForCompare(selectedItems)) {
        showToast("O rascunho atual já está salvo na nuvem.", "success");
        return;
      }
    } catch (e) {
      // If parsing fails, just proceed to save
    }

    setIsSaving(true);
    try {
      await db.versions.create(workbook.id, selectedItems);
      await db.workbooks.update(workbook.id, { valor_total: Number(grandTotal.toFixed(2)) });
      setLastSavedItemsJson(JSON.stringify(selectedItems));
      showToast("Versão salva na nuvem com sucesso!", "success");
    } catch (e) {
      console.error(e);
      showToast("Erro ao salvar versão na nuvem.", "error");
    } finally {
      setIsSaving(false);
    }
  };

  // `groupName` keeps the accordions of one list from closing those of another
  // list that is on screen at the same time (they share the `name` attribute).
  // `budget` caps how many services a single search may draw: a one or two
  // letter term matches thousands of entries across the three bases, and
  // expanding all of them at once is what used to stall typing. The cap is
  // high enough that a real search is never truncated, and the panel says so
  // when it is.
  const renderTree = (nodes: TreeNode[], term: string, level: number = 0, groupName: string = 'catalog-categories', budget?: { left: number }): ReactNode => {
    const normalizedTerm = normalizeSearchText(term);

    const filterNode = (node: TreeNode): boolean => {
      if (!term) return true;
      // The normalized description is cached per node: this walk covers every
      // entry of every active base on each keystroke, and re-normalizing the
      // same thousands of descriptions each time was most of the search cost.
      if (normalizedDescriptionOf(node).includes(normalizedTerm)) return true;
      if (node.item.includes(term)) return true;
      if (node.children.some(filterNode)) return true;
      return false;
    };

    return nodes.filter(filterNode).map(node => {
      if (budget && !node.isCategory) {
        if (budget.left <= 0) return null;
        budget.left -= 1;
      }
      if (node.isCategory) {
        return (
          <details key={node.item} name={`${groupName}-${level}`} className="group mb-1" open={!!term}>
            <summary className="flex items-center gap-2 p-2 bg-slate-200 dark:bg-slate-800/80 hover:bg-slate-300 dark:hover:bg-slate-700/80 rounded-md cursor-pointer list-none select-none border border-transparent dark:border-slate-700 transition-colors">
              <ChevronRight size={16} className="text-slate-500 dark:text-slate-400 group-open:rotate-90 transition-transform shrink-0" />
              <span className="font-mono text-xs font-semibold text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-900 px-1.5 py-0.5 rounded border border-transparent dark:border-slate-700 shrink-0">{node.item}</span>
              <div className="flex gap-2 items-start flex-1 pr-2">
                <div className={`flex-1 ${expandedDescriptions.has(node.item) ? '' : 'line-clamp-3'}`}>
                  <span className="text-sm font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wide leading-tight whitespace-pre-wrap">{node.description}</span>
                  {(node.extendedDescription && expandedDescriptions.has(node.item)) && (
                    <div className="text-xs text-slate-600 dark:text-slate-400 whitespace-pre-wrap mt-1.5 pt-1.5 border-t border-slate-300 dark:border-slate-600 font-normal normal-case tracking-normal">{node.extendedDescription}</div>
                  )}
                </div>
                {(node.extendedDescription || node.description.length > 80) && (
                  <button onClick={(e) => toggleDescription(node.item, e)} className="text-slate-400 hover:text-emerald-600 p-0.5 rounded hover:bg-slate-300 dark:hover:bg-slate-700 shrink-0 mt-0.5">
                    {expandedDescriptions.has(node.item) ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                )}
              </div>
            </summary>
            <div className="pl-4 mt-1 border-l-2 border-slate-100 dark:border-slate-700 ml-3 flex flex-col gap-1">
              {renderTree(node.children, term, level + 1, groupName, budget)}
            </div>
          </details>
        );
      } else {
        const isCustomNode = node.item === '260001';
        const isAdded = isCustomNode
          ? false
          : selectedItemCodesSet.has(node.item);
        
        const isFormActive = isCustomNode
          ? activeFormItem?.startsWith('2600')
          : activeFormItem === node.item;

        return (
          <div key={node.item} id={`catalog-item-${node.item}`} className={`flex flex-col border rounded-lg transition-colors overflow-hidden ${isAdded ? 'border-emerald-200 bg-emerald-50/30' : 'border-slate-100 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-emerald-200'}`}>
            <div 
              className="flex justify-between items-start gap-4 p-3 cursor-pointer"
              onClick={() => !isAdded && (isFormActive ? setActiveFormItem(null) : openForm(node))}
            >
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-mono bg-slate-100 dark:bg-slate-800/50 text-slate-600 dark:text-slate-400 px-2 py-0.5 rounded">{node.item}</span>
                  <span className="text-sm font-bold text-slate-700 dark:text-slate-300">{node.price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} / {node.unit}</span>
                  {isAdded && <span className="flex items-center gap-1 text-xs font-medium text-emerald-600 bg-emerald-100 px-2 py-0.5 rounded-full"><CheckCircle size={12}/> Adicionado</span>}
                </div>
                <div className="flex gap-2 items-start mt-1">
                  <div className={`flex-1 ${isFormActive ? '' : (expandedDescriptions.has(node.item) ? '' : 'line-clamp-3')}`}>
                    <p className="text-sm text-slate-600 dark:text-slate-400 whitespace-pre-wrap">{node.description}</p>
                    {(node.extendedDescription && (isFormActive || expandedDescriptions.has(node.item))) && (
                      <div className="text-xs text-slate-500 dark:text-slate-400 whitespace-pre-wrap mt-1.5 pt-1.5 border-t border-slate-200 dark:border-slate-700">{node.extendedDescription}</div>
                    )}
                  </div>
                  {!isFormActive && (node.extendedDescription || node.description.length > 80) && (
                    <button onClick={(e) => toggleDescription(node.item, e)} className="text-slate-400 hover:text-emerald-600 p-0.5 rounded hover:bg-slate-100 dark:hover:bg-slate-700 shrink-0 mt-0.5">
                      {expandedDescriptions.has(node.item) ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  )}
                </div>
              </div>
            </div>

            {isFormActive && (
              <div className="p-3 bg-emerald-50/50 dark:bg-emerald-900/20 border-t border-emerald-100 dark:border-emerald-800 flex flex-col gap-3">
                {activeFormItem?.startsWith('2600') && (
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 mb-2 p-3 bg-white dark:bg-slate-800 rounded border border-emerald-200">
                    <div className="sm:col-span-1">
                      <label className="text-xs font-bold text-slate-600 dark:text-slate-400 block mb-1">Código</label>
                      <input type="text" value={customItemFields.code} onChange={e => setCustomItemFields({...customItemFields, code: e.target.value})} className="w-full px-2 py-1.5 rounded border text-sm outline-none focus:border-emerald-500" />
                    </div>
                    <div className="sm:col-span-3">
                      <label className="text-xs font-bold text-slate-600 dark:text-slate-400 block mb-1">Título</label>
                      <input type="text" value={customItemFields.title} onChange={e => setCustomItemFields({...customItemFields, title: e.target.value})} className="w-full px-2 py-1.5 rounded border text-sm outline-none focus:border-emerald-500" placeholder="Ex: Piso Cerâmico" />
                    </div>
                    <div className="sm:col-span-4">
                      <label className="text-xs font-bold text-slate-600 dark:text-slate-400 block mb-1">Descrição</label>
                      <input type="text" value={customItemFields.description} onChange={e => setCustomItemFields({...customItemFields, description: e.target.value})} className="w-full px-2 py-1.5 rounded border text-sm outline-none focus:border-emerald-500" placeholder="Detalhes opcionais..." />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="text-xs font-bold text-slate-600 dark:text-slate-400 block mb-1">Unidade</label>
                      <input type="text" value={customItemFields.unit} onChange={e => setCustomItemFields({...customItemFields, unit: e.target.value})} className="w-full px-2 py-1.5 rounded border text-sm outline-none focus:border-emerald-500" />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="text-xs font-bold text-slate-600 dark:text-slate-400 block mb-1">Preço</label>
                      <input type="number" step="0.01" value={customItemFields.price} onChange={e => setCustomItemFields({...customItemFields, price: Number(e.target.value)})} className="w-full px-2 py-1.5 rounded border text-sm outline-none focus:border-emerald-500" />
                    </div>
                  </div>
                )}
                {formOccurrences.map((occ, idx) => (
                  <div key={occ.id} className="bg-white dark:bg-slate-800 p-3 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm space-y-2.5">
                    <div className="flex items-center justify-between pb-1 border-b border-slate-100 dark:border-slate-700/60">
                      <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
                        Local #{idx + 1}
                      </span>
                      <div className="flex items-center gap-1">
                        <button 
                          type="button" 
                          onClick={() => duplicateOccurrence(setFormOccurrences, occ)} 
                          className="text-slate-400 hover:text-emerald-600 p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-700" 
                          title="Duplicar Local"
                        >
                          <Copy size={13}/>
                        </button>
                        {formOccurrences.length > 1 && (
                          <button 
                            type="button" 
                            onClick={() => removeOccurrence(setFormOccurrences, occ.id)} 
                            className="text-red-400 hover:text-red-600 p-1 rounded hover:bg-red-50 dark:hover:bg-red-950/30" 
                            title="Remover Local"
                          >
                            <Trash2 size={13}/>
                          </button>
                        )}
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-[1fr_56px] gap-2 items-start">
                      <div className="min-w-0">
                        <label className="flex items-center gap-1 text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                          <Calculator size={12} className="text-emerald-600"/> Memória de Cálculo
                        </label>
                        <input
                          type="text"
                          className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                          placeholder="Ex: 2*5, 3^2, raiz(16)"
                          value={occ.memory}
                          onChange={e => handleOccurrenceMathChange(formOccurrences, setFormOccurrences, occ.id, e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1 text-center truncate" title={`Qtd. (${node.unit})`}>
                          Qtd
                        </label>
                        <input
                          type="number"
                          className="w-full px-1 py-2 border border-slate-300 dark:border-slate-600 rounded-md text-sm focus:ring-2 focus:ring-emerald-500 outline-none bg-white dark:bg-slate-800 text-center font-bold"
                          placeholder="Qtd"
                          value={occ.quantity}
                          onChange={e => updateOccurrence(formOccurrences, setFormOccurrences, occ.id, 'quantity', e.target.value)}
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Local de Intervenção</label>
                      <input
                        type="text"
                        list="locations-list"
                        className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                        placeholder="Ex: Bloco A, Sala 3"
                        value={occ.location}
                        onChange={e => updateOccurrence(formOccurrences, setFormOccurrences, occ.id, 'location', e.target.value)}
                      />
                    </div>
                  </div>
                ))}
                <div className="flex justify-between items-center mt-1">
                  <button onClick={() => addOccurrence(setFormOccurrences)} className="text-sm font-medium text-emerald-600 hover:text-emerald-700 flex items-center gap-1">
                    <Plus size={16}/> Adicionar Local
                  </button>
                  <div className="flex gap-2">
                    <button onClick={() => setActiveFormItem(null)} className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:bg-slate-700 rounded-md">Cancelar</button>
                    <button onClick={() => saveForm()} className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-md flex items-center gap-2">
                      <CheckCircle size={16}/> {isAdded ? 'Salvar Alterações' : 'Adicionar ao Orçamento'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      }
    });
  };

  // catalog.find(c => c.description === name) was repeated for every group and
  // subgroup heading on every render of the budget list; this builds the
  // lookup once per catalog load instead of scanning it over and over.
  const catalogByDescription = useMemo(() => {
    const map = new Map<string, CatalogItem>();
    for (const c of catalog) if (!map.has(c.description)) map.set(c.description, c);
    return map;
  }, [catalog]);

  const groupedSelected = useMemo(() => {
    const groups: Record<string, Record<string, SelectedItem[]>> = {};
    const normalize = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    const term = normalize(deferredBudgetSearch.trim());
    // Everything an item shows in the list: its code and description, the
    // custom fields, and what was written in each memory and location.
    const matches = (item: SelectedItem) => !term || normalize([
      item.item, item.description, item.customCode, item.customTitle, item.customDescription,
      ...item.occurrences.flatMap(o => [o.memory, o.location]),
    ].filter(Boolean).join(' ')).includes(term);

    selectedItems.filter(matches).forEach(item => {
      // Custom, SETOP and SUDECAP services carry codes the SEE prefixes cannot classify
      // (ED-50701 would ask for category "ED0000"), and they are exported in
      // the OUTROS block, so that is where the list shows them too.
      const inOutros = usesOutrosSection(item.item);
      const catPrefix = inOutros ? "260000" : item.item.substring(0, 2) + "0000";
      const cat = catalog.find(c => c.item === catPrefix);
      const mainGroupName = cat ? cat.description : "Outros";

      const subCatPrefix = item.item.substring(0, 4) + "00";
      const subCat = inOutros ? undefined : catalog.find(c => c.item === subCatPrefix);

      let subGroupName = "";
      if (subCat && subCat.item !== catPrefix && subCat.description && subCat.description.trim() !== '') {
        subGroupName = subCat.description;
      }

      if (!groups[mainGroupName]) groups[mainGroupName] = {};
      if (!groups[mainGroupName][subGroupName]) groups[mainGroupName][subGroupName] = [];
      
      groups[mainGroupName][subGroupName].push(item);
    });
    return groups;
  }, [selectedItems, catalog, deferredBudgetSearch]);

  // Flat list of matching item codes in display order — used for Enter-key navigation.
  const budgetMatchIds = useMemo(() => {
    if (!deferredBudgetSearch) return [] as string[];
    const ids: string[] = [];
    Object.values(groupedSelected).forEach(subGroups => {
      Object.values(subGroups).forEach(its => {
        its.forEach(it => ids.push(it.item));
      });
    });
    return ids;
  }, [groupedSelected, deferredBudgetSearch]);

  // When the match list changes (new search term), reset to first result and scroll to it.
  useEffect(() => {
    setBudgetSearchIdx(0);
    if (budgetMatchIds.length > 0) {
      document.getElementById(`budget-item-${budgetMatchIds[0]}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [budgetMatchIds]);

  // The group and subgroup headings each show a sum over their items, and
  // every one of those sums walks the occurrences through evaluateMath. Doing
  // that inline in the JSX meant redoing all of it on every render, including
  // renders caused by typing in a field that changes none of it.
  const groupTotals = useMemo(() => {
    const main: Record<string, number> = {};
    const sub: Record<string, number> = {};
    for (const [mainGroupName, subGroups] of Object.entries(groupedSelected)) {
      let mainTotal = 0;
      for (const [subGroupName, items] of Object.entries(subGroups)) {
        const subTotal = items.reduce((acc, item) => acc + (getItemTotalQuantity(item) * (item.customPrice !== undefined ? item.customPrice : item.price)), 0);
        sub[`${mainGroupName}\u0000${subGroupName}`] = subTotal;
        mainTotal += subTotal;
      }
      main[mainGroupName] = mainTotal;
    }
    return { main, sub };
  }, [groupedSelected]);

  const uniqueLocations = useMemo(() => {
    const locs = new Set<string>();
    selectedItems.forEach(i => {
      i.occurrences.forEach(o => {
        if (o.location && o.location.trim() !== '') {
          locs.add(o.location.trim());
        }
      });
    });
    return Array.from(locs).sort();
  }, [selectedItems]);

  // The catalogue tree is built from thousands of entries (SEE + SETOP +
  // SUDECAP), and renderTree's only real dependency on the budget is which
  // item codes are in it (selectedItemCodesSet), not the live `selectedItems`
  // array. Without this memo, every keystroke anywhere in the component —
  // typing in an already-added item's memory or location, in the edit form,
  // even unrelated state like a toast — re-ran that whole tree walk and
  // rebuilt thousands of elements, which is what made typing feel laggy.
  const CATALOG_RENDER_CAP = 400;
  const catalogBudgetLeft = useRef(CATALOG_RENDER_CAP);
  const catalogResults = useMemo(
    () => {
      // Only a search can explode the node count: with no term the tree is
      // just the collapsed category headings.
      const budget = deferredSearchTerm ? { left: CATALOG_RENDER_CAP } : undefined;
      const nodes = renderTree(tree, deferredSearchTerm, 0, 'catalog-categories', budget) as ReactNode[];
      catalogBudgetLeft.current = budget ? budget.left : CATALOG_RENDER_CAP;
      return nodes;
    },
    [tree, deferredSearchTerm, selectedItemCodesSet, activeFormItem, expandedDescriptions, formOccurrences, customItemFields]
  );
  const catalogTruncated = !!deferredSearchTerm && catalogBudgetLeft.current <= 0;
  const catalogSuggestions = useMemo(
    () => (deferredSearchTerm && otherBasesTree.length > 0 ? renderTree(otherBasesTree, deferredSearchTerm, 0, 'catalog-suggestions', { left: CATALOG_RENDER_CAP }) as ReactNode[] : []),
    [otherBasesTree, deferredSearchTerm, selectedItemCodesSet, activeFormItem, expandedDescriptions, formOccurrences, customItemFields]
  );

  // Serializing the whole budget is not something to redo on every keystroke
  // in an unrelated field, so it only reruns when the budget itself changes.
  // Declared above the early return below: hooks must run on every render.
  const selectedItemsJson = useMemo(() => JSON.stringify(selectedItems), [selectedItems]);

  if (!workbook) return null;

  const isCloudSaveDisabled = isSaving || selectedItemsJson === lastSavedItemsJson;

  return (
    <div className="h-screen overflow-hidden bg-slate-100 dark:bg-slate-800/50 flex flex-col print:h-auto print:overflow-visible print:bg-white">
      <datalist id="locations-list">
        {uniqueLocations.map(loc => (
          <option key={loc} value={loc} />
        ))}
      </datalist>

      {/* MODAL DE CONFIRMAÇÃO DE SAÍDA */}
      {showCloseConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div 
            className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-200"
            onClick={() => setShowCloseConfirm(false)}
          />
          <div 
            className="relative w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 p-6 overflow-hidden z-10 animate-in fade-in zoom-in-95 duration-150"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setShowCloseConfirm(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              aria-label="Fechar"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-start gap-4 mb-4">
              <div className="p-3 rounded-xl shrink-0 bg-amber-500/10 dark:bg-amber-500/20 border border-amber-500/20 text-amber-600 dark:text-amber-400">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div className="pt-0.5 pr-6">
                <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                  Alterações não salvas
                </h3>
                <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 mt-0.5 truncate max-w-[280px]">
                  {workbook?.escola || 'Orçamento'}
                </p>
              </div>
            </div>

            <div className="mb-6 space-y-2">
              <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                Você possui modificações que ainda não foram salvas na nuvem. O que deseja fazer antes de sair?
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/60 p-2.5 rounded-lg border border-slate-100 dark:border-slate-800">
                Ao clicar em "Sair sem Salvar", as alterações recentes desta sessão serão descartadas.
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setShowCloseConfirm(false)}
                className="px-4 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => navigate('/dashboard')}
                className="px-4 py-2.5 text-sm font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 rounded-xl transition-colors"
              >
                Sair sem Salvar
              </button>
              <button
                type="button"
                onClick={async () => {
                  await saveToCloud();
                  navigate('/dashboard');
                }}
                className="px-5 py-2.5 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition-colors shadow-lg shadow-emerald-600/25"
              >
                Salvar e Sair
              </button>
            </div>
          </div>
        </div>
      )}

      {/* HEADER PRINCIPAL */}
      <header className="bg-emerald-800 text-white shadow-md h-[64px] flex items-center sticky top-0 z-10 print:hidden px-4">
        <div className="container mx-auto flex justify-between items-center w-full h-full">
          <div className="flex items-center gap-3">
            <FileSpreadsheet size={28} className="text-emerald-300 hidden sm:block" />
            <div className="flex flex-col justify-center">
              <h1 className="text-lg md:text-xl font-bold tracking-wide leading-tight">Portal de Orçamentos SEE-MG</h1>
              {userName && <span className="text-xs font-medium text-emerald-100">Engº. {userName}</span>}
            </div>
          </div>
          <div className="hidden md:flex gap-3 items-center">
            {isOwner && (
              <button
                onClick={() => setIsShareModalOpen(true)}
                className="flex items-center gap-2 text-emerald-200 hover:text-white px-3 py-2 rounded-lg text-sm font-bold transition-colors border border-emerald-700 hover:border-emerald-500"
                title="Compartilhar este orçamento com outros usuários"
              >
                <Share2 size={18} />
                <span className="hidden sm:inline">Compartilhar</span>
              </button>
            )}
            {isReadOnly && (
              <span className="flex items-center gap-2 text-amber-100 bg-amber-500/20 border border-amber-400/40 px-3 py-2 rounded-lg text-sm font-bold" title="Você tem acesso somente para leitura a este orçamento">
                <Lock size={16} />
                <span className="hidden sm:inline">Somente leitura</span>
              </span>
            )}
            {!isReadOnly && (
              <button
                onClick={() => setIsHistoryModalOpen(true)}
                className="flex items-center gap-2 text-emerald-200 hover:text-white px-3 py-2 rounded-lg text-sm font-bold transition-colors border border-emerald-700 hover:border-emerald-500"
                title="Histórico de Alterações (Ctrl+Z / Ctrl+Y)"
              >
                <History size={18} />
                <span className="hidden sm:inline">Histórico</span>
              </button>
            )}
            <button
              onClick={() => setIsNotesOpen(v => !v)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-bold transition-colors mr-2 border ${isNotesOpen ? 'bg-emerald-700 text-white border-emerald-500' : 'text-emerald-200 hover:text-white border-emerald-700 hover:border-emerald-500'}`}
              title="Notas e observações (não entram na planilha exportada)"
            >
              <StickyNote size={18} />
              <span className="hidden sm:inline">Notas</span>
            </button>

            <div className="flex gap-2 mr-2 border-r border-emerald-700/50 pr-5">
              {!isReadOnly && (
                <label className="flex items-center gap-2 bg-slate-600 hover:bg-slate-500 border border-slate-500 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-sm transition-all active:scale-95 cursor-pointer">
                  <FileSpreadsheet size={18} />
                  <span className="hidden sm:inline">Importar</span>
                  <input type="file" accept=".xlsx" className="hidden" onChange={handleImportExcelCandidate} />
                </label>
              )}
              <button
                onClick={handleExportPdf}
                disabled={selectedItems.length === 0 || isExportingPdf}
                className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg text-sm font-bold shadow-sm transition-all active:scale-95"
                title="Baixar PDF Oficial"
              >
                {isExportingPdf ? <Loader2 className="animate-spin" size={18} /> : <Printer size={18} />}
                <span className="hidden sm:inline">{isExportingPdf ? "Gerando..." : "PDF"}</span>
              </button>
              <button
                onClick={handleExportExcel}
                disabled={selectedItems.length === 0 || isExporting}
                className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 border border-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg text-sm font-bold shadow-sm transition-all active:scale-95"
              >
                <Download size={18} />
                <span className="hidden sm:inline">{isExporting ? "Gerando..." : "XLSX"}</span>
              </button>
            </div>
            
            <div className="flex gap-2">
              <div className="bg-emerald-900/40 border border-emerald-700/50 rounded-lg">
                <ThemeToggle />
              </div>
              {!isReadOnly && (
                <button
                  onClick={saveToCloud}
                  disabled={isCloudSaveDisabled}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold shadow-sm transition-colors ${isCloudSaveDisabled ? 'bg-emerald-900/40 text-emerald-300 cursor-not-allowed' : 'bg-emerald-600 hover:bg-emerald-500 text-white'}`}
                >
                  <Save size={18} /> {isSaving ? 'Salvando...' : 'Salvar Nuvem'}
                </button>
              )}
              <button onClick={handleClose} className="p-2 bg-emerald-900/50 hover:bg-red-600 rounded-lg transition-colors border border-emerald-700 hover:border-red-600" title="Fechar Editor">
                <X size={20} className="text-emerald-100" />
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto h-full flex flex-col gap-3 p-3 pb-20 md:pb-3 print:hidden flex-1 min-h-0 overflow-hidden">
        
        {isReadOnly && (
          <div role="status" className="flex items-center gap-2 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 text-amber-800 dark:text-amber-200 rounded-lg px-3 py-2 text-sm shrink-0 print:hidden">
            <Lock size={16} className="shrink-0" />
            <span>
              Orçamento compartilhado{sharedByName ? <> por <strong>{sharedByName}</strong></> : ''}. Você pode visualizar e exportar, mas não alterar.
            </span>
          </div>
        )}

        {/* Dados da Obra Info (FULL WIDTH) */}
        <div className="bg-emerald-50 dark:bg-emerald-900/40 border border-emerald-100 dark:border-emerald-800/50 rounded-lg px-3 h-[52px] shadow-sm flex flex-col justify-center relative group print:hidden shrink-0">
          {!isReadOnly && (
            <div className="absolute top-1/2 -translate-y-1/2 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={() => setIsHeaderEditModalOpen(true)}
                className="bg-white dark:bg-slate-800 text-emerald-700 dark:text-emerald-400 p-1.5 rounded-md shadow-sm border border-emerald-200 dark:border-emerald-700 hover:bg-emerald-100 dark:hover:bg-emerald-900/60"
                title="Editar Dados da Obra"
              >
                <Edit2 size={16} />
              </button>
            </div>
          )}
          <div className="flex flex-wrap md:flex-nowrap items-center justify-between gap-x-4 pr-12 w-full">
            <div className="overflow-hidden flex-shrink min-w-[100px] max-w-[250px]">
              <span className="text-[10px] uppercase font-bold text-emerald-600 dark:text-emerald-400 block">Escola</span>
              <span className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate block" title={workbook.escola}>{workbook.escola}</span>
            </div>
            <div className="overflow-hidden shrink-0">
              <span className="text-[10px] uppercase font-bold text-emerald-600 dark:text-emerald-400 block">Código</span>
              <span className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate block">{workbook.cod_escola || '-'}</span>
            </div>
            <div className="overflow-hidden shrink-0">
              <span className="text-[10px] uppercase font-bold text-emerald-600 dark:text-emerald-400 block">Município</span>
              <span className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate block">{workbook.municipio || '-'}</span>
            </div>
            <div className="overflow-hidden shrink-0 max-w-[200px]">
              <span className="text-[10px] uppercase font-bold text-emerald-600 dark:text-emerald-400 block">SRE</span>
              <span className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate block" title={workbook.sre}>{workbook.sre || '-'}</span>
            </div>
            <div className="overflow-hidden flex-shrink max-w-[250px]">
              <span className="text-[10px] uppercase font-bold text-emerald-600 dark:text-emerald-400 block">Serviços</span>
              <span className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate block" title={workbook.servicos}>{workbook.servicos || '-'}</span>
            </div>
            <div className="overflow-hidden shrink-0">
              <span className="text-[10px] uppercase font-bold text-emerald-600 dark:text-emerald-400 block">ISS</span>
              <span className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate block">{workbook.iss || 0}%</span>
            </div>
            <div className="overflow-hidden shrink-0">
              <span className="text-[10px] uppercase font-bold text-emerald-600 dark:text-emerald-400 block">Base</span>
              <span className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate block">{priceBase}</span>
            </div>
            <div className="overflow-hidden shrink-0 flex flex-col justify-center">
              <span className="text-[10px] uppercase font-bold text-emerald-600 dark:text-emerald-400 block">Status</span>
              <div className="h-5 flex items-center mt-0.5">
                <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border truncate ${
                  workbook.status === 'Finalizado' ? 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-800' :
                  workbook.status === 'Em revisão' ? 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800' :
                  'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-800'
                }`}>
                  {workbook.status || 'Em andamento'}
                </span>
              </div>
            </div>
            <div className="overflow-hidden shrink-0 flex flex-col items-end">
              <span className="text-[10px] uppercase font-bold text-emerald-600 dark:text-emerald-400 block">Rev</span>
              <span className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate block">{workbook.rev || '1'}</span>
            </div>
          </div>
        </div>

        <div className="flex flex-col lg:flex-row gap-3 flex-1 min-h-0 overflow-hidden">
          {/* Lado Esquerdo: Busca e Catálogo */}
          {/* The catalogue is only for adding services, which a reader cannot do. */}
          <div className={`flex flex-col h-[50vh] lg:h-full lg:w-1/3 gap-3 print:hidden min-h-0 overflow-hidden ${isReadOnly ? 'hidden' : ''}`}>
            {/* Caixa 1: Pesquisa */}
            <section className="bg-white dark:bg-slate-800 rounded-xl shadow-md border border-slate-200 dark:border-slate-700 p-3 shrink-0">
              <div className="flex gap-2">
                <div className="relative flex-1 min-w-0">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input
                    type="text"
                    className="w-full pl-10 pr-4 h-[52px] border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-shadow outline-none text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-900 shadow-sm"
                    placeholder="Buscar por nome ou código do serviço no catálogo..."
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                  />
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger
                    className="w-[116px] shrink-0 h-[52px] px-3 flex items-center justify-between gap-1 text-sm bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-600 rounded-lg shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 data-[state=open]:ring-2 data-[state=open]:ring-emerald-500"
                    title="Bases de preços exibidas no catálogo"
                  >
                    <span className="truncate">{activeBasesLabel}</span>
                    <ChevronDown size={16} className="shrink-0 opacity-50" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-44">
                    <DropdownMenuLabel className="text-xs text-slate-500">Bases de preços</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {BASE_OPTIONS.map(option => (
                      <DropdownMenuCheckboxItem
                        key={option.value}
                        checked={activeBases.includes(option.value)}
                        // Keeps the menu open so several bases can be switched in one go.
                        onSelect={e => e.preventDefault()}
                        onCheckedChange={checked => toggleBase(option.value, checked === true)}
                      >
                        {option.label}
                      </DropdownMenuCheckboxItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </section>

            {/* Caixa 2: Lista do Catálogo */}
            <section className="bg-white dark:bg-slate-800 rounded-xl shadow-md border border-slate-200 dark:border-slate-700 flex flex-col flex-1 min-h-0 overflow-hidden">
              <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-3 space-y-1 bg-slate-50 dark:bg-slate-900/30">
                {catalog.length === 0 ? (
                   <div className="text-center p-8 text-slate-400">Carregando catálogo...</div>
                ) : (
                   <>
                     {catalogResults}
                     {catalogTruncated && (
                       <p className="text-center text-[11px] text-slate-400 dark:text-slate-500 py-2">
                         Mostrando os primeiros {CATALOG_RENDER_CAP} serviços. Escreva mais para afinar a busca.
                       </p>
                     )}
                     {deferredSearchTerm && catalogResults.length === 0 && catalogSuggestions.length > 0 && (
                       <p className="text-center text-sm text-slate-400 py-4">Nenhum resultado nas bases marcadas.</p>
                     )}
                     {catalogSuggestions.length > 0 && (
                       <div className="mt-3">
                         <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 px-1 pb-2 flex items-center gap-2">
                           <span className="h-px flex-1 bg-slate-300 dark:bg-slate-700" />
                           Sugestões de outras bases
                           <span className="h-px flex-1 bg-slate-300 dark:bg-slate-700" />
                         </p>
                         {/* Faded like a watermark until pointed at, so it reads as a suggestion and not a result. */}
                         <div className="opacity-50 hover:opacity-100 focus-within:opacity-100 transition-opacity">
                           {catalogSuggestions}
                         </div>
                       </div>
                     )}
                   </>
                )}
              </div>
            </section>
          </div>

          {/* Lado Direito: Itens Selecionados */}
          <div className={`flex flex-col h-full ${isReadOnly ? 'lg:w-full' : 'lg:w-2/3'} print:border-none print:shadow-none print:h-auto print:block print:w-full gap-3 min-h-0 overflow-hidden`}>
            
            {/* Caixa 3: Totais */}
            <section className="bg-white dark:bg-slate-800 rounded-xl shadow-md border border-slate-200 dark:border-slate-700 p-3 shrink-0 print:bg-white print:border-none print:shadow-none print:p-0 print:mb-6">
              {/* Cabeçalho Impressão */}
              <div className="hidden print:block mb-4 border-b-2 border-emerald-800 pb-2">
                <div className="flex justify-between items-end mb-2">
                  <h1 className="text-2xl font-black text-emerald-900">
                    Relatório de Orçamento{workbook.servicos ? ` - ${workbook.servicos}` : ''}
                  </h1>
                  <p className="text-lg font-bold text-slate-700 dark:text-slate-300 print:!text-black">Rev {workbook.rev || '1'} - Data: {new Date(workbook.created_at).toLocaleDateString('pt-BR')}</p>
                </div>
                <div className="grid grid-cols-3 gap-y-1 gap-x-4 text-[13px] text-slate-700 dark:text-slate-300 print:!text-black">
                  <p><strong>Escola:</strong> {workbook.escola || '-'}</p>
                  <p><strong>Código:</strong> {workbook.cod_escola || '-'}</p>
                  <p><strong>Engenheiro:</strong> {workbook.engenheiro || '-'}</p>
                  <p><strong>Município:</strong> {workbook.municipio || '-'}</p>
                  <p><strong>SRE:</strong> {workbook.sre || '-'}</p>
                  <p><strong>CREA:</strong> {workbook.crea || '-'}</p>
                </div>
              </div>

              {/* Linha 2: Totais */}
              <div className="flex gap-3 print:hidden">
              {/* Busca nos itens já lançados, à esquerda dos totais */}
              <div className="relative w-[30%] min-w-[170px] shrink-0">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input
                  type="text"
                  className={`w-full pl-10 ${deferredBudgetSearch && budgetMatchIds.length > 0 ? 'pr-20' : 'pr-8'} h-[52px] border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-shadow outline-none text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-900 shadow-sm`}
                  placeholder="Buscar no orçamento"
                  title="Buscar nos itens já lançados no orçamento — Enter avança ao próximo, Shift+Enter volta"
                  value={budgetSearch}
                  onChange={e => setBudgetSearch(e.target.value)}
                  onKeyDown={e => {
                    if (e.key !== 'Enter' || budgetMatchIds.length === 0) return;
                    e.preventDefault();
                    const nextIdx = e.shiftKey
                      ? (budgetSearchIdx - 1 + budgetMatchIds.length) % budgetMatchIds.length
                      : (budgetSearchIdx + 1) % budgetMatchIds.length;
                    setBudgetSearchIdx(nextIdx);
                    document.getElementById(`budget-item-${budgetMatchIds[nextIdx]}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                  }}
                />
                {deferredBudgetSearch && budgetMatchIds.length > 0 && (
                  <span className="absolute right-8 top-1/2 -translate-y-1/2 text-[11px] text-slate-400 font-mono pointer-events-none select-none">
                    {budgetSearchIdx + 1}/{budgetMatchIds.length}
                  </span>
                )}
                {budgetSearch && (
                  <button
                    type="button"
                    onClick={() => { setBudgetSearch(''); setBudgetSearchIdx(0); }}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                    title="Limpar busca"
                  >
                    <X size={16} />
                  </button>
                )}
              </div>
              <div className={`grid gap-3 flex-1 min-w-0 ${totalProj > 0 ? 'grid-cols-4' : 'grid-cols-3'}`}>
                <div className="bg-sky-50 dark:bg-sky-900/30 border border-sky-200 dark:border-sky-800 rounded-lg px-3 h-[52px] flex flex-col justify-center shadow-sm">
                  <span className="text-[10px] uppercase font-bold text-sky-700 dark:text-sky-400">Custo Direto</span>
                  <span className="text-sm font-bold text-sky-900 dark:text-sky-200">{(totalObra + totalProj).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                </div>
                <div className="bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 rounded-lg px-3 h-[52px] flex flex-col justify-center shadow-sm">
                  <span className="text-[10px] uppercase font-bold text-amber-700 dark:text-amber-400">
                    BDI OBRA ({(bdiRate * 100).toFixed(2)}%)
                  </span>
                  <span className="text-sm font-bold text-amber-900 dark:text-amber-200">{bdiObraAmount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                </div>
                {totalProj > 0 && (
                  <div className="bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-200 dark:border-indigo-800 rounded-lg px-3 h-[52px] flex flex-col justify-center shadow-sm">
                    <span className="text-[10px] uppercase font-bold text-indigo-700 dark:text-indigo-400">
                      BDI PROJ ({(bdiProjRate * 100).toFixed(2)}%)
                    </span>
                    <span className="text-sm font-bold text-indigo-900 dark:text-indigo-200">{bdiProjAmount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                  </div>
                )}
                <div className="bg-emerald-100 dark:bg-emerald-900/40 border border-emerald-300 dark:border-emerald-700 rounded-lg px-3 h-[52px] flex flex-col justify-center shadow-sm">
                  <span className="text-[10px] uppercase font-bold text-emerald-800 dark:text-emerald-400">Total Geral</span>
                  <span className="text-sm font-bold text-emerald-950 dark:text-emerald-200">{grandTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                </div>
              </div>
              </div>
            </section>

            {/* Caixa 4: Lista do Orçamento */}
            <section className="bg-white dark:bg-slate-800 rounded-xl shadow-md border border-slate-200 dark:border-slate-700 flex flex-col flex-1 print:border-none print:shadow-none min-h-0 overflow-hidden">
              <div className="budget-scroll flex-1 min-h-0 overflow-y-auto p-3 space-y-6 print:overflow-visible print:p-0">
            {selectedItems.length > 0 && deferredBudgetSearch && Object.keys(groupedSelected).length === 0 ? (
              <p className="text-center text-sm text-slate-400 py-8">Nenhum item do orçamento corresponde à busca.</p>
            ) : selectedItems.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-400 print:hidden">
                <div className="bg-slate-100 dark:bg-slate-800/50 p-4 rounded-full">
                  <FileSpreadsheet size={48} className="text-slate-300" />
                </div>
                <p>Nenhum serviço adicionado ainda.<br/>Selecione um item no catálogo ao lado.</p>
              </div>
            ) : (
              Object.entries(groupedSelected).map(([mainGroupName, subGroups]) => {
                const mainGroupTotal = groupTotals.main[mainGroupName] || 0;

                return (
                <div key={mainGroupName} className="flex flex-col gap-[2px] mb-6">
                  {(() => {
                    const mainGroupCat = catalogByDescription.get(mainGroupName);
                    const mainGroupCode = mainGroupCat ? mainGroupCat.item : null;
                    return (
                      <div className="bg-emerald-200 dark:bg-emerald-800/50 border border-emerald-300 dark:border-emerald-700 rounded-lg px-3 py-2 shadow-sm print:shadow-none print:border-emerald-300">
                        <h3 className="text-sm font-bold text-emerald-900 dark:text-emerald-400 print:!text-emerald-900 uppercase tracking-wider flex justify-between items-center">
                          <div className="flex items-center gap-2">
                            {mainGroupCode && <span className="inline-flex items-center justify-center h-[18px] text-[10px] leading-none font-mono font-bold bg-white/60 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-300 print:text-emerald-900 print:bg-white px-1.5 rounded border border-emerald-300/50 dark:border-emerald-700 print:border-emerald-300">{mainGroupCode}</span>}
                            <span>{mainGroupName}</span>
                          </div>
                          <span className="text-emerald-900 dark:text-emerald-400 print:!text-emerald-900 font-bold">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(mainGroupTotal)}</span>
                        </h3>
                      </div>
                    );
                  })()}
                  <div className="flex flex-col gap-[2px]">
                    {Object.entries(subGroups).map(([subGroupName, items]) => {
                      const subGroupCat = catalogByDescription.get(subGroupName);
                      const subGroupCode = subGroupCat ? subGroupCat.item : null;
                      const subGroupTotal = groupTotals.sub[`${mainGroupName}\u0000${subGroupName}`] || 0;
                      return (
                      <div key={subGroupName} className="flex flex-col gap-[2px]">
                        {subGroupName && (
                          <div className="bg-emerald-100 dark:bg-emerald-900/40 border border-emerald-200 dark:border-emerald-700/80 rounded-md px-3 py-1.5 shadow-sm print:shadow-none print:border-emerald-200">
                            <div className="flex justify-between items-center">
                              <p className="text-[11px] font-bold text-emerald-800 dark:text-emerald-300 print:!text-emerald-900 uppercase tracking-wide flex items-center gap-2">
                                {subGroupCode && <span className="inline-flex items-center justify-center h-[18px] text-[10px] leading-none font-mono font-bold bg-white/60 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-300 print:text-emerald-900 print:bg-white px-1.5 rounded border border-emerald-300/50 dark:border-emerald-700 print:border-emerald-300">{subGroupCode}</span>}
                                <span>{subGroupName}</span>
                              </p>
                              <span className="text-[11px] font-bold text-emerald-800 dark:text-emerald-300 print:!text-emerald-900">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(subGroupTotal)}</span>
                            </div>
                          </div>
                        )}
                        <div className="flex flex-col gap-[2px]">
                          {items.map(item => {
                      const isEditing = activeRightEditItem === item.item;
                      const isCopySource = copyMemoryMode === item.item;
                      const isNavHighlighted = !!deferredBudgetSearch && budgetMatchIds[budgetSearchIdx] === item.item;
                      return (
                        <div
                          key={item.item}
                          id={`budget-item-${item.item}`}
                          className={isNavHighlighted ? 'ring-2 ring-emerald-400 ring-offset-1 rounded-lg' : undefined}
                        >
                        <BudgetItemRow
                          item={item}
                          isReadOnly={isReadOnly}
                          isEditing={isEditing}
                          isCopySource={isCopySource}
                          copyModeActive={!!copyMemoryMode}
                          isInCopySelection={selectedItemsForCopy.has(item.item)}
                          isDescExpanded={expandedDescriptions.has(item.item)}
                          editFormOccurrences={isEditing ? editFormOccurrences : EMPTY_OCCURRENCES}
                          setEditFormOccurrences={setEditFormOccurrences}
                          editCustomItemFields={isEditing ? editCustomItemFields : EMPTY_CUSTOM_FIELDS}
                          setEditCustomItemFields={setEditCustomItemFields}
                          onToggleForCopy={stableToggleItemForCopy}
                          onStartCopy={stableHandleStartCopy}
                          onToggleDescription={stableToggleDescription}
                          onEdit={stableOpenEditForm}
                          onRemove={stableHandleRemoveItem}
                          onCancelEdit={stableCancelEdit}
                          onSaveEdit={stableSaveEditForm}
                        />
                        </div>
                      );})}
                        </div>
                      </div>
                    ); })}
                  </div>
                </div>
                );
              })
            )}
          </div>
            </section>
          </div>
        </div>
      </main>
 
      {/* ESPELHO OFICIAL PARA EXPORTAÇÃO EM PDF */}
      <div 
        id="printable-spreadsheet-export"
        style={{
          display: 'none',
          backgroundColor: '#ffffff',
          color: '#000000',
          padding: '8px'
        }}
      >
        <PrintableSpreadsheet 
          workbook={workbook} 
          selectedItems={selectedItems} 
          catalog={catalog} 
        />
      </div>

      {/* MOBILE DOCK */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-emerald-800 p-2 flex justify-between items-center gap-2 z-40 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.2)] print:hidden pb-safe">
        <button
          onClick={handleExportPdf}
          disabled={selectedItems.length === 0 || isExportingPdf}
          className="flex-1 flex items-center justify-center bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white h-12 rounded-lg transition-all active:scale-95 shadow-sm"
          title="Baixar PDF Oficial"
        >
          {isExportingPdf ? <Loader2 className="animate-spin" size={22} /> : <Printer size={22} />}
        </button>
        <button
          onClick={handleExportExcel}
          disabled={selectedItems.length === 0 || isExporting}
          className="flex-1 flex items-center justify-center bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white h-12 rounded-lg transition-all active:scale-95 shadow-sm"
          title="Exportar XLSX"
        >
          {isExporting ? <Loader2 className="animate-spin" size={22} /> : <Download size={22} />}
        </button>
        {!isReadOnly && (
          <button
            onClick={saveToCloud}
            disabled={isCloudSaveDisabled}
            className={`flex-1 flex items-center justify-center h-12 rounded-lg shadow-sm transition-colors ${isCloudSaveDisabled ? 'bg-emerald-900/40 text-emerald-300 cursor-not-allowed' : 'bg-emerald-600 hover:bg-emerald-500 text-white'}`}
          >
            <Save size={22} />
          </button>
        )}
        <button onClick={handleClose} className="flex-1 flex items-center justify-center h-12 bg-emerald-900/50 hover:bg-red-600 text-emerald-100 hover:text-white rounded-lg transition-colors border border-emerald-700 hover:border-red-600" title="Fechar Editor">
          <X size={24} />
        </button>
      </div>

      {isShareModalOpen && isOwner && id && (
        <ShareModal
          workbookId={id}
          workbookName={`${workbook.escola}${workbook.servicos ? ` — ${workbook.servicos}` : ''}`}
          onClose={() => setIsShareModalOpen(false)}
        />
      )}

      {isNotesOpen && (
        <NotesPanel
          value={notesText}
          onChange={setNotesText}
          onClose={() => setIsNotesOpen(false)}
          isSaving={isSavingNotes}
          isReadOnly={isReadOnly}
          unavailable={notesUnavailable}
        />
      )}

      {/* HEADER EDIT MODAL */}
      {isHeaderEditModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex justify-center items-center z-50 p-4 overflow-y-auto custom-scrollbar">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-4xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 my-auto">
            <div className="p-6 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-900/50">
              <h2 className="text-xl font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                <Edit2 className="text-emerald-600" /> Editar Dados da Obra
              </h2>
              <button onClick={() => setIsHeaderEditModalOpen(false)} className="text-slate-400 hover:text-slate-600 dark:text-slate-400">
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={async (e) => {
              e.preventDefault();
              try {
                const newBase = (headerForm.base_precos || priceBase) as PriceBase;
                const { id: _id, created_at: _cat, updated_at: _uat, user_id: _uid, ...updatePayload } = headerForm as any;
                const updated = await db.workbooks.update(workbook.id, updatePayload);
                if (updated) {
                  setWorkbook(updated);
                  saveIssForMunicipio(updated.municipio, updated.iss);
                }
                // If price base changed, reload catalog and update item prices
                if (newBase !== priceBase) {
                  try {
                    const newCatalogData = await loadCatalog(newBase);
                    setCatalog(newCatalogData);
                    setPriceBase(newBase);
                    // Update prices of selected items (keep quantities, update prices from new catalog)
                    setSelectedItems(prev => prev.map(item => {
                      // Custom, SETOP and SUDECAP items keep their own prices: changing
                      // the SEE base does not reprice another base's services.
                      if (usesOutrosSection(item.item) && item.customPrice !== undefined) return item;
                      const newCatItem = newCatalogData.find(c => c.item === item.item);
                      if (newCatItem) {
                        return { ...item, price: newCatItem.price, description: newCatItem.description, unit: newCatItem.unit, extendedDescription: newCatItem.extendedDescription, rows: newCatItem.rows };
                      }
                      return item;
                    }));
                    showToast(`Base de preços alterada para ${getPriceBaseLabel(newBase)}. Preços atualizados!`, 'success');
                  } catch (err) {
                    console.error('Error loading new catalog:', err);
                    showToast('Erro ao carregar nova base de preços.', 'error');
                  }
                } else {
                  showToast("Dados atualizados com sucesso!", "success");
                }
                setIsHeaderEditModalOpen(false);
              } catch (err: any) {
                console.error('Error updating workbook header:', err);
                showToast(`Erro ao salvar: ${err.message || 'Verifique os dados.'}`, "error");
              }
            }} className="p-6 space-y-4 max-h-[70vh] overflow-y-auto custom-scrollbar">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="lg:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Escola Estadual</label>
                  <SchoolSearch 
                    value={headerForm.escola || ''} 
                    onChange={val => setHeaderForm({...headerForm, escola: val})} 
                    userSre={userSre}
                    onSelect={(escola) => {
                      setHeaderForm({
                        ...headerForm,
                        escola: escola.nome,
                        cod_escola: escola.codigo,
                        municipio: escola.municipio,
                        iss: getIssForMunicipio(escola.municipio)
                      });
                    }} 
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Cód. Escola</label>
                  <input type="text" value={headerForm.cod_escola || ''} readOnly className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md bg-slate-100 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 cursor-not-allowed outline-none" />
                </div>
                <div className="lg:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Município</label>
                  <input type="text" value={headerForm.municipio || ''} readOnly className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md bg-slate-100 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 cursor-not-allowed outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">S.R.E.</label>
                  <input type="text" value={headerForm.sre || ''} readOnly className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md bg-slate-100 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 cursor-not-allowed outline-none" />
                </div>
                <div className="lg:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Serviços da Planilha</label>
                  <input type="text" value={headerForm.servicos || ''} onChange={e => setHeaderForm({...headerForm, servicos: e.target.value})} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md focus:ring-2 focus:ring-emerald-500 outline-none" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">ISS (%)</label>
                    <input type="number" step="0.01" value={headerForm.iss || ''} onChange={e => setHeaderForm({...headerForm, iss: e.target.value})} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md focus:ring-2 focus:ring-emerald-500 outline-none" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Base</label>
                    <select value={headerForm.base_precos || priceBase} onChange={e => setHeaderForm({...headerForm, base_precos: e.target.value})} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md focus:ring-2 focus:ring-emerald-500 outline-none bg-white dark:bg-slate-800">
                      <option value="2026">2026</option>
                      <option value="2025">2025</option>
                    </select>
                  </div>
                </div>
                
                {(headerForm.base_precos || priceBase) !== priceBase && (
                  <div className="lg:col-span-3">
                    <p className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30 p-2 rounded border border-amber-200 dark:border-amber-800 flex items-center gap-1.5">
                      <AlertTriangle size={14} className="shrink-0" />
                      Alterar a base para {headerForm.base_precos} atualizará automaticamente os valores unitários dos itens ao salvar.
                    </p>
                  </div>
                )}
                
                <div className="col-span-full border-t border-slate-100 dark:border-slate-700 mt-2 pt-4">
                  <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">Informações Opcionais Adicionais</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-4">
                    <div className="lg:col-span-4">
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Engenheiro(a)</label>
                      <input type="text" value={headerForm.engenheiro || ''} onChange={e => setHeaderForm({...headerForm, engenheiro: e.target.value})} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md focus:ring-2 focus:ring-emerald-500 outline-none" placeholder="Nome" />
                    </div>
                    <div className="lg:col-span-2">
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">CREA</label>
                      <input type="text" value={headerForm.crea || ''} onChange={e => setHeaderForm({...headerForm, crea: e.target.value})} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md focus:ring-2 focus:ring-emerald-500 outline-none" placeholder="Número" />
                    </div>
                    <div className="lg:col-span-3">
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Data Elaboração</label>
                      <input type="date" value={headerForm.data_elaboracao || ''} onChange={e => setHeaderForm({...headerForm, data_elaboracao: e.target.value})} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md focus:ring-2 focus:ring-emerald-500 outline-none" />
                    </div>
                    <div className="lg:col-span-1">
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">REV</label>
                      <input type="number" min="0" value={headerForm.rev || '1'} onChange={e => setHeaderForm({...headerForm, rev: e.target.value})} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md focus:ring-2 focus:ring-emerald-500 outline-none" />
                    </div>
                    <div className="lg:col-span-2">
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Status</label>
                      <select value={headerForm.status || 'Em andamento'} onChange={e => setHeaderForm({...headerForm, status: e.target.value})} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md focus:ring-2 focus:ring-emerald-500 outline-none bg-white dark:bg-slate-800">
                        <option value="Em andamento">Em andamento</option>
                        <option value="Em revisão">Em revisão</option>
                        <option value="Finalizado">Finalizado</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="pt-6 flex justify-end gap-3 border-t border-slate-100 dark:border-slate-700 mt-6 sticky bottom-0 bg-white dark:bg-slate-800">
                <button type="button" onClick={() => setIsHeaderEditModalOpen(false)} className="px-5 py-2.5 text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:bg-slate-800/50 rounded-lg transition-colors">
                  Cancelar
                </button>
                <button type="submit" className="px-5 py-2.5 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors shadow-sm">
                  Salvar Alterações
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* HISTÓRICO MODAL */}
      {isHistoryModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex justify-center items-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[80vh]">
            <div className="p-4 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-900/50">
              <h2 className="text-lg font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                <History className="text-emerald-600" size={20} /> Histórico de Alterações
              </h2>
              <button onClick={() => setIsHistoryModalOpen(false)} className="text-slate-400 hover:text-slate-600 dark:text-slate-400 p-1 rounded-md hover:bg-slate-200 dark:bg-slate-700">
                <X size={20} />
              </button>
            </div>
            <div className="p-4 overflow-y-auto custom-scrollbar flex-1 flex flex-col gap-2">
              {history.map((h, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    setHistoryIndex(idx);
                    setSelectedItems(history[idx].items);
                  }}
                  className={`w-full text-left p-3 rounded-xl border flex flex-col gap-1 transition-all ${idx === historyIndex ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/40 shadow-sm' : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-900/50'}`}
                >
                  <div className="flex justify-between items-center w-full">
                    <span className={`font-semibold text-sm ${idx === historyIndex ? 'text-emerald-800 dark:text-emerald-100' : 'text-slate-700 dark:text-slate-300'}`}>
                      {h.description}
                    </span>
                    <span className="text-xs text-slate-400 font-mono">
                      {h.timestamp.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </span>
                  </div>
                  {idx === historyIndex && (
                    <span className="text-[10px] uppercase font-bold text-emerald-600 dark:text-emerald-400 tracking-wider">Estado Atual</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* IMPORT XLSX MODAL */}
      {isImportModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex justify-center items-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
            <div className="p-4 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-900/50">
              <h2 className="text-lg font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                <FileSpreadsheet className="text-emerald-600" size={20} /> Importar Itens da Planilha
              </h2>
              <button onClick={() => setIsImportModalOpen(false)} className="text-slate-400 hover:text-slate-600 dark:text-slate-400 p-1 rounded-md hover:bg-slate-200 dark:bg-slate-700">
                <X size={20} />
              </button>
            </div>
            
            <div className="p-4 border-b border-slate-100 dark:border-slate-700 bg-white dark:bg-slate-800 flex flex-col md:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input
                  type="text"
                  className="w-full pl-10 pr-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-shadow outline-none text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 shadow-sm h-[42px]"
                  placeholder="Buscar item para importar..."
                  value={importSearchTerm}
                  onChange={e => setImportSearchTerm(e.target.value)}
                />
              </div>
              <div className="w-full md:w-64">
                <Select value={importLocationFilter} onValueChange={setImportLocationFilter}>
                  <SelectTrigger className="w-full bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600 focus:ring-emerald-500 rounded-lg shadow-sm !h-[42px]">
                    <SelectValue placeholder="Local de Intervenção (Todos)" />
                  </SelectTrigger>
                  <SelectContent position="popper" sideOffset={4}>
                    <SelectItem value="all">Local de Intervenção (Todos)</SelectItem>
                    {Array.from(new Set(importCandidateItems.flatMap(i => i.occurrences.map(o => o.location.trim())).filter(Boolean))).sort().map(loc => (
                      <SelectItem key={loc} value={loc}>{loc}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="p-4 overflow-y-auto custom-scrollbar flex-1 bg-slate-50 dark:bg-slate-900/50">
              <div className="space-y-2">
                {importCandidateItems
                  .filter(i => {
                    if (importLocationFilter !== 'all' && !i.occurrences.some((o: any) => o.location.trim() === importLocationFilter)) return false;
                    if (!importSearchTerm) return true;
                    const normalize = (s: string) => (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
                    const term = normalize(importSearchTerm);
                    const matchText = normalize(i.customTitle || i.customDescription || i.description).includes(term);
                    const matchCode = normalize(i.item).includes(term);
                    const matchLocation = i.occurrences && i.occurrences.some((o: any) => normalize(o.location).includes(term));
                    return matchText || matchCode || matchLocation;
                  })
                  .map(item => (
                    <div key={item.item} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-3 rounded-xl flex gap-3 items-start hover:border-emerald-300 transition-colors cursor-pointer" onClick={() => {
                      const newSet = new Set(selectedImportItems);
                      if (newSet.has(item.item)) newSet.delete(item.item);
                      else newSet.add(item.item);
                      setSelectedImportItems(newSet);
                    }}>
                      <div className="pt-1">
                        <input type="checkbox" checked={selectedImportItems.has(item.item)} onChange={() => {}} className="w-4 h-4 text-emerald-600 rounded border-slate-300 dark:border-slate-600 focus:ring-emerald-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-mono font-bold bg-slate-100 dark:bg-slate-700/50 text-slate-600 dark:text-slate-400 px-1.5 py-0.5 rounded">{item.customCode || item.item}</span>
                          <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400">{getItemTotalQuantity(item)} {item.customUnit || item.unit}</span>
                        </div>
                        <p className="text-sm font-medium text-slate-800 dark:text-slate-200 line-clamp-2">{item.customTitle || item.customDescription || item.description}</p>
                      </div>
                    </div>
                  ))}
              </div>
            </div>

            <div className="p-4 border-t border-slate-100 dark:border-slate-700 bg-white dark:bg-slate-800 flex justify-between items-center">
              <button 
                onClick={() => {
                  const normalize = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
                  const term = normalize(importSearchTerm);
                  const filtered = importCandidateItems.filter(i => {
                    if (importLocationFilter !== 'all' && !i.occurrences.some((o: any) => o.location.trim() === importLocationFilter)) return false;
                    if (!importSearchTerm) return true;
                    return normalize(i.customTitle || i.customDescription || i.description).includes(term) || i.item.includes(term);
                  });
                  
                  const allFilteredSelected = filtered.every(i => selectedImportItems.has(i.item));
                  
                  const newSet = new Set(selectedImportItems);
                  if (allFilteredSelected) {
                    filtered.forEach(i => newSet.delete(i.item));
                  } else {
                    filtered.forEach(i => newSet.add(i.item));
                  }
                  setSelectedImportItems(newSet);
                }}
                className="text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-emerald-700"
              >
                Selecionar/Desmarcar Visíveis
              </button>
              <div className="flex gap-3">
                <button onClick={() => setIsImportModalOpen(false)} className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:bg-slate-800/50 rounded-lg">Cancelar</button>
                <button onClick={handleConfirmImport} className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg">
                  Importar ({selectedImportItems.size}) Itens
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 pointer-events-none">
          <div className={`px-6 py-4 rounded-xl shadow-2xl flex items-center gap-3 animate-in fade-in slide-in-from-bottom-4 duration-300 ${toast.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'}`}>
            <span className="font-medium text-sm">{toast.message}</span>
          </div>
    </div>
      )}

      {/* COPY MEMORY FLOATING BAR */}
      {copyMemoryMode && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-bottom-4 duration-300 print:hidden">
          <div className="bg-white dark:bg-slate-800 shadow-2xl rounded-2xl border border-emerald-200 dark:border-emerald-800 p-4 flex flex-col gap-3 min-w-[300px]">
            <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400 font-medium">
              <Copy size={18} />
              <span>Copiando memória de cálculo...</span>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Selecione os itens na lista que deverão receber a mesma memória e local, mesmo que a unidade seja diferente.
            </p>
            <div className="flex justify-end gap-3 mt-1">
              <button onClick={cancelCopyMemory} className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/50 rounded-lg transition-colors">
                Cancelar
              </button>
              <button 
                onClick={applyCopyMemory} 
                disabled={selectedItemsForCopy.size === 0}
                className="px-4 py-2 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg shadow-sm transition-all"
              >
                Colar em {selectedItemsForCopy.size} {selectedItemsForCopy.size === 1 ? 'item' : 'itens'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
