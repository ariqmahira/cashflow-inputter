'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * Bottom navigation.
 *
 * Bottom rather than top because every interaction here happens one-handed, standing up, in
 * a mall. `Tambah` sits in the middle: it is the reason the app is opened.
 */
const TABS = [
  { href: '/', label: 'Beranda', icon: JarIcon },
  { href: '/riwayat', label: 'Riwayat', icon: ListIcon },
  { href: '/tambah', label: 'Tambah', icon: PlusIcon, primary: true },
  { href: '/anggaran', label: 'Anggaran', icon: GaugeIcon },
  { href: '/pengaturan', label: 'Atur', icon: GearIcon },
] as const;

export function BottomNav() {
  const pathname = usePathname();
  const normalized = pathname.replace(/\/+$/, '') || '/';

  return (
    <nav
      aria-label="Navigasi utama"
      className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
    >
      <ul className="mx-auto flex max-w-lg items-stretch justify-around px-2">
        {TABS.map(({ href, label, icon: Icon, ...rest }) => {
          const primary = 'primary' in rest && rest.primary;
          const active = normalized === href;
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                className="flex flex-col items-center gap-1 py-2.5"
              >
                <span
                  className={[
                    'grid place-items-center rounded-pill transition-colors',
                    primary ? 'h-11 w-11 bg-pandan text-white' : 'h-7 w-9',
                    !primary && active ? 'bg-pandan-wash text-pandan-deep' : '',
                    !primary && !active ? 'text-ink-faint' : '',
                  ].join(' ')}
                >
                  <Icon />
                </span>
                <span
                  className={`text-[0.6875rem] leading-none ${
                    active ? 'font-semibold text-ink' : 'text-ink-faint'
                  }`}
                >
                  {label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/* Icons are inline so the app ships no icon library and every stroke matches the type. */

const stroke = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

function JarIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden {...stroke}>
      <path d="M8 3h8M9 3v2.5L7 8v11a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V8l-2-2.5V3" />
      <path d="M7 14c1.8-1 3.2-1 5 0s3.2 1 5 0" />
    </svg>
  );
}

function ListIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden {...stroke}>
      <path d="M4 7h16M4 12h16M4 17h10" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden {...stroke} strokeWidth={2.25}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function GaugeIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden {...stroke}>
      <path d="M4 18a8 8 0 1 1 16 0" />
      <path d="M12 18l4-5" />
    </svg>
  );
}

function GearIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden {...stroke}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3v2m0 14v2M3 12h2m14 0h2M5.6 5.6l1.4 1.4m10 10 1.4 1.4m0-12.8-1.4 1.4m-10 10-1.4 1.4" />
    </svg>
  );
}
