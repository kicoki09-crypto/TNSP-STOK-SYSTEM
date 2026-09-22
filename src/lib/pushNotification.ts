/**
 * Helper utility for handling web push / local native browser notifications
 * for PWA and background tab scenarios.
 */

export const requestNotificationPermission = async (): Promise<boolean> => {
  if (!('Notification' in window)) {
    console.warn('Browser tidak mendukung notifikasi sistem.');
    return false;
  }

  try {
    const permission = await Notification.requestPermission();
    return permission === 'granted';
  } catch (e) {
    console.error('Gagal meminta izin notifikasi:', e);
    return false;
  }
};

export const getNotificationPermissionStatus = (): 'default' | 'granted' | 'denied' | 'unsupported' => {
  if (!('Notification' in window)) {
    return 'unsupported';
  }
  return Notification.permission;
};

interface NotificationOptions {
  body?: string;
  icon?: string;
  tag?: string;
  badge?: string;
  silent?: boolean;
}

export const sendBackgroundNotification = (title: string, options?: NotificationOptions) => {
  // Check if the Notification API exists
  if (!('Notification' in window)) return;

  // Check if permission is granted
  if (Notification.permission !== 'granted') return;

  // Crucial: Only trigger native pop-up notification if the user is NOT actively using the app
  // (the tab is inactive, minimized, backgrounded, or installed as PWA and closed/backgrounded)
  const isAppBackgrounded = document.visibilityState === 'hidden' || !document.hasFocus();

  if (isAppBackgrounded) {
    try {
      const defaultOptions: NotificationOptions = {
        icon: 'https://drive.google.com/thumbnail?id=1BdAGiIXvPJHhMusNhQFi65vS606MZB8J&sz=w200', // PWA Logo
        badge: 'https://drive.google.com/thumbnail?id=1BdAGiIXvPJHhMusNhQFi65vS606MZB8J&sz=w200',
        silent: false,
        ...options
      };

      // Create native web notification
      const notification = new Notification(title, defaultOptions);

      notification.onclick = () => {
        window.focus();
        // Option to bring tab to focus if user clicks it
        try {
          window.parent.focus();
        } catch (e) {}
        notification.close();
      };
    } catch (error) {
      console.warn('Gagal memicu native notification (kemungkinan di dalam iframe sandboxed tanpa izin):', error);
      
      // Fallback: If service worker registration is available, we can trigger via Service Worker registration
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.ready.then((registration) => {
          registration.showNotification(title, {
            icon: 'https://drive.google.com/thumbnail?id=1BdAGiIXvPJHhMusNhQFi65vS606MZB8J&sz=w200',
            badge: 'https://drive.google.com/thumbnail?id=1BdAGiIXvPJHhMusNhQFi65vS606MZB8J&sz=w200',
            ...options
          }).catch(err => {
            console.warn('Service worker showNotification failed:', err);
          });
        });
      }
    }
  }
};
