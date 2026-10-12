import { createContext, useContext } from 'react';

export const NotificationContext = createContext(null);

export function useNotification() {
  const context = useContext(NotificationContext);
  if (!context) throw new Error('useNotification debe utilizarse dentro de NotificationProvider');
  return context;
}
