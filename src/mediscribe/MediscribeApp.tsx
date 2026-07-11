// Embeddable entry for the MediScribe app inside the ClinicBook platform hub.
// Wraps the scribe SPA in its AuthProvider (which hydrates from the SHARED
// ClinicBook session token — SSO), and forwards the host's exit-to-hub + doctor
// identity. Rendered full-screen as a takeover, exactly like the old MediScribe.

import { AuthProvider } from './context/Auth';
import ScribeApp from './App';

interface MediscribeAppProps {
  onExitToHub?: () => void;
  doctorName?: string;
}

export default function MediscribeApp({ onExitToHub, doctorName }: MediscribeAppProps = {}) {
  return (
    <AuthProvider>
      <ScribeApp onExitToHub={onExitToHub} doctorName={doctorName} />
    </AuthProvider>
  );
}
