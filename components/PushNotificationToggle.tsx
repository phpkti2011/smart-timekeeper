import React, { useState, useEffect } from 'react';
import { Bell, BellOff } from 'lucide-react';
import { registerPushSubscription } from '../utils/pushNotifications';
import { supabase } from '../utils/supabaseClient';

interface Props {
  userId: string;
}

export const PushNotificationToggle: React.FC<Props> = ({ userId }) => {
  const [isEnabled, setIsEnabled] = useState(false);
  const [showPanel, setShowPanel] = useState(false);

  useEffect(() => {
    checkStatus();
  }, [userId]);

  const checkStatus = async () => {
    try {
      if (!('Notification' in window) || !('serviceWorker' in navigator)) return;
      if (Notification.permission !== 'granted') return;

      const registration = await navigator.serviceWorker.getRegistration('/sw.js');
      if (registration) {
        const subscription = await registration.pushManager.getSubscription();
        setIsEnabled(!!subscription);
      }
    } catch {}
  };

  const handleToggle = () => {
    const newState = !isEnabled;
    setIsEnabled(newState);

    if (newState) {
      registerPushSubscription(userId).then(success => {
        if (!success) {
          setIsEnabled(false);
          if (Notification.permission === 'denied') {
            alert('B\u1EA1n \u0111\u00E3 ch\u1EB7n th\u00F4ng b\u00E1o trong tr\u00ECnh duy\u1EC7t.\n\n\u0110\u1EC3 b\u1EADt l\u1EA1i:\n1. B\u1EA5m bi\u1EC3u t\u01B0\u1EE3ng \u1ED5 kh\u00F3a tr\u00EAn thanh \u0111\u1ECBa ch\u1EC9\n2. Ch\u1ECDn "Th\u00F4ng b\u00E1o" > "Cho ph\u00E9p"');
          }
        }
      });
    } else {
      (async () => {
        try {
          const registration = await navigator.serviceWorker.getRegistration('/sw.js');
          if (registration) {
            const subscription = await registration.pushManager.getSubscription();
            if (subscription) {
              const endpoint = subscription.endpoint;
              await subscription.unsubscribe();
              supabase.from('push_subscriptions')
                .delete()
                .eq('user_id', userId)
                .eq('endpoint', endpoint)
                .then(() => {});
            }
          }
        } catch {}
      })();
    }
    setShowPanel(false);
  };

  return (
    <div className="relative">
      <button
        onClick={() => setShowPanel(!showPanel)}
        className={`p-2 rounded-full backdrop-blur-sm relative transition-colors duration-200 ${
          isEnabled ? 'bg-green-500/30 text-green-100' : 'bg-white/10 text-white/70'
        } hover:bg-white/20`}
        title={isEnabled ? 'Th\u00F4ng b\u00E1o: B\u1EACT' : 'Th\u00F4ng b\u00E1o: T\u1EAFT'}
      >
        {isEnabled ? <Bell size={18} /> : <BellOff size={18} />}
        <span className={`absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border border-white transition-colors duration-200 ${
          isEnabled ? 'bg-green-400' : 'bg-gray-400'
        }`} />
      </button>

      {showPanel && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setShowPanel(false)} />
          <div className="absolute right-0 top-12 z-50 bg-white rounded-2xl shadow-2xl border border-gray-100 p-4 w-72">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                {isEnabled ? (
                  <Bell size={18} className="text-green-600" />
                ) : (
                  <BellOff size={18} className="text-gray-400" />
                )}
                <span className="font-bold text-gray-800 text-sm">{`Th\u00F4ng b\u00E1o \u0111\u1EA9y`}</span>
              </div>

              <button
                onClick={handleToggle}
                className={`relative w-12 h-7 rounded-full transition-colors duration-200 ${
                  isEnabled ? 'bg-green-500' : 'bg-gray-300'
                }`}
              >
                <span
                  className={`absolute top-0.5 w-6 h-6 bg-white rounded-full shadow-md transform transition-transform duration-200 ${
                    isEnabled ? 'translate-x-[22px]' : 'translate-x-0.5'
                  }`}
                />
              </button>
            </div>

            <p className="text-xs text-gray-500 leading-relaxed">
              {isEnabled
                ? `B\u1EA1n s\u1EBD nh\u1EADn th\u00F4ng b\u00E1o khi c\u00F3 \u0111\u01A1n m\u1EDBi, duy\u1EC7t \u0111\u01A1n, th\u01B0\u1EDFng/ph\u1EA1t,...`
                : `B\u1EADt \u0111\u1EC3 nh\u1EADn th\u00F4ng b\u00E1o ngay tr\u00EAn \u0111i\u1EC7n tho\u1EA1i khi c\u00F3 c\u1EADp nh\u1EADt.`}
            </p>

            {!('Notification' in window) && (
              <p className="text-xs text-red-500 mt-2">
                {`Tr\u00ECnh duy\u1EC7t kh\u00F4ng h\u1ED7 tr\u1EE3 th\u00F4ng b\u00E1o \u0111\u1EA9y.`}
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
};
