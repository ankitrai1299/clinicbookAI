import { ArrowLeft } from 'lucide-react';
import NovaHero from './novascribe/NovaHero';
import NovaFeatures from './novascribe/NovaFeatures';
import NovaPricing from './novascribe/NovaPricing';
import { NovaTrust, NovaFAQ, NovaFinalCTA } from './novascribe/NovaTrust';
import PlatformStory from './platform/PlatformStory';
import TrustStrip from './platform/TrustStrip';

interface Props {
  isLoggedIn: boolean;
  onOpen: () => void; // open the app (or go to login)
  onBack: () => void; // back to the platform hub
}

// The Android APK download link. Set VITE_MEDISCRIBE_APK_URL (Vercel env) to the
// URL of the EAS-built APK; until then the hero shows a "coming soon" state.
const APK_URL = (import.meta.env.VITE_MEDISCRIBE_APK_URL as string | undefined) || '';

// NovaScribe's landing page — the full product story (hero with a live
// consultation simulation, how it works, clinical intelligence, report quality,
// pricing, trust, FAQ, closing CTA) rendered in the SAME theme as the ClinicBook
// landing: slate-50 / white alternating sections, sky→teal accents, font-display
// headings. One platform, one look.
export default function MediScribeLanding({ isLoggedIn, onOpen, onBack }: Props) {
  return (
    <div className="bg-slate-50 min-h-screen" id="novascribe-landing-root">
      {/* Back to the platform hub — sits on the hero's white ground. */}
      <div className="bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6">
          <button
            onClick={onBack}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" /> All apps
          </button>
        </div>
      </div>

      <NovaHero isLoggedIn={isLoggedIn} onOpen={onOpen} apkUrl={APK_URL} />
      <TrustStrip />
      <NovaFeatures />
      {/* The same "one platform, two apps" story the ClinicBook landing tells —
          so a doctor landing here understands where the patient side fits. */}
      <PlatformStory />
      <NovaPricing onOpen={onOpen} />
      <NovaTrust />
      <NovaFAQ />
      <NovaFinalCTA isLoggedIn={isLoggedIn} onOpen={onOpen} />
    </div>
  );
}
