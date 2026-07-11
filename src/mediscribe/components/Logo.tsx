import { Stethoscope } from 'lucide-react';

interface LogoProps {
  /** When provided, the logo renders as a clickable button (e.g. back to dashboard). */
  onClick?: () => void;
  /** Extra classes for the outer element (e.g. responsive visibility). */
  className?: string;
  /** Use the white wordmark on dark surfaces (e.g. the sidebar). The icon is unchanged. */
  light?: boolean;
}

/**
 * The single source of truth for the MediScribe AI brand mark.
 * Every page/header must use this component so the icon, wordmark, size,
 * weight, spacing, alignment and colors stay identical everywhere.
 */
export default function Logo({ onClick, className = '', light = false }: LogoProps) {
  const inner = (
    <>
      <div className="bg-blue-600 text-white p-1.5 rounded-lg shadow-sm flex items-center justify-center">
        <Stethoscope size={22} strokeWidth={2.5} />
      </div>
      <span className={`font-bold text-xl tracking-tight ${light ? 'text-white' : 'text-slate-900'}`}>
        MediScribe AI
      </span>
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`flex items-center gap-2.5 cursor-pointer transition-opacity hover:opacity-80 ${className}`}
      >
        {inner}
      </button>
    );
  }

  return <div className={`flex items-center gap-2.5 ${className}`}>{inner}</div>;
}
