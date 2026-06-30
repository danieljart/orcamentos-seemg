import React, { useState, useEffect } from 'react';
import { MessageCircle, X, Send } from 'lucide-react';
import { db } from '../services/db';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export function FloatingChat() {
  const [isOpen, setIsOpen] = useState(false);
  const [tipo, setTipo] = useState('Suporte');
  const [assunto, setAssunto] = useState('');
  const [texto, setTexto] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [toast, setToast] = useState<{message: string, type: 'success' | 'error'} | null>(null);

  const [userName, setUserName] = useState('');
  const [userEmail, setUserEmail] = useState('');

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    // Carregar silenciosamente os dados do usuário
    db.auth.getUser().then(u => {
      if (u) {
        setUserName(u.nome || 'Usuário Desconhecido');
        setUserEmail(u.email || 'Sem e-mail');
      }
    });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assunto.trim() || !texto.trim()) {
      showToast('Preencha o assunto e a mensagem.', 'error');
      return;
    }

    setIsSubmitting(true);

    const formData = new FormData();
    formData.append('form-name', 'chat-feedback');
    formData.append('subject', `${tipo.toUpperCase()} - ${assunto}`);
    formData.append('message', `${texto}\n\n${userName} - ${userEmail}`);
    formData.append('bot-field', ''); // Honeypot

    const encodedData = new URLSearchParams(formData as any).toString();

    try {
      await fetch('/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: encodedData,
      });
      
      showToast('Mensagem enviada com sucesso!', 'success');
      setAssunto('');
      setTexto('');
      setTimeout(() => setIsOpen(false), 2000);
    } catch (error) {
      console.error(error);
      showToast('Erro ao enviar mensagem.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      {/* Toast Notification for Chat */}
      {toast && (
        <div className={`fixed bottom-24 right-4 z-[60] px-4 py-3 rounded-lg shadow-lg font-medium text-sm animate-in slide-in-from-bottom-5 fade-in duration-300
          ${toast.type === 'success' ? 'bg-emerald-500 text-white' : 'bg-red-500 text-white'}`}>
          {toast.message}
        </div>
      )}

      {/* Floating Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`fixed bottom-6 right-6 z-50 p-4 rounded-full shadow-2xl transition-all duration-300 flex items-center justify-center
          ${isOpen ? 'bg-slate-700 hover:bg-slate-800 text-white rotate-90 scale-90' : 'bg-emerald-600 hover:bg-emerald-500 text-white hover:scale-105'}`}
      >
        {isOpen ? <X size={24} className="-rotate-90" /> : <MessageCircle size={28} />}
      </button>

      {/* Chat Window */}
      {isOpen && (
        <div className="fixed bottom-24 right-6 z-50 w-80 bg-white dark:bg-slate-800 rounded-2xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom-10 fade-in duration-300 border border-slate-100 dark:border-slate-700">
          <div className="bg-emerald-600 p-4 text-white">
            <h3 className="font-bold text-lg">Central de Ajuda</h3>
            <p className="text-emerald-100 text-xs mt-1">Envie sua dúvida ou sugestão</p>
          </div>
          
          <form 
            name="chat-feedback" 
            data-netlify="true" 
            netlify-honeypot="bot-field"
            onSubmit={handleSubmit} 
            className="p-4 space-y-4"
          >
            <div>
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 uppercase tracking-wider">Tipo</label>
              <Select value={tipo} onValueChange={setTipo}>
                <SelectTrigger className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg">
                  <SelectValue placeholder="Selecione o tipo..." />
                </SelectTrigger>
                <SelectContent className="z-[60]">
                  <SelectItem value="Suporte">Suporte Técnico</SelectItem>
                  <SelectItem value="Feedback">Feedback Geral</SelectItem>
                  <SelectItem value="Sugestão">Sugestão de Melhoria</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 uppercase tracking-wider">Assunto</label>
              <input
                type="text"
                required
                value={assunto}
                onChange={(e) => setAssunto(e.target.value)}
                placeholder="Ex: Erro ao gerar PDF"
                className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-800 dark:text-white focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 uppercase tracking-wider">Mensagem</label>
              <textarea
                required
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                placeholder="Descreva o que aconteceu..."
                className="w-full h-28 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-800 dark:text-white focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all resize-none"
              ></textarea>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 px-4 rounded-xl transition-colors disabled:opacity-50 shadow-md active:scale-95"
            >
              {isSubmitting ? (
                'Enviando...'
              ) : (
                <>
                  <Send size={18} />
                  Enviar
                </>
              )}
            </button>
          </form>
        </div>
      )}
    </>
  );
}
