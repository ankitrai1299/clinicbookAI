import { Navbar, Footer } from './components/Navigation';
import { Hero, FinalCTA } from './components/HeroSection';
import { Features } from './components/FeaturesBenefits';
import { Pricing } from './components/Pricing';
import { Trust, FAQ } from './components/Trust';

export default function App() {
  return (
    <div className="min-h-screen bg-[#fafafa] font-sans selection:bg-indigo-100 selection:text-indigo-900 relative">
      <div className="noise-bg"></div>
      <Navbar />
      <main>
        <Hero />
        <Features />
        <Pricing />
        <Trust />
        <FAQ />
        <FinalCTA />
      </main>
      <Footer />
    </div>
  );
}
