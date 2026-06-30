import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Auth } from './pages/Auth';
import { Dashboard } from './pages/Dashboard';
import { Editor } from './pages/Editor';
import { Account } from './pages/Account';
import { FloatingChat } from './components/FloatingChat';
import { useEffect, useState } from 'react';
import { db } from './services/db';
import { supabase } from './services/supabase';
import type { User } from './services/db';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

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
      if (mounted) {
        setUser(u);
        setLoading(false);
      }
    }
    
    loadSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event) => {
      if (event === 'SIGNED_IN') {
        const u = await db.auth.getUser();
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
    return <div className="min-h-screen bg-slate-100 flex items-center justify-center text-slate-500">Carregando...</div>;
  }

  return (
    <Router>
      <Routes>
        <Route path="/login" element={!user ? <Auth /> : <Navigate to="/dashboard" />} />
        <Route path="/dashboard" element={user ? <Dashboard /> : <Navigate to="/login" />} />
        <Route path="/editor/:id" element={user ? <Editor /> : <Navigate to="/login" />} />
        <Route path="/account" element={user ? <Account /> : <Navigate to="/login" />} />
        <Route path="*" element={<Navigate to={user ? "/dashboard" : "/login"} />} />
      </Routes>
      {user && <FloatingChat />}
    </Router>
  );
}
