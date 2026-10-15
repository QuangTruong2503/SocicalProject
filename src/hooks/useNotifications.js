import { useContext } from 'react';
import { NotificationContext } from '../context/notificationContext.js';
export function useNotifications() { return useContext(NotificationContext); }
