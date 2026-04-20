import React, { useState, useEffect } from 'react';
import { Download, X, Smartphone } from 'lucide-react';

export const InstallPrompt: React.FC = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showBanner, setShowBanner] = useState(false);
  const [showIOSGuide, setShowIOSGuide] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true);
      return;
    }

    const dismissed = localStorage.getItem('pwa_install_dismissed');
    if (dismissed && Date.now() - parseInt(dismissed) < 24 * 60 * 60 * 1000) {
      return;
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowBanner(true);
    };
    window.addEventListener('beforeinstallprompt', handler);

    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const isSafari = /Safari/.test(navigator.userAgent) && !/Chrome/.test(navigator.userAgent);
    if (isIOS && isSafari) {
      setTimeout(() => setShowBanner(true), 3000);
      setShowIOSGuide(true);
    }

    window.addEventListener('appinstalled', () => {
      setIsInstalled(true);
      setShowBanner(false);
      setDeferredPrompt(null);
    });

    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const result = await deferredPrompt.userChoice;
      if (result.outcome === 'accepted') {
        setIsInstalled(true);
      }
      setDeferredPrompt(null);
      setShowBanner(false);
    }
  };

  const handleDismiss = () => {
    setShowBanner(false);
    localStorage.setItem('pwa_install_dismissed', Date.now().toString());
  };

  if (isInstalled || !showBanner) return null;

  return (
    <div className="fixed bottom-20 left-0 right-0 z-50 flex justify-center px-4 animate-slide-up">
      <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 p-4 max-w-md w-full">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-gradient-to-br from-brand-500 to-brand-700 rounded-xl flex items-center justify-center shadow-md">
              <Smartphone size={24} className="text-white" />
            </div>
            <div>
              <h3 className="font-bold text-gray-800 text-sm">{`C\u00E0i \u0111\u1EB7t \u1EE9ng d\u1EE5ng`}</h3>
              <p className="text-xs text-gray-500">{`Truy c\u1EADp nhanh t\u1EEB m\u00E0n h\u00ECnh ch\u00EDnh`}</p>
            </div>
          </div>
          <button
            onClick={handleDismiss}
            className="p-1 hover:bg-gray-100 rounded-full transition-colors"
          >
            <X size={18} className="text-gray-400" />
          </button>
        </div>

        {showIOSGuide ? (
          <div className="space-y-2">
            <p className="text-xs text-gray-600 leading-relaxed">
              {`\u0110\u1EC3 c\u00E0i \u0111\u1EB7t, h\u00E3y l\u00E0m theo c\u00E1c b\u01B0\u1EDBc:`}
            </p>
            <div className="bg-blue-50 rounded-xl p-3 space-y-2">
              <div className="flex items-center gap-2 text-xs text-blue-800">
                <span className="w-5 h-5 bg-blue-600 text-white rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0">1</span>
                <span>{`B\u1EA5m n\u00FAt`} <b>{`Chia s\u1EBB`}</b> {`(icon h\u00ECnh vu\u00F4ng c\u00F3 m\u0169i t\u00EAn l\u00EAn) \u1EDF d\u01B0\u1EDBi m\u00E0n h\u00ECnh`}</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-blue-800">
                <span className="w-5 h-5 bg-blue-600 text-white rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0">2</span>
                <span>{`Cu\u1ED9n xu\u1ED1ng, ch\u1ECDn`} <b>{`"Th\u00EAm v\u00E0o M\u00E0n h\u00ECnh ch\u00EDnh"`}</b></span>
              </div>
              <div className="flex items-center gap-2 text-xs text-blue-800">
                <span className="w-5 h-5 bg-blue-600 text-white rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0">3</span>
                <span>{`B\u1EA5m`} <b>{`"Th\u00EAm"`}</b> {`\u1EDF g\u00F3c tr\u00EAn b\u00EAn ph\u1EA3i`}</span>
              </div>
            </div>
            <button
              onClick={handleDismiss}
              className="w-full py-2.5 text-xs text-gray-500 hover:text-gray-700 transition-colors"
            >
              {`\u0110\u00E3 hi\u1EC3u, \u0111\u00F3ng l\u1EA1i`}
            </button>
          </div>
        ) : (
          <button
            onClick={handleInstall}
            className="w-full py-3 bg-gradient-to-r from-brand-500 to-brand-600 text-white font-bold rounded-xl transition-all active:scale-95 flex items-center justify-center gap-2 shadow-md"
          >
            <Download size={18} />
            <span>{`C\u00E0i \u0111\u1EB7t ngay`}</span>
          </button>
        )}
      </div>
    </div>
  );
};
