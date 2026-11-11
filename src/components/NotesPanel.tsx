import { useEffect, useRef, useState } from 'react';
import { StickyNote, X, Loader2, AlertTriangle, GripHorizontal } from 'lucide-react';

interface NotesPanelProps {
  value: string;
  onChange: (value: string) => void;
  onClose: () => void;
  isSaving: boolean;
  isReadOnly: boolean;
  unavailable: boolean;
}

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const STORAGE_KEY = 'notesPanelRect';
const MIN_WIDTH = 260;
const MIN_HEIGHT = 220;

const defaultRect = (): Rect => {
  const width = 320;
  const height = Math.max(MIN_HEIGHT, window.innerHeight - 180);
  return { x: window.innerWidth - width - 16, y: 80, width, height };
};

// Reading/writing a per-viewer convenience: where this viewer last left the
// panel. Never shared, never read back by the app logic — just so it doesn't
// snap back to the default corner every time it's reopened. Wrapped in
// try/catch since localStorage can throw (private browsing, blocked storage).
function loadRect(): Rect {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (typeof parsed.x === 'number' && typeof parsed.y === 'number' && typeof parsed.width === 'number' && typeof parsed.height === 'number') {
        return parsed;
      }
    }
  } catch { /* ignore */ }
  return defaultRect();
}

function saveRect(rect: Rect) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rect));
  } catch { /* ignore */ }
}

/** Keeps most of the panel on screen after a resize or a drag off-edge. */
function clampRect(rect: Rect): Rect {
  const width = Math.min(Math.max(rect.width, MIN_WIDTH), window.innerWidth - 24);
  const height = Math.min(Math.max(rect.height, MIN_HEIGHT), window.innerHeight - 24);
  const x = Math.min(Math.max(rect.x, 8 - width + 60), window.innerWidth - 60);
  const y = Math.min(Math.max(rect.y, 0), window.innerHeight - 60);
  return { x, y, width, height };
}

/**
 * A free-form notepad kept with the workbook, for observations and scratch
 * calculations. It floats alongside the editor rather than blocking it with a
 * modal backdrop, so it can stay open while the catalogue and budget list are
 * used normally — that was the point of adding it. Draggable by its header
 * and resizable from the bottom-right corner, so it can be moved off
 * whatever it would otherwise cover. It never touches the exported XLSX or
 * PDF — those are built straight from the template and the selected items,
 * with nothing read from here — so anything written stays private to the
 * editor screen.
 */
export function NotesPanel({ value, onChange, onClose, isSaving, isReadOnly, unavailable }: NotesPanelProps) {
  const [rect, setRect] = useState<Rect>(() => clampRect(loadRect()));
  const dragRef = useRef<{ mode: 'move' | 'resize'; startX: number; startY: number; start: Rect } | null>(null);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const dx = e.clientX - drag.startX;
      const dy = e.clientY - drag.startY;
      if (drag.mode === 'move') {
        setRect(clampRect({ ...drag.start, x: drag.start.x + dx, y: drag.start.y + dy }));
      } else {
        setRect(clampRect({ ...drag.start, width: drag.start.width + dx, height: drag.start.height + dy }));
      }
    };
    const onMouseUp = () => {
      if (!dragRef.current) return;
      dragRef.current = null;
      setRect(current => { saveRect(current); return current; });
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, []);

  const startDrag = (mode: 'move' | 'resize') => (e: React.MouseEvent) => {
    e.preventDefault();
    dragRef.current = { mode, startX: e.clientX, startY: e.clientY, start: rect };
  };

  return (
    <div
      role="dialog"
      aria-label="Notas e observações"
      className="print:hidden fixed z-40 bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 flex flex-col animate-in fade-in duration-200"
      style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height }}
    >
      <div
        onMouseDown={startDrag('move')}
        className="p-3.5 border-b border-slate-100 dark:border-slate-700 flex justify-between items-start gap-3 bg-slate-50 dark:bg-slate-900/50 rounded-t-2xl shrink-0 cursor-move select-none"
        title="Arraste para mover"
      >
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
            <StickyNote className="text-amber-500 shrink-0" size={17} /> Notas e observações
          </h2>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
            Não é exportado para o XLSX nem para o PDF.
          </p>
        </div>
        <button onClick={onClose} onMouseDown={e => e.stopPropagation()} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 shrink-0" title="Fechar">
          <X size={18} />
        </button>
      </div>

      <div className="p-3.5 flex-1 min-h-0 flex flex-col gap-2.5">
        {unavailable && (
          <div role="alert" className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-2.5 text-[11px] text-amber-800 dark:text-amber-200 flex items-start gap-1.5">
            <AlertTriangle size={13} className="shrink-0 mt-0.5" />
            <span>
              Não vai ser salvo nesta sessão: execute <code className="font-mono bg-amber-100 dark:bg-amber-900/50 px-1 rounded">database/notepad.sql</code> no Supabase.
            </span>
          </div>
        )}
        <textarea
          value={value}
          onChange={e => onChange(e.target.value)}
          readOnly={isReadOnly}
          placeholder="Observações, lembretes, contas de rascunho..."
          className="flex-1 min-h-0 w-full resize-none px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300"
        />
        <div className="flex items-center justify-end gap-1.5 text-[11px] text-slate-400 dark:text-slate-500 h-3.5 shrink-0">
          {!isReadOnly && isSaving && (<><Loader2 className="animate-spin" size={11} /> Salvando...</>)}
        </div>
      </div>

      {/* Resize handle */}
      <div
        onMouseDown={startDrag('resize')}
        className="absolute bottom-0 right-0 w-5 h-5 cursor-nwse-resize flex items-end justify-end p-0.5 text-slate-300 dark:text-slate-600 hover:text-slate-500 dark:hover:text-slate-400"
        title="Arraste para redimensionar"
      >
        <GripHorizontal size={13} className="rotate-45" />
      </div>
    </div>
  );
}
