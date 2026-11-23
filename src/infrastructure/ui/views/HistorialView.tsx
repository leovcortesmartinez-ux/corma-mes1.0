import { useState, useEffect, useMemo } from 'react';
import { db } from '../../../infrastructure/database/firebase';
import { collection, getDocs, query, where } from 'firebase/firestore';
import type { SystemLogEntry } from '../../services/systemLogger';

const MONTHS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

const formatDateTime = (timestamp: number): string => {
  const date = new Date(timestamp);
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${day}/${month}/${year} ${hours}:${minutes}`;
};

export const HistorialView: React.FC = () => {
  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState<number>(now.getMonth());
  const [selectedYear, setSelectedYear] = useState<number>(now.getFullYear());
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [moduleFilter, setModuleFilter] = useState<string>('Todos');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');

  const [logs, setLogs] = useState<SystemLogEntry[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const availableYears = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const years: number[] = [];
    for (let y = currentYear - 2; y <= currentYear + 2; y++) {
      years.push(y);
    }
    return years;
  }, []);

  const fetchLogs = async () => {
    setIsLoading(true);
    try {
      const q = query(
        collection(db, 'system_logs'),
        where('year', '==', selectedYear),
        where('month', '==', selectedMonth)
      );
      const snapshot = await getDocs(q);
      const data: SystemLogEntry[] = snapshot.docs.map(docSnap => ({
        id: docSnap.id,
        ...(docSnap.data() as Omit<SystemLogEntry, 'id'>)
      }));
      setLogs(data);
    } catch (error) {
      console.error('Error al obtener historial del sistema:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [selectedMonth, selectedYear]);

  const handleResetCurrentMonth = () => {
    const today = new Date();
    setSelectedMonth(today.getMonth());
    setSelectedYear(today.getFullYear());
  };

  const filteredAndSortedLogs = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();

    return logs
      .filter(log => {
        if (moduleFilter !== 'Todos' && log.module !== moduleFilter) {
          return false;
        }
        if (!term) return true;

        const formattedDate = formatDateTime(log.timestamp).toLowerCase();
        return (
          formattedDate.includes(term) ||
          log.module.toLowerCase().includes(term) ||
          log.action.toLowerCase().includes(term) ||
          log.operator.toLowerCase().includes(term) ||
          log.detail.toLowerCase().includes(term)
        );
      })
      .sort((a, b) =>
        sortOrder === 'desc' ? b.timestamp - a.timestamp : a.timestamp - b.timestamp
      );
  }, [logs, moduleFilter, searchTerm, sortOrder]);

  return (
    <div className="flex flex-col gap-4 select-none">
      {/* TARJETA DE ENCABEZADO Y SELECTORES DE FECHA */}
      <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-2xs flex flex-wrap justify-between items-center gap-4">
        <div>
          <h2 className="text-base font-black text-slate-900 tracking-tight uppercase">
            Historial General del Sistema
          </h2>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            Mostrando: {MONTHS[selectedMonth]} {selectedYear}
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <select
            value={selectedMonth}
            onChange={e => setSelectedMonth(Number(e.target.value))}
            className="border border-gray-300 rounded-md px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-50 hover:bg-white outline-none focus:ring-2 focus:ring-slate-800 cursor-pointer"
          >
            {MONTHS.map((monthName, idx) => (
              <option key={monthName} value={idx}>
                {monthName}
              </option>
            ))}
          </select>

          <select
            value={selectedYear}
            onChange={e => setSelectedYear(Number(e.target.value))}
            className="border border-gray-300 rounded-md px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-50 hover:bg-white outline-none focus:ring-2 focus:ring-slate-800 cursor-pointer"
          >
            {availableYears.map(yr => (
              <option key={yr} value={yr}>
                {yr}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={handleResetCurrentMonth}
            className="border border-gray-300 rounded-md px-3 py-1.5 text-xs font-bold text-slate-700 bg-white hover:bg-slate-100 transition cursor-pointer"
          >
            Mes Actual
          </button>
        </div>
      </div>

      {/* BARRA DE BÚSQUEDA Y FILTROS */}
      <div className="flex flex-wrap justify-between items-center gap-4 px-1">
        <div className="flex items-center gap-2">
          <label className="text-xs font-bold text-slate-600">Buscar:</label>
          <input
            type="text"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Operador, acción, pieza..."
            className="border border-gray-300 rounded-md px-2.5 py-1.5 text-xs bg-white text-slate-800 w-56 outline-none focus:ring-2 focus:ring-slate-800"
          />
        </div>

        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <label className="text-xs font-bold text-slate-600">Módulo:</label>
            <select
              value={moduleFilter}
              onChange={e => setModuleFilter(e.target.value)}
              className="border border-gray-300 rounded-md px-2.5 py-1.5 text-xs font-semibold text-slate-700 bg-white outline-none focus:ring-2 focus:ring-slate-800 cursor-pointer"
            >
              <option value="Todos">Todos</option>
              <option value="RH">RH</option>
              <option value="HERRAMIENTAS">HERRAMIENTAS</option>
              <option value="INVENTARIO">INVENTARIO</option>
              <option value="KANBAN">KANBAN</option>
              <option value="CONTROL">CONTROL</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-xs font-bold text-slate-600">Orden:</label>
            <select
              value={sortOrder}
              onChange={e => setSortOrder(e.target.value as 'desc' | 'asc')}
              className="border border-gray-300 rounded-md px-2.5 py-1.5 text-xs font-semibold text-slate-700 bg-white outline-none focus:ring-2 focus:ring-slate-800 cursor-pointer"
            >
              <option value="desc">Más recientes primero</option>
              <option value="asc">Más antiguos primero</option>
            </select>
          </div>
        </div>
      </div>

      {/* TABLA DE REGISTROS */}
      <div className="bg-white border border-gray-200 rounded-lg shadow-2xs overflow-hidden">
        <div className="overflow-x-auto max-h-[calc(100vh-290px)]">
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-100 border-b border-gray-200 sticky top-0 z-10">
              <tr className="text-[11px] font-black text-slate-600 uppercase tracking-wider">
                <th className="py-2.5 px-3 w-36">Fecha y Hora</th>
                <th className="py-2.5 px-3 w-32">Módulo</th>
                <th className="py-2.5 px-3 w-44">Acción</th>
                <th className="py-2.5 px-3 w-44">Operador</th>
                <th className="py-2.5 px-3">Detalle del Evento</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-xs text-slate-800">
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-500 font-semibold">
                    Cargando registros del sistema...
                  </td>
                </tr>
              ) : filteredAndSortedLogs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-400 italic">
                    No se encontraron movimientos registrados para {MONTHS[selectedMonth]} {selectedYear}.
                  </td>
                </tr>
              ) : (
                filteredAndSortedLogs.map(log => (
                  <tr
                    key={log.id}
                    className="odd:bg-white even:bg-slate-50/70 hover:bg-slate-100/70 transition-colors"
                  >
                    <td className="py-2 px-3 font-mono text-[11px] text-slate-600 whitespace-nowrap">
                      {formatDateTime(log.timestamp)}
                    </td>
                    <td className="py-2 px-3 font-bold text-slate-700 whitespace-nowrap">
                      {log.module}
                    </td>
                    <td className="py-2 px-3 font-semibold text-slate-900 whitespace-nowrap">
                      {log.action}
                    </td>
                    <td className="py-2 px-3 text-slate-800 whitespace-nowrap">
                      {log.operator}
                    </td>
                    <td className="py-2 px-3 text-slate-600">
                      {log.detail}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};