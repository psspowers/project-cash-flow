import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { Notification } from '../../types';
import { NotifTypeIcon } from '../Layout/Topbar';

interface NotifToastProps {
  notification: Notification;
  onDismiss: () => void;
}

export default function NotifToast({ notification, onDismiss }: NotifToastProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Animate in
    const enterTimer = setTimeout(() => setVisible(true), 10);
    // Auto-dismiss after 5s
    const exitTimer = setTimeout(() => {
      setVisible(false);
      setTimeout(onDismiss, 300);
    }, 5000);
    return () => {
      clearTimeout(enterTimer);
      clearTimeout(exitTimer);
    };
  }, [onDismiss]);

  const handleDismiss = () => {
    setVisible(false);
    setTimeout(onDismiss, 300);
  };

  return (
    <div
      className={`flex items-start gap-3 w-80 bg-white border border-black/[0.08] rounded-xl shadow-xl px-4 py-3 transition-all duration-300 ${
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
      }`}
    >
      <div className="mt-0.5 shrink-0">
        <NotifTypeIcon type={notification.type} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[12px] font-semibold text-gray-800 leading-tight">{notification.title}</p>
        {notification.message && (
          <p className="text-[11px] text-gray-500 mt-0.5 leading-relaxed line-clamp-2">{notification.message}</p>
        )}
      </div>
      <button
        onClick={handleDismiss}
        className="shrink-0 text-gray-300 hover:text-gray-500 transition-colors mt-0.5"
      >
        <X size={13} />
      </button>
    </div>
  );
}
