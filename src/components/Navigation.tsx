import React, { useState } from 'react';
import { CalendarCheck, LayoutDashboard, LayoutGrid, LogIn, LogOut, Menu, Stethoscope, UserPlus, X } from 'lucide-react';

import { AuthUser } from '../api/auth';
import { PageType } from '../types';

export type ActiveProduct = 'clinicbook' | 'novascribe' | null;

interface NavigationProps {
  currentPage: PageType;
  setCurrentPage: (page: PageType) => void;
  clinicName: string;
  user: AuthUser | null;
  onLogout: () => void;
  activeProduct: ActiveProduct;
  onOpenHub: () => void;
}

export default function Navigation({ currentPage, setCurrentPage, clinicName, user, onLogout, activeProduct, onOpenHub }: NavigationProps) {
  const [isOpen, setIsOpen] = useState(false);

  const handleNavClick = (page: PageType) => {
    setCurrentPage(page);
    setIsOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const isNova = activeProduct === 'novascribe';

  return (
    <nav className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-slate-100 shadow-xs" id="main-navigation">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">

          {/* Apps switcher + product brand */}
          <div className="flex items-center gap-2">
            {user && (
              <button
                onClick={onOpenHub}
                title="All apps"
                id="apps-switcher"
                className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors cursor-pointer ${
                  currentPage === 'hub' ? 'bg-sky-50 text-sky-700' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'
                }`}
              >
                <LayoutGrid className="w-5 h-5" />
              </button>
            )}

            <button
              onClick={onOpenHub}
              className="flex items-center gap-2.5 cursor-pointer focus:outline-hidden"
              id="brand-logo-btn"
            >
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-white shadow-md transition-all duration-300 hover:scale-105 ${
                isNova ? 'bg-gradient-to-br from-sky-500 to-sky-700 shadow-sky-100' : 'bg-sky-600 shadow-sky-100'
              }`}>
                {isNova ? <Stethoscope className="w-6 h-6" /> : <CalendarCheck className="w-6 h-6" />}
              </div>
              <div className="text-left">
                <span className="block font-display text-xl font-bold tracking-tight text-slate-900 leading-tight">
                  {isNova ? <>Nova<span className="text-sky-600">Scribe</span></> : <>ClinicBook <span className="text-sky-600">AI</span></>}
                </span>
                <span className="block text-[10px] font-mono text-slate-400 uppercase tracking-widest leading-none">
                  {isNova ? 'AI Medical Scribe' : (user ? (clinicName || user.name) : 'WhatsApp Engine')}
                </span>
              </div>
            </button>
          </div>

          {/* Desktop Navigation Links */}
          <div className="hidden md:flex items-center gap-1.5">
            {user && !isNova && (
              <button
                id="nav-item-dashboard"
                onClick={() => handleNavClick('dashboard')}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 cursor-pointer ${
                  currentPage === 'dashboard'
                    ? 'bg-sky-50 text-sky-700'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                }`}
              >
                <LayoutDashboard className="w-4 h-4" />
                Clinic Dashboard
              </button>
            )}

            {user && (
              <button
                id="nav-item-apps"
                onClick={onOpenHub}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition-all duration-200 cursor-pointer"
              >
                <LayoutGrid className="w-4 h-4" />
                All Apps
              </button>
            )}

            <div className="h-4 w-px bg-slate-200 mx-2" />

            {user ? (
              <button
                id="nav-cta-logout"
                onClick={onLogout}
                className="flex items-center gap-1.5 px-4.5 py-2.5 rounded-lg text-sm font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-all duration-200 cursor-pointer border border-slate-200"
              >
                <LogOut className="w-4 h-4" />
                Sign Out
              </button>
            ) : (
              <>
                <button
                  id="nav-cta-login"
                  onClick={() => handleNavClick('login')}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 cursor-pointer ${
                    currentPage === 'login'
                      ? 'bg-sky-50 text-sky-700'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                  }`}
                >
                  <LogIn className="w-4 h-4" />
                  Sign In
                </button>
                <button
                  id="nav-cta-signup"
                  onClick={() => handleNavClick('signup')}
                  className={`flex items-center gap-1.5 px-4.5 py-2.5 rounded-lg text-sm font-semibold shadow-xs transition-all duration-200 cursor-pointer ${
                    currentPage === 'signup'
                      ? 'bg-sky-700 text-white shadow-sky-100'
                      : 'bg-sky-600 text-white hover:bg-sky-700 shadow-sky-100 hover:shadow-md'
                  }`}
                >
                  <UserPlus className="w-4 h-4" />
                  Start Free Trial
                </button>
              </>
            )}
          </div>

          {/* Mobile menu button */}
          <div className="flex md:hidden items-center">
            <button
              onClick={() => setIsOpen(!isOpen)}
              className="inline-flex items-center justify-center p-2 rounded-lg text-slate-500 hover:text-slate-950 hover:bg-slate-50 cursor-pointer"
              id="mobile-menu-toggle"
            >
              <span className="sr-only">Open main menu</span>
              {isOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Menu panel */}
      {isOpen && (
        <div className="md:hidden bg-white border-b border-slate-100 py-3 px-4 space-y-1 shadow-lg animate-fadeIn" id="mobile-menu-panel">
          {user && (
            <button
              id="mobile-nav-item-apps"
              onClick={() => { onOpenHub(); setIsOpen(false); }}
              className="flex items-center gap-3 w-full px-4 py-3 rounded-xl text-base font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition-colors"
            >
              <LayoutGrid className="w-5 h-5 text-slate-400" />
              All Apps
            </button>
          )}
          {user && !isNova && (
            <button
              id="mobile-nav-item-dashboard"
              onClick={() => handleNavClick('dashboard')}
              className={`flex items-center gap-3 w-full px-4 py-3 rounded-xl text-base font-medium transition-colors ${
                currentPage === 'dashboard' ? 'bg-sky-50 text-sky-700' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <LayoutDashboard className="w-5 h-5 text-slate-400" />
              Clinic Dashboard
            </button>
          )}

          <div className="pt-2 border-t border-slate-100">
            {user ? (
              <button
                id="mobile-nav-cta-logout"
                onClick={() => { onLogout(); setIsOpen(false); }}
                className="flex items-center justify-center gap-2 w-full px-4 py-3 rounded-xl text-base font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200"
              >
                <LogOut className="w-5 h-5" />
                Sign Out
              </button>
            ) : (
              <>
                <button
                  id="mobile-nav-cta-login"
                  onClick={() => handleNavClick('login')}
                  className="flex items-center justify-center gap-2 w-full px-4 py-3 rounded-xl text-base font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 mb-2"
                >
                  <LogIn className="w-5 h-5" />
                  Sign In
                </button>
                <button
                  id="mobile-nav-cta-signup"
                  onClick={() => handleNavClick('signup')}
                  className="flex items-center justify-center gap-2 w-full px-4 py-3 rounded-xl text-base font-semibold text-white bg-sky-600 hover:bg-sky-700 shadow-sm"
                >
                  <UserPlus className="w-5 h-5" />
                  Start Free Trial
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </nav>
  );
}
