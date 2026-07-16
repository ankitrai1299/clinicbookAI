import { Stethoscope } from 'lucide-react';
import { motion, useScroll } from 'motion/react';
import { useEffect, useState } from 'react';

export function Navbar() {
  const { scrollY } = useScroll();
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    return scrollY.on('change', (latest) => {
      setIsScrolled(latest > 50);
    });
  }, [scrollY]);

  return (
    <motion.div 
      className="fixed top-0 left-0 right-0 z-50 flex justify-center px-4"
      animate={{
        paddingTop: isScrolled ? "1rem" : "2rem",
      }}
      transition={{ duration: 0.3, ease: "easeInOut" }}
    >
      <motion.nav 
        className="flex items-center justify-between w-full max-w-[1000px] px-4 py-3 rounded-full border transition-colors duration-300 relative overflow-hidden"
        animate={{
          backgroundColor: isScrolled ? "rgba(255, 255, 255, 0.7)" : "rgba(255, 255, 255, 0.1)",
          backdropFilter: isScrolled ? "blur(24px)" : "blur(8px)",
          borderColor: isScrolled ? "rgba(255, 255, 255, 0.4)" : "rgba(255, 255, 255, 0.1)",
          boxShadow: isScrolled ? "0 4px 24px -4px rgba(0, 0, 0, 0.05)" : "0 4px 24px -4px rgba(0, 0, 0, 0)",
        }}
        transition={{ duration: 0.3 }}
      >
        <div className="flex items-center gap-2 relative z-10 pl-2">
          <Stethoscope className="w-5 h-5 text-[#0B0F1F]" />
          <span className="font-serif italic text-2xl tracking-tight text-[#0B0F1F]">NovaScribe</span>
        </div>
        
        <div className="hidden md:flex items-center gap-8 relative z-10">
          <a href="#features" className="text-sm font-medium text-slate-600 hover:text-[#0B0F1F] transition-colors">Features</a>
          <a href="#how-it-works" className="text-sm font-medium text-slate-600 hover:text-[#0B0F1F] transition-colors">How it Works</a>
          <a href="#pricing" className="text-sm font-medium text-slate-600 hover:text-[#0B0F1F] transition-colors">Pricing</a>
          <a href="#faq" className="text-sm font-medium text-slate-600 hover:text-[#0B0F1F] transition-colors">FAQ</a>
        </div>
        
        <div className="flex items-center gap-3 relative z-10">
          <button className="hidden md:block px-5 py-2 text-sm font-medium text-slate-600 hover:text-[#0B0F1F] transition-colors">
            Log in
          </button>
          <button className="px-6 py-2.5 text-sm font-medium text-white bg-[#0B0F1F] rounded-full hover:bg-black transition-all active:scale-95 shadow-[0_4px_12px_rgba(11,15,31,0.2)] hover:shadow-[0_8px_20px_rgba(11,15,31,0.3)] hover:-translate-y-0.5">
            Start Free
          </button>
        </div>
      </motion.nav>
    </motion.div>
  );
}

export function Footer() {
  return (
    <footer className="bg-[#0B0F1F] pt-16 pb-12 border-t border-white/5">
      <div className="max-w-[1000px] mx-auto px-6">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-12 mb-16">
          <div className="col-span-2">
            <div className="flex items-center gap-2 text-slate-400 mb-6">
              <Stethoscope className="w-5 h-5 text-[#4F6BFF]" />
              <span className="font-serif italic text-2xl text-white tracking-tight">NovaScribe</span>
            </div>
            <p className="text-slate-400 text-sm leading-relaxed max-w-xs font-light">
              NovaScribe AI is an AI-powered medical scribe built for modern healthcare professionals.
            </p>
          </div>
          
          <div>
            <h4 className="text-white font-medium mb-6">Product</h4>
            <ul className="space-y-4 text-sm text-slate-400 font-light">
              <li><a href="#" className="hover:text-[#4F6BFF] transition-colors">Features</a></li>
              <li><a href="#" className="hover:text-[#4F6BFF] transition-colors">Pricing</a></li>
              <li><a href="#" className="hover:text-[#4F6BFF] transition-colors">API</a></li>
            </ul>
          </div>
          
          <div>
            <h4 className="text-white font-medium mb-6">Resources</h4>
            <ul className="space-y-4 text-sm text-slate-400 font-light">
              <li><a href="#" className="hover:text-[#4F6BFF] transition-colors">Documentation</a></li>
              <li><a href="#" className="hover:text-[#4F6BFF] transition-colors">Help Center</a></li>
              <li><a href="#" className="hover:text-[#4F6BFF] transition-colors">Blog</a></li>
            </ul>
          </div>
          
          <div>
            <h4 className="text-white font-medium mb-6">Company</h4>
            <ul className="space-y-4 text-sm text-slate-400 font-light">
              <li><a href="#" className="hover:text-[#4F6BFF] transition-colors">About</a></li>
              <li><a href="#" className="hover:text-[#4F6BFF] transition-colors">Privacy</a></li>
              <li><a href="#" className="hover:text-[#4F6BFF] transition-colors">Terms</a></li>
              <li><a href="#" className="hover:text-[#4F6BFF] transition-colors">Contact</a></li>
            </ul>
          </div>
        </div>
        
        <div className="flex flex-col md:flex-row items-center justify-between gap-6 pt-8 border-t border-white/5">
          <p className="text-slate-500 text-sm font-light">
            © {new Date().getFullYear()} NovaScribe AI. All rights reserved.
          </p>
          <div className="flex items-center gap-6 text-[11px] font-bold tracking-widest text-slate-500 uppercase">
            <a href="#" className="hover:text-white transition-colors">LinkedIn</a>
            <a href="#" className="hover:text-white transition-colors">GitHub</a>
            <a href="#" className="hover:text-white transition-colors">X</a>
          </div>
        </div>
      </div>
    </footer>
  );
}
