import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Auth } from './pages/Auth';
import { Dashboard } from './pages/Dashboard';
import { Editor } from './pages/Editor';
import { Account } from './pages/Account';
import { FloatingChat } from './components/FloatingChat';
import { ConfirmModal } from './components/ConfirmModal';
import { useEffect, useState } from 'react';
import { db } from './services/db';
import { supabase } from './services/supabase';
import type { User } from './services/db';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [authAlertMessage, setAuthAlertMessage] = useState<string | null>(null);

  // Initialize Dark Mode
  useEffect(() => {
    const isDark = localStorage.getItem('theme') === 'dark' || 
      (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches);
    
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    async function loadSession() {
      const u = await db.auth.getUser();
      if (u && u.email && !u.email.endsWith('@educacao.mg.gov.br')) {
        await db.auth.signOut();
        if (mounted) {
          setAuthAlertMessage('Acesso negado: Utilize um e-mail institucional (@educacao.mg.gov.br)');
          setUser(null);
          setLoading(false);
        }
        return;
      }
      if (mounted) {
        setUser(u);
        setLoading(false);
      }
    }
    
    loadSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event) => {
      if (event === 'SIGNED_IN') {
        const u = await db.auth.getUser();
        if (u && u.email && !u.email.endsWith('@educacao.mg.gov.br')) {
          await db.auth.signOut();
          if (mounted) {
            setAuthAlertMessage('Acesso negado: Utilize um e-mail institucional (@educacao.mg.gov.br)');
            setUser(null);
            setLoading(false);
          }
          return;
        }
        if (mounted) {
          setUser(u);
          setLoading(false);
        }
      } else if (event === 'SIGNED_OUT') {
        if (mounted) {
          setUser(null);
          setLoading(false);
        }
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600"></div>
      </div>
    );
  }

  return (
    <Router>
      <Routes>
        <Route path="/auth" element={!user ? <Auth /> : <Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={user ? <Dashboard /> : <Navigate to="/auth" replace />} />
        <Route path="/editor/:id" element={user ? <Editor /> : <Navigate to="/auth" replace />} />
        <Route path="/conta" element={user ? <Account /> : <Navigate to="/auth" replace />} />
        <Route path="*" element={<Navigate to={user ? "/dashboard" : "/auth"} replace />} />
      </Routes>
      {user && <FloatingChat />}

      <ConfirmModal
        isOpen={!!authAlertMessage}
        title="Acesso Restrito"
        message={authAlertMessage || ''}
        description="O sistema é de uso exclusivo para servidores com e-mail institucional da Secretaria de Estado de Educação de Minas Gerais."
        variant="danger"
        confirmText="Entendido"
        showCancel={false}
        onConfirm={() => setAuthAlertMessage(null)}
        onClose={() => setAuthAlertMessage(null)}
      />
    </Router>
  );
}
