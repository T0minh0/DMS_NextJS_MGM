"use client";

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  FaBars,
  FaBox,
  FaChartBar,
  FaHome,
  FaRecycle,
  FaShoppingCart,
  FaSignInAlt,
  FaSignOutAlt,
  FaUser,
  FaUsers,
} from 'react-icons/fa';

interface LayoutProps {
  children: React.ReactNode;
  activePath?: string;
}

interface User {
  id: string;
  name?: string;
  full_name?: string;
  userType: number;
  notFound?: boolean;
  cooperative_id?: string;
  cooperative_name?: string | null;
}

const navItems = [
  { href: '/', icon: FaHome, label: 'Dashboard' },
  { href: '/worker-productivity', icon: FaChartBar, label: 'Produtividade' },
  { href: '/materials', icon: FaBox, label: 'Materiais' },
  { href: '/manage-workers', icon: FaUsers, label: 'Usuários' },
  { href: '/sales', icon: FaShoppingCart, label: 'Vendas' },
  { href: '/profile', icon: FaUser, label: 'Meu Perfil' },
];

const navItemBaseClass =
  'flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium text-foreground/88 hover:bg-surface-elevated hover:text-foreground focus-visible:outline-none';

const Layout: React.FC<LayoutProps> = ({ children, activePath = '/' }) => {
  const [fabMenuOpen, setFabMenuOpen] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const fabRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    const persistUser = (nextUser: User) => {
      setUser(nextUser);
      localStorage.setItem('user', JSON.stringify(nextUser));
    };

    const userData = localStorage.getItem('user');

    if (!userData) {
      setLoading(false);
      return;
    }

    let parsedUser: User;
    try {
      parsedUser = JSON.parse(userData);
    } catch (error) {
      console.error('Failed to parse user data:', error);
      localStorage.removeItem('user');
      setLoading(false);
      return;
    }

    const fetchRealUserData = async () => {
      try {
        const response = await fetch(`/api/user?id=${parsedUser.id}`);

        if (!response.ok) {
          console.log('Fetching all users to debug...');
          await fetch('/api/users/all')
            .then((res) => res.json())
            .then((data) => console.log('Available users:', data))
            .catch((err) => console.error('Failed to fetch all users:', err));
        }

        if (response.ok) {
          const realUserData = await response.json();
          console.log('Real user data fetched:', realUserData);

          persistUser({
            ...parsedUser,
            full_name: realUserData.full_name || 'Carlos Ferreira',
            name: realUserData.name,
            cooperative_id: realUserData.cooperative_id,
            cooperative_name: realUserData.cooperative_name,
          });
        } else {
          persistUser({
            ...parsedUser,
            full_name: 'Carlos Ferreira',
            notFound: true,
            cooperative_id: parsedUser.cooperative_id,
            cooperative_name: parsedUser.cooperative_name,
          });
        }
      } catch (error) {
        console.error('Error fetching real user data:', error);

        persistUser({
          ...parsedUser,
          full_name: 'Carlos Ferreira',
          notFound: true,
          cooperative_id: parsedUser.cooperative_id,
          cooperative_name: parsedUser.cooperative_name,
        });
      } finally {
        setLoading(false);
      }
    };

    void fetchRealUserData();
  }, []);

  const toggleFabMenu = () => {
    setFabMenuOpen((current) => !current);
  };

  const handleLogout = async () => {
    try {
      const response = await fetch('/api/auth/logout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        localStorage.removeItem('user');
        setUser(null);
        router.push('/login');
      }
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (fabRef.current && !fabRef.current.contains(event.target as Node)) {
        setFabMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-6 text-center text-sm text-text-secondary">
        Carregando painel...
      </div>
    );
  }

  return (
    <div className="relative min-h-screen overflow-x-clip bg-background text-foreground">
      <nav className="sticky top-0 z-40 border-b border-outline/80 bg-[color:var(--scrim)] backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <Link
              href="/"
              className="group flex min-w-0 items-center gap-3 rounded-xl border border-outline/70 bg-surface/80 px-4 py-3 shadow-soft hover:border-primary/40 hover:bg-surface-alt"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-primary/35 bg-primary/14 text-primary shadow-glow">
                <FaRecycle className="h-5 w-5" />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-base font-semibold text-foreground uppercase">
                  Painel DMS
                </span>
                <span className="block truncate text-xs text-text-secondary">
                  Gestão diária de cooperativas
                </span>
              </span>
            </Link>

            {user ? (
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
                <Link
                  href="/profile"
                  className="flex min-w-0 items-center gap-3 rounded-xl border border-outline/70 bg-surface/72 px-4 py-3 hover:border-secondary/40 hover:bg-surface-alt"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-secondary/40 bg-secondary/12 text-secondary">
                    <FaUser className="h-4 w-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[11px] uppercase text-text-secondary">
                      Bem-vindo
                    </span>
                    <span className="block truncate text-sm font-semibold text-foreground">
                      {user.full_name || user.name || 'Usuário'}
                    </span>
                    {user.cooperative_name ? (
                      <span className="block truncate text-xs text-text-secondary">
                        {user.cooperative_name}
                      </span>
                    ) : null}
                  </span>
                </Link>

                <button
                  onClick={handleLogout}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-outline/70 bg-surface px-4 py-3 text-sm font-semibold text-foreground hover:border-error/50 hover:bg-error/14 hover:text-foreground"
                >
                  <FaSignOutAlt className="h-4 w-4" />
                  Sair
                </button>
              </div>
            ) : (
              <Link
                href="/login"
                className="inline-flex min-h-11 items-center justify-center gap-2 self-start rounded-xl border border-outline/70 bg-surface px-4 py-3 text-sm font-semibold text-foreground hover:border-primary/40 hover:bg-surface-alt hover:text-primary"
              >
                <FaSignInAlt className="h-4 w-4" />
                Entrar
              </Link>
            )}
          </div>
        </div>
      </nav>

      <div className="border-b border-outline/70 bg-background/95 px-4 py-3 sm:hidden">
        <div className="flex gap-2 overflow-x-auto pb-1">
          {navItems.map((item) => {
            const isActive = activePath === item.href;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`inline-flex min-h-11 shrink-0 items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium ${isActive ? 'border-primary/35 bg-primary/14 text-primary' : 'border-outline/70 bg-surface text-foreground/88'}`}
              >
                <item.icon className="h-4 w-4 shrink-0" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
      </div>

      <main className="mx-auto flex w-full max-w-7xl flex-1 px-4 py-6 pb-28 sm:px-6 lg:px-8">
        <div className="w-full min-w-0">{children}</div>
      </main>

      <div ref={fabRef} className="fixed bottom-6 right-6 z-50 hidden sm:block">
        <button
          onClick={toggleFabMenu}
          className="flex h-14 w-14 items-center justify-center rounded-full border border-primary/40 bg-primary text-background shadow-glow hover:scale-[1.03] hover:shadow-glow-hover"
          aria-haspopup="true"
          aria-expanded={fabMenuOpen}
          aria-label={fabMenuOpen ? 'Fechar navegação rápida' : 'Abrir navegação rápida'}
        >
          <FaBars className="h-5 w-5" />
        </button>

        {fabMenuOpen ? (
          <div className="surface-panel absolute bottom-16 right-0 mb-2 flex max-h-[min(65vh,28rem)] w-[min(18rem,calc(100vw-2rem))] flex-col gap-1 overflow-y-auto rounded-2xl p-2">
            {navItems.map((item) => {
              const isActive = activePath === item.href;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`${navItemBaseClass} ${isActive ? 'border border-primary/35 bg-primary/14 text-primary' : 'border border-transparent'}`}
                  onClick={() => setFabMenuOpen(false)}
                >
                  <item.icon className="h-4 w-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </Link>
              );
            })}
          </div>
        ) : null}
      </div>

      <footer className="border-t border-outline/80 bg-surface/72">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-2 px-4 py-4 text-center text-xs text-text-secondary sm:px-6 lg:px-8 sm:flex-row sm:items-center sm:justify-between sm:text-left">
          <p>&copy; {new Date().getFullYear()} Painel DMS</p>
          <p>Materiais, vendas e produtividade em um só painel.</p>
        </div>
      </footer>
    </div>
  );
};

export default Layout;
