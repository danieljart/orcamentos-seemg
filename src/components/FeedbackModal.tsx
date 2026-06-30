import React, { useState, useEffect } from 'react';
import { X, Send, Lightbulb, Bug } from 'lucide-react';
import { db } from '../services/db';
import { showToast } from '../lib/toast';

interface FeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function FeedbackModal({ isOpen, onClose }: FeedbackModalProps) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [type, setType] = useState('sugestao');
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      db.auth.getUser().then(user => {
        if (user) {
          setName(user.nome || '');
          setEmail(user.email || '');
        }
      });
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    if (!message.trim()) {
      showToast('Por favor, digite uma mensagem.', 'error');
      return;
    }

    setIsSubmitting(true);

    const form = e.currentTarget;
    const formData = new FormData(form);
    
    // Convert to URL-encoded string as required by Netlify Forms AJAX
    const encodedData = new URLSearchParams(formData as any).toString();

    try {
      await fetch('/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: encodedData,
      });
      
      showToast('Feedback enviado com sucesso! Obrigado.', 'success');
      setMessage('');
      onClose();
    } catch (error) {
      console.error('Error submitting form:', error);
      showToast('Erro ao enviar feedback. Tente novamente mais tarde.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between p-6 border-b border-slate-100 dark:border-slate-700">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-emerald-100 dark:bg-emerald-500/20 flex items-center justify-center">
              <Send className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-800 dark:text-white">Enviar Feedback</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">Sugestões de melhoria ou reporte de erros</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <form 
          name="feedback" 
          onSubmit={handleSubmit}
          className="p-6 space-y-4"
          data-netlify="true"
          netlify-honeypot="bot-field"
        >
          {/* Oculto: Nome do formulário para o Netlify */}
          <input type="hidden" name="form-name" value="feedback" />
          
          <div hidden>
            <input name="bot-field" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <button
              type="button"
              onClick={() => setType('sugestao')}
              className={`flex items-center justify-center gap-2 p-3 rounded-lg border text-sm font-medium transition-colors
                ${type === 'sugestao' 
                  ? 'border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/50' 
                  : 'border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800/50'}`}
            >
              <Lightbulb size={16} />
              Sugestão
            </button>
            <button
              type="button"
              onClick={() => setType('bug')}
              className={`flex items-center justify-center gap-2 p-3 rounded-lg border text-sm font-medium transition-colors
                ${type === 'bug' 
                  ? 'border-red-500 bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/50' 
                  : 'border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800/50'}`}
            >
              <Bug size={16} />
              Erro / Bug
            </button>
          </div>

          <input type="hidden" name="type" value={type} />

          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Nome
              </label>
              <input
                type="text"
                name="name"
                value={name}
                onChange={e => setName(e.target.value)}
                required
                className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-800 dark:text-white focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                E-mail
              </label>
              <input
                type="email"
                name="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-800 dark:text-white focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Mensagem
              </label>
              <textarea
                name="message"
                value={message}
                onChange={e => setMessage(e.target.value)}
                required
                placeholder={type === 'sugestao' ? "Como podemos melhorar a planilha?" : "Descreva o erro ou comportamento inesperado..."}
                className="w-full h-32 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-800 dark:text-white focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all resize-none"
              ></textarea>
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-medium py-2.5 px-4 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed mt-2"
          >
            {isSubmitting ? 'Enviando...' : 'Enviar Feedback'}
          </button>
        </form>
      </div>
    </div>
  );
}
