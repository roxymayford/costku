import React, { useEffect, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useSubscription } from '../contexts/SubscriptionContext';
import { Icon } from './Icon';
import logoSrc from '../assets/logo.png';

interface LayoutProps {
  children: React.ReactNode;
}

interface NavEntry {
  to: string;
  label: string;
  icon: 'home' | 'wallet' | 'sparkle' | 'list' | 'star' | 'chart' | 'clock';
  premiumOnly?: boolean;
}

const NAV_ENTRIES: NavEntry[] = [
  { to: '/dashboard', label: 'Dashboard', icon: 'home' },
  { to: '/pemasukan', label: 'Pemasukan', icon: 'wallet' },
  { to: '/cicilan', label: 'Cicilan', icon: 'clock' },
  { to: '/transaksi', label: 'Transaksi', icon: 'list' },
  { to: '/alokasi', label: 'Alokasi', icon: 'chart', premiumOnly: true },
  { to: '/rekomendasi', label: 'Gaya Hidup', icon: 'sparkle', premiumOnly: true },
  { to: '/subscription', label: 'Langganan', icon: 'star' },
];

// Bottom nav: Dashboard, Pemasukan, Cicilan, Alokasi, Gaya Hidup
const BOTTOM_NAV_ENTRIES: NavEntry[] = [
  { to: '/dashboard', label: 'Dashboard', icon: 'home' },
  { to: '/pemasukan', label: 'Pemasukan', icon: 'wallet' },
  { to: '/cicilan', label: 'Cicilan', icon: 'clock' },
  { to: '/alokasi', label: 'Alokasi', icon: 'chart', premiumOnly: true },
  { to: '/rekomendasi', label: 'Gaya Hidup', icon: 'sparkle', premiumOnly: true },
];

export const Layout: React.FC<LayoutProps> = ({ children }) => {
  const { user, logout } = useAuth();
  const { isPremium } = useSubscription();
  const navigate = useNavigate();
  const location = useLocation();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  // Close the mobile drawer on navigation and lock body scroll while open.
  useEffect(() => {
    setIsMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (isMenuOpen) {
      const previous = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      const onKeyDown = (event: KeyboardEvent) => {
        if (event.key === 'Escape') setIsMenuOpen(false);
      };
      window.addEventListener('keydown', onKeyDown);
      return () => {
        document.body.style.overflow = previous;
        window.removeEventListener('keydown', onKeyDown);
      };
    }
    // Drawer ditutup — pastikan overflow selalu di-restore
    document.body.style.overflow = '';
  }, [isMenuOpen]);

  useEffect(() => {
    const handleOpenDrawer = () => setIsMenuOpen(true);
    window.addEventListener('costku:open-drawer', handleOpenDrawer);
    return () => window.removeEventListener('costku:open-drawer', handleOpenDrawer);
  }, []);

  const handleLogout = async () => {
    setIsMenuOpen(false);
    await logout();
    navigate('/');
  };

  const displayName = user?.name || user?.email?.split('@')[0] || 'Tamu';
  const initials = displayName.slice(0, 2).toUpperCase();

  return (
    <div className="fatrack-app-shell">
      {/* TOPBAR */}
      <header className="fatrack-topbar">
        <div className="topbar-left">
          <NavLink to="/dashboard" className="brand" aria-label="costKu, ke dashboard">
            <img src={logoSrc} alt="costKu" className="brand-logo" />
            <b>COSTKU</b>
            <i className="brand-divider">/</i>
            <span className="brand-sub">PENDAMPING KEUANGAN PRIBADI</span>
          </NavLink>
        </div>

        {/* DESKTOP NAVIGATION */}
        <nav className="fatrack-nav desktop-only" aria-label="Navigasi utama">
          {NAV_ENTRIES.map((entry) => (
            <NavLink
              key={entry.to}
              to={entry.to}
              className={({ isActive }) => (isActive ? 'nav-item active' : 'nav-item')}
            >
              {entry.to === '/subscription' && (
                <Icon
                  name="star"
                  size={12}
                  fill="currentColor"
                  className="nav-item-star"
                  aria-hidden={true}
                />
              )}
              <span className="nav-item-label">{entry.label}</span>
              {entry.premiumOnly && !isPremium && (
                <span className="nav-lock-tag" title="Tersedia di paket Pro">
                  <Icon name="lock" size={11} /> PRO
                </span>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="topbar-right">
          <span className="user-greeting">
            Halo, <b>{displayName}</b>
          </span>
          <button type="button" className="logout-btn" onClick={handleLogout} title="Keluar dari akun">
            <span className="inline-flex items-center gap-1">KELUAR <Icon name="arrowRight" size={12} /></span>
          </button>
          <button
            type="button"
            className="menu-toggle-btn mobile-only"
            onClick={() => setIsMenuOpen(true)}
            aria-label="Buka menu"
            aria-expanded={isMenuOpen}
            aria-controls="fatrack-mobile-drawer"
          >
            <Icon name="menu" size={20} />
          </button>
        </div>
      </header>

      {/* MAIN VIEW */}
      <main className="fatrack-main-content">{children}</main>

      {/* MOBILE DRAWER */}
      <div
        className={`fatrack-drawer-overlay mobile-only ${isMenuOpen ? 'is-open' : ''}`}
        onClick={() => setIsMenuOpen(false)}
        aria-hidden="true"
      />
      <aside
        id="fatrack-mobile-drawer"
        className={`fatrack-drawer mobile-only ${isMenuOpen ? 'is-open' : ''}`}
        aria-label="Menu navigasi"
        aria-hidden={!isMenuOpen}
      >
        <div className="drawer-head">
          <img src={logoSrc} alt="costKu" className="brand-logo drawer-logo" />
          <div className="drawer-user">
            <b>{displayName}</b>
            <small>{isPremium ? 'Pro Advisor aktif' : 'Paket Money Tracker (gratis)'}</small>
          </div>
          <button
            type="button"
            className="drawer-close-btn"
            onClick={() => setIsMenuOpen(false)}
            aria-label="Tutup menu"
          >
            <Icon name="close" size={20} />
          </button>
        </div>

        <nav className="drawer-nav">
          {NAV_ENTRIES.map((entry) => (
            <NavLink
              key={entry.to}
              to={entry.to}
              className={({ isActive }) => (isActive ? 'drawer-link active' : 'drawer-link')}
            >
              <span className="drawer-link-icon">
                <Icon name={entry.icon} size={18} />
              </span>
              <span className="drawer-link-label">{entry.label}</span>
              {entry.premiumOnly && !isPremium && (
                <span className="nav-lock-tag">
                  <Icon name="lock" size={11} /> PRO
                </span>
              )}
              <Icon name="arrowRight" size={14} className="drawer-link-chevron" />
            </NavLink>
          ))}
        </nav>

        {!isPremium && (
          <NavLink to="/subscription" className="drawer-upsell">
            <Icon name="star" size={16} className="drawer-upsell-icon" />
            <div>
              <b>Buka semua fitur Pro</b>
              <small>Batas jajan harian, alokasi 50/30/20, rekomendasi kost &amp; makan.</small>
            </div>
          </NavLink>
        )}

        <button type="button" className="drawer-logout" onClick={handleLogout}>
          <Icon name="arrowRight" size={14} /> Keluar dari akun
        </button>
      </aside>

      {/* MOBILE BOTTOM NAVIGATION BAR - 4 items only */}
      <nav className="fatrack-mobile-bottom-nav mobile-only" aria-label="Navigasi cepat">
        {BOTTOM_NAV_ENTRIES.map((entry) => (
          <NavLink
            key={entry.to}
            to={entry.to}
            className={({ isActive }) => (isActive ? 'bottom-nav-item active' : 'bottom-nav-item')}
          >
            <span className="bottom-nav-icon">
              <Icon name={entry.icon} size={19} />
            </span>
            <span className="bottom-nav-label">{entry.label}</span>
            {entry.premiumOnly && !isPremium && <span className="bottom-nav-dot" aria-hidden="true" />}
          </NavLink>
        ))}
      </nav>

      {/* FOOTER */}
      <footer className="fatrack-footer">
        <p className="fatrack-footer-text">
          costKu v1.0 · Catat sekali tenang sebulan
        </p>
      </footer>
    </div>
  );
};
