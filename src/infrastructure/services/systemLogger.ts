import { db } from '../database/firebase';
import { collection, addDoc } from 'firebase/firestore';

export type SystemModule = 'RH' | 'HERRAMIENTAS' | 'INVENTARIO' | 'KANBAN' | 'CONTROL';

export interface SystemLogEntry {
  id?: string;
  timestamp: number;
  month: number; // 0 - 11
  year: number;
  module: SystemModule;
  action: string;
  operator: string;
  detail: string;
}

export const logSystemEvent = async (
  module: SystemModule,
  action: string,
  operator: string,
  detail: string
): Promise<void> => {
  try {
    const now = new Date();
    const entry: Omit<SystemLogEntry, 'id'> = {
      timestamp: now.getTime(),
      month: now.getMonth(),
      year: now.getFullYear(),
      module,
      action: action.toUpperCase(),
      operator: operator || 'Sistema',
      detail
    };

    await addDoc(collection(db, 'system_logs'), entry);
  } catch (error) {
    console.error('Error al registrar evento en el historial:', error);
  }
};