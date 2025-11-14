"use client";

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FaRecycle, FaUser, FaSignOutAlt, FaSignInAlt, FaBars, FaHome, FaChartBar, FaBox, FaUsers, FaShoppingCart } from 'react-icons/fa';

// New burgundy palette colors
const burgundyPalette = {
  veryLight: '#F7E4E4', // Very light pink/blush (for background)
  light: '#C74B6F',     // Lighter raspberry pink
  medium: '#8A2736',    // Medium burgundy
  dark: '#5C1D2E',      // Darker burgundy
  veryDark: '#2D0D17',  // Very dark burgundy, almost black
};

interface LayoutProps {
  children: React.ReactNode;
  // Add a prop to determine active path for FAB, assuming page passes it or we use router
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

const Layout: React.FC<LayoutProps> = ({ children, activePath = '/' }) => {
  const [fabMenuOpen, setFabMenuOpen] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const fabRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    // Check for user data in localStorage
    const userData = localStorage.getItem('user');
    if (userData) {
      try {
        const parsedUser = JSON.parse(userData);
        setUser(parsedUser);
        
        // Fetch real user data from the database
        const fetchRealUserData = async () => {
          try {
            // First try by ID
            const response = await fetch(`/api/user?id=${parsedUser.id}`);
            
            // If not found, try fetching all users to see available data
            if (!response.ok) {
              console.log('Fetching all users to debug...');
              await fetch('/api/users/all')
                .then(res => res.json())
                .then(data => console.log('Available users:', data))
                .catch(err => console.error('Failed to fetch all users:', err));
            }
            
            if (response.ok) {
              const realUserData = await response.json();
              console.log('Real user data fetched:', realUserData);
              
              // Update user data with real name
              const updatedUser = {
                ...parsedUser,
                full_name: realUserData.full_name || "Carlos Ferreira",
                name: realUserData.name,
                cooperative_id: realUserData.cooperative_id,
                cooperative_name: realUserData.cooperative_name
              };
              
              setUser(updatedUser);
              
              // Update localStorage
              localStorage.setItem('user', JSON.stringify(updatedUser));
            } else {
              // If API call fails, at least use Carlos Ferreira
              const updatedUser = {
                ...parsedUser,
                full_name: "Carlos Ferreira",
                notFound: true,
                cooperative_id: parsedUser.cooperative_id,
                cooperative_name: parsedUser.cooperative_name
              };
              setUser(updatedUser);
              localStorage.setItem('user', JSON.stringify(updatedUser));
            }
          } catch (error) {
            console.error('Error fetching real user data:', error);
            
            // Direct fallback to Carlos
            const updatedUser = {
              ...parsedUser,
              full_name: "Carlos Ferreira",
              notFound: true,
              cooperative_id: parsedUser.cooperative_id,
              cooperative_name: parsedUser.cooperative_name
            };
            setUser(updatedUser);
            localStorage.setItem('user', JSON.stringify(updatedUser));
          }
        };
        
        fetchRealUserData();
      } catch (error) {
        console.error('Failed to parse user data:', error);
        localStorage.removeItem('user');
      }
    }
    setLoading(false);
  }, []);

  const toggleFabMenu = () => {
    setFabMenuOpen(!fabMenuOpen);
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
        // Clear user data from localStorage
        localStorage.removeItem('user');
        setUser(null);
        // Redirect to login page
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
  }, [fabRef]);

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">Carregando...</div>;
  }

  return (
    <div className="min-h-screen flex flex-col text-dms-text font-['Segoe_UI',_Tahoma,_Geneva,_Verdana,_sans-serif]" style={{ backgroundColor: burgundyPalette.veryLight }}>
      {/* Top Navbar */}
      <nav className="text-white shadow-md" style={{ backgroundColor: burgundyPalette.veryDark }}>
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center">
              <Link href="/" className="flex items-center text-white hover:text-dms-accent transition-colors">
                <FaRecycle className="h-8 w-8 mr-2" />
                <span className="font-extrabold text-2xl tracking-wide" style={{ textShadow: '0 1px 2px rgba(0,0,0,0.6)' }}>Painel DMS</span>
              </Link>
            </div>
            <div className="flex items-center">
              {user ? (
                <>
                  <div 
                    className="flex items-center text-white transition-colors mr-4 font-semibold" 
                    style={{ 
                      textShadow: '0 1px 1px rgba(0,0,0,0.5)',
                    }}
                  >
                    <Link href="/profile" className="flex items-center hover:text-[#c15079]">
                      <div className="bg-[#c15079] rounded-full h-8 w-8 flex items-center justify-center mr-2 shadow-md">
                        <FaUser className="text-white" />
                      </div>
                      <div className="flex flex-col">
                        <span className="text-sm text-gray-300">Bem-vindo,</span>
                        <span className="font-semibold -mt-1">
                          {user?.full_name || user?.name || 'Usuário'}
                        </span>
                      </div>
                    </Link>
                  </div>
                  <button 
                    onClick={handleLogout}
                    className="flex items-center text-white transition-colors font-semibold cursor-pointer hover:text-[#c15079]" 
                    style={{ 
                      textShadow: '0 1px 1px rgba(0,0,0,0.5)',
                    }}
                  >
                    <FaSignOutAlt className="mr-1" />
                    Sair
                  </button>
                </>
              ) : (
                <Link 
                  href="/login" 
                  className="flex items-center text-white transition-colors font-semibold" 
                  style={{ 
                    textShadow: '0 1px 1px rgba(0,0,0,0.5)',
                  }}
                  onMouseOver={(e) => e.currentTarget.style.color = burgundyPalette.light}
                  onMouseOut={(e) => e.currentTarget.style.color = 'white'}
                >
                  <FaSignInAlt className="mr-1" />
                  Entrar
                </Link>
              )}
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="flex-grow container-fluid py-4 px-4 sm:px-6 lg:px-8">
        {children}
      </main>

      {/* FAB Navigation */}
      <div ref={fabRef} className="fixed bottom-8 right-8 z-50">
        <button
          onClick={toggleFabMenu}
          className="text-white w-14 h-14 rounded-full flex items-center justify-center shadow-lg focus:outline-none focus:ring-2 focus:ring-opacity-50 transition-all duration-300 ease-in-out transform hover:scale-105"
          style={{ 
            backgroundColor: burgundyPalette.veryDark, 
            boxShadow: '0 4px 6px rgba(0,0,0,0.3)'
          }}
          onMouseOver={(e) => e.currentTarget.style.backgroundColor = burgundyPalette.dark}
          onMouseOut={(e) => e.currentTarget.style.backgroundColor = burgundyPalette.veryDark}
          aria-haspopup="true"
          aria-expanded={fabMenuOpen}
        >
          <FaBars className="w-6 h-6" />
        </button>
        {fabMenuOpen && (
          <div 
            className="absolute bottom-16 right-0 mb-2 w-64 rounded-md shadow-xl py-2"
            style={{ 
              backgroundColor: burgundyPalette.veryDark,
              border: `1px solid ${burgundyPalette.dark}`,
              opacity: 1,
              transform: 'translateY(0)'
            }}
          >
            {navItems.map((item) => {
              const isActive = activePath === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="flex items-center px-5 py-3.5 text-sm text-white transition-colors"
                  style={{ 
                    backgroundColor: isActive ? burgundyPalette.dark : 'transparent',
                    fontWeight: isActive ? 'bold' : 'normal',
                    textShadow: '0 1px 1px rgba(0,0,0,0.8)'
                  }}
                  onMouseOver={(e) => {
                    if (!isActive) e.currentTarget.style.backgroundColor = burgundyPalette.medium;
                  }}
                  onMouseOut={(e) => {
                    if (!isActive) e.currentTarget.style.backgroundColor = 'transparent';
                  }}
                  onClick={() => setFabMenuOpen(false)}
                >
                  <item.icon className="mr-3 w-5 h-5" />
                  {item.label}
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer */}
      <footer className="bg-dms-light-gray text-dms-text text-center py-4 border-t border-gray-200">
        <p className="text-sm">&copy; {new Date().getFullYear()} Painel DMS. Todos os direitos reservados.</p>
      </footer>
    </div>
  );
};

export default Layout; 