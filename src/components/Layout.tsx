"use client";

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { isGamificationUiEnabled } from '@/lib/features/gamification';
import {
  FaBell,
  FaBox,
  FaChartBar,
  FaHome,
  FaHandshake,
  FaShoppingCart,
  FaSignInAlt,
  FaSignOutAlt,
  FaTrophy,
  FaUser,
  FaUsers,
} from 'react-icons/fa';
import { DmsLogo } from '@/components/DmsLogo';

interface LayoutProps {
  children: React.ReactNode;
  activePath?: string;
}

type UserRole = 'admin' | 'manager' | 'worker';

interface User {
  id: string;
  name?: string;
  full_name?: string;
  userType: number;
  role?: UserRole;
  notFound?: boolean;
  cooperative_id?: string;
  cooperative_name?: string | null;
}

const gamificationUiEnabled = isGamificationUiEnabled({
  NEXT_PUBLIC_DMS_FEATURE_GAMIFICATION_UI: process.env.NEXT_PUBLIC_DMS_FEATURE_GAMIFICATION_UI,
  NEXT_PUBLIC_DMS_FEATURE_GAMIFICATION: process.env.NEXT_PUBLIC_DMS_FEATURE_GAMIFICATION,
});

const MANAGER_NAV_ROLES: UserRole[] = ['admin', 'manager'];

const navItems: Array<{
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  roles?: UserRole[];
  enabled?: boolean;
}> = [
  { href: '/', icon: FaHome, label: 'Visão geral', roles: MANAGER_NAV_ROLES },
  { href: '/materials', icon: FaBox, label: 'Materiais e estoque', roles: MANAGER_NAV_ROLES },
  { href: '/sales', icon: FaShoppingCart, label: 'Vendas', roles: MANAGER_NAV_ROLES },
  { href: '/collective-sales', icon: FaHandshake, label: 'Coletivas', roles: MANAGER_NAV_ROLES },
  { href: '/manage-workers', icon: FaUsers, label: 'Equipe', roles: MANAGER_NAV_ROLES },
  { href: '/worker-productivity', icon: FaChartBar, label: 'Produtividade', roles: MANAGER_NAV_ROLES },
  {
    href: '/gamification',
    icon: FaTrophy,
    label: 'Gamificação',
    roles: MANAGER_NAV_ROLES,
    enabled: gamificationUiEnabled,
  },
  { href: '/notices', icon: FaBell, label: 'Avisos', roles: MANAGER_NAV_ROLES },
  { href: '/profile', icon: FaUser, label: 'Meu perfil', roles: MANAGER_NAV_ROLES },
];

const navItemBaseClass =
  'flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium text-foreground/88 hover:bg-surface-elevated hover:text-foreground focus-visible:outline-none';

const Layout: React.FC<LayoutProps> = ({ children, activePath = '/' }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const userRole = user?.role ?? (user?.userType === 1 ? 'worker' : user ? 'manager' : null);
  const visibleNavItems = navItems.filter((item) => {
    if (item.enabled === false) return false;
    if (!item.roles) return true;
    return Boolean(userRole && item.roles.includes(userRole));
  });

  useEffect(() => {
    const fetchSession = async () => {
      try {
        const response = await fetch('/api/auth/session', {
          credentials: 'same-origin',
        });

        if (!response.ok) {
          localStorage.removeItem('user');
          setUser(null);
          return;
        }

        const sessionUser = await response.json() as User;
        setUser(sessionUser);
        localStorage.setItem('user', JSON.stringify(sessionUser));
      } catch {
        localStorage.removeItem('user');
        setUser(null);
      } finally {
        setLoading(false);
      }
    };

    void fetchSession();
  }, []);

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
    } catch {
      // Keep logout failures local; the next session fetch will clear invalid cookies.
    }
  };

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
              <DmsLogo size={44} className="shrink-0 shadow-glow rounded-xl" />
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

          {visibleNavItems.length > 0 ? (
            <>
              <div className="hidden flex-wrap gap-2 sm:flex">
                {visibleNavItems.map((item) => {
                  const isActive = activePath === item.href;

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`${navItemBaseClass} border ${isActive ? 'border-primary/35 bg-primary/14 text-primary' : 'border-outline/70 bg-surface/70'}`}
                    >
                      <item.icon className="h-4 w-4 shrink-0" />
                      <span className="truncate">{item.label}</span>
                    </Link>
                  );
                })}
              </div>

              <div className="block sm:hidden">
                <label
                  htmlFor="mobileNavigation"
                  className="mb-2 block text-xs font-semibold uppercase text-text-secondary"
                >
                  Navegação
                </label>
                <select
                  id="mobileNavigation"
                  value={activePath}
                  onChange={(event) => router.push(event.target.value)}
                  className="h-11 w-full rounded-lg border border-outline bg-surface px-3 text-sm font-semibold text-foreground focus:border-primary focus:ring-0"
                >
                  {visibleNavItems.map((item) => (
                    <option key={item.href} value={item.href}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </div>
            </>
          ) : null}
        </div>
      </nav>

      <main className="mx-auto flex w-full max-w-7xl flex-1 px-4 py-6 pb-28 sm:px-6 lg:px-8">
        <div className="w-full min-w-0">{children}</div>
      </main>

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
