import { useState, useEffect } from 'react';
import { User } from '../../../domain/entities/User';
import cormaLogo from '../../../Images/CORMA_logo2.png';
import { KanbanBoard } from '../views/KanbanBoard';
import { InventarioView } from '../views/InventarioView';
import { ControlView } from '../views/ControlView';
import { RHView } from '../views/RHView';
import { FirestoreInventoryRepository } from '../../../adapters/repositories/FirestoreInventoryRepository';
import { FirestoreWorkOrderRepository } from '../../../adapters/repositories/FirestoreWorkOrderRepository';
import { HistorialView } from '../views/HistorialView';
import { DashboardOverview } from '../views/DashboardOverview';

const inventoryRepository = new FirestoreInventoryRepository();
const workOrderRepository = new FirestoreWorkOrderRepository();

interface DashboardProps {
  user: User;
  onLogout: () => void;
}

export const Dashboard = ({ user, onLogout }: DashboardProps) => {
  const [activeTab, setActiveTab] = useState('DASHBOARD');

  const [activeOrdersCount, setActiveOrdersCount] = useState(0);
  const [inventoryAlertsCount, setInventoryAlertsCount] = useState(0);

  // Cargar contadores iniciales de Producción e Inventario al iniciar sesión
  useEffect(() => {
    const fetchInitialCounts = async () => {
      try {
        // Cargar órdenes activas de producción (todas las que no estén 'Terminada')
        const ordersData = await workOrderRepository.getAll();
        const activeOrders = ordersData.filter(order => order.status !== 'Terminada').length;
        setActiveOrdersCount(activeOrders);

        // Cargar alertas de inventario
        const inventoryData = await inventoryRepository.getAll();
        const inventoryAlerts = inventoryData.filter(
          item => (item.category !== 'Máquinas' && item.quantity <= item.minStock) || 
                  (item.category === 'Máquinas' && item.status === 'PARADA')
        ).length;
        setInventoryAlertsCount(inventoryAlerts);
      } catch (error) {
        console.error("Error al cargar los contadores iniciales:", error);
      }
    };

    fetchInitialCounts();
  }, []);

  const menuItems = [
    { id: 'DASHBOARD', label: 'DASHBOARD', roles: ['Administrador', 'Operador', 'RH'] },
    { 
      id: 'PRODUCCION', 
      label: 'PRODUCCION', 
      roles: ['Administrador', 'Operador'], 
      badge: activeOrdersCount > 0 ? activeOrdersCount : undefined 
    },
    { 
      id: 'INVENTARIO', 
      label: 'INVENTARIO', 
      roles: ['Administrador', 'Operador'],
      badge: inventoryAlertsCount > 0 ? inventoryAlertsCount : undefined 
    },
    { id: 'HISTORIAL', label: 'HISTORIAL', roles: ['Administrador', 'Operador', 'RH'] },
    { id: 'CONTROL', label: 'CONTROL', roles: ['Administrador'] },
    { id: 'RH', label: 'RH', roles: ['Administrador', 'RH'] },
  ];

  const visibleMenu = menuItems.filter(item => item.roles.includes(user.role));

  return (
    <div className="flex h-screen bg-slate-100 font-sans overflow-hidden">
      {/* MENÚ LATERAL CORPORATIVO */}
      <div className="w-64 bg-slate-900 text-slate-100 flex flex-col shadow-xl z-10 border-r border-slate-800">
        <div className="p-6 flex flex-col items-center border-b border-slate-800 bg-slate-950/40">
          <img src={cormaLogo} alt="CORMA" className="w-28 h-auto object-contain mb-1" />
          <span className="text-[10px] font-bold tracking-widest text-slate-400 uppercase">
            Sistema MES
          </span>
        </div>

        <nav className="flex-1 mt-3 px-3 space-y-1">
          {visibleMenu.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center justify-between px-4 py-3 rounded-lg text-left text-sm tracking-wide transition-all cursor-pointer ${
                  isActive
                    ? 'bg-[#1B2638] border border-orange-500/40 text-white font-extrabold shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_4px_12px_rgba(0,0,0,0.35)]'
                    : 'border border-transparent text-slate-400 font-bold hover:bg-white/[0.04] hover:text-slate-100'
                }`}
              >
                <span>{item.label}</span>

                {item.badge !== undefined && item.badge > 0 && (
                  <span className="bg-red-600 text-white text-[11px] font-bold px-2 py-0.5 rounded-full">
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="p-3 border-t border-slate-800">
          <button
            onClick={onLogout}
            className="w-full text-left px-4 py-3 rounded-lg font-bold text-sm tracking-wide text-slate-400 hover:bg-red-950/60 hover:text-red-400 transition-colors cursor-pointer"
          >
            CERRAR SESIÓN
          </button>
        </div>
      </div>

      {/* CONTENIDO PRINCIPAL */}
      <div className="flex-1 flex flex-col overflow-y-auto bg-slate-50">
        <div className="bg-white px-6 py-4 border-b border-gray-200 flex justify-between items-center">
          <div>
            <h1 className="text-xl font-black text-slate-900 tracking-tight uppercase">
              {activeTab === 'DASHBOARD' ? 'PANEL DE CONTROL GENERAL' : activeTab}
            </h1>
            <p className="text-xs text-slate-500 mt-0.5 font-medium">
              Usuario activo: <span className="text-slate-900 font-bold">{user.name}</span> · <span className="text-orange-600 font-semibold">{user.role}</span>
            </p>
          </div>
        </div>

        {/* ÁREA DE TRABAJO DINÁMICA */}
        <div className="p-6">
          {activeTab === 'DASHBOARD' && (
             <DashboardOverview onNavigateToHistorial={() => setActiveTab('HISTORIAL')} />
          )}

          {activeTab === 'PRODUCCION' && (
            <KanbanBoard 
              onOrdersLoaded={(count) => setActiveOrdersCount(count)} 
              userRole={user.role}  
              userName={user.name}  
            />
          )}
          
          {activeTab === 'INVENTARIO' && (
            <InventarioView 
              onAlertsLoaded={(count) => setInventoryAlertsCount(count)} 
              userName={user.name}
            />
          )}

          {activeTab === 'CONTROL' && (
            <ControlView userName={user.name} />
          )}

          {activeTab === 'RH' && (
            <RHView userName={user.name} />
          )}

          {activeTab === 'HISTORIAL' && (
            <HistorialView />
          )}
        </div>
      </div>
    </div>
  );
};