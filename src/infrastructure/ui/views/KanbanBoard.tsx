import { useState, useEffect } from 'react';
import { WorkOrder, type Priority } from '../../../domain/entities/WorkOrder';
import { InventoryItem } from '../../../domain/entities/InventoryItem';
import { FirestoreWorkOrderRepository } from '../../../adapters/repositories/FirestoreWorkOrderRepository';
import { FirestoreInventoryRepository } from '../../../adapters/repositories/FirestoreInventoryRepository';
import { CreateWorkOrderUseCase } from '../../../application/use-cases/CreateWorkOrderUseCase';
import { FirestoreUserRepository } from '../../../adapters/repositories/FirestoreUserRepository';
import { logSystemEvent } from '../../services/systemLogger';

const userRepository = new FirestoreUserRepository();
const workOrderRepository = new FirestoreWorkOrderRepository();
const inventoryRepository = new FirestoreInventoryRepository();
const createWorkOrderUseCase = new CreateWorkOrderUseCase(workOrderRepository);

interface KanbanBoardProps {
  onOrdersLoaded?: (count: number) => void;
  userRole?: 'Administrador' | 'Operador' | string;
  userName?: string;
}

interface ToolWearEntry {
  toolId: string;
  wearPercent: number;
}

export const KanbanBoard = ({ onOrdersLoaded, userRole = 'Admin', userName = '' }: KanbanBoardProps) => {
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [availableTools, setAvailableTools] = useState<InventoryItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isClosingModal, setIsClosingModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isClosingDelete, setIsClosingDelete] = useState(false);

  const [isFinishModalOpen, setIsFinishModalOpen] = useState(false);
  const [isClosingFinish, setIsClosingFinish] = useState(false);
  const [toolWearEntries, setToolWearEntries] = useState<ToolWearEntry[]>([]);

  const [toast, setToast] = useState<{ message: string; type: 'error' | 'success' } | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);

  const showToast = (message: string, type: 'error' | 'success' = 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const [dbOperators, setDbOperators] = useState<string[]>([]);

  const [partName, setPartName] = useState('');
  const [client, setClient] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [priority, setPriority] = useState<Priority>('Baja');
  const [assignedOperators, setAssignedOperators] = useState<string[]>([]);
  
  const [isSuccessModalOpen, setIsSuccessModalOpen] = useState(false);
  const [isClosingSuccess, setIsClosingSuccess] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  
  const [materialType, setMaterialType] = useState('');
  const [quantity, setQuantity] = useState<number>(1);
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  
  const formatDateToMexican = (dateStr: string) => {
    if (!dateStr) return '';
    const [year, month, day] = dateStr.split('-');
    if (!year || !month || !day) return dateStr;
    return `${day}/${month}/${year}`;
  };

  const closeSuccessModal = () => {
    setIsClosingSuccess(true);
    setTimeout(() => {
      setIsSuccessModalOpen(false);
      setIsClosingSuccess(false);
    }, 180);
  };

  const loadOrders = async () => {
    try {
      const [orders, users, invItems] = await Promise.all([
        workOrderRepository.getAll(),
        userRepository.getAll(),
        inventoryRepository.getAll()
      ]);
      
      setWorkOrders(orders);
      setAvailableTools(invItems.filter(item => item.category === 'Herramientas'));
      
      const operatorsOnly = users
        .filter(u => u.role === 'Operador')
        .map(u => u.name);
        
      setDbOperators(operatorsOnly); 
      
      const today = new Date().toISOString().split('T')[0];
      const urgentCount = orders.filter(wo => {
        if (wo.status === 'Terminada') return false;
        const isDelayed = wo.dueDate && wo.dueDate < today && wo.status !== 'Inspección';
        return wo.priority === 'Critica' || isDelayed;
      }).length;

      if (onOrdersLoaded) onOrdersLoaded(urgentCount);
    } catch (error) {
      console.error("Error al cargar órdenes:", error);
    }
  };

  useEffect(() => {
    loadOrders();
  }, []);

  const closeModal = () => {
    setIsClosingModal(true);
    setTimeout(() => {
      setIsModalOpen(false);
      setIsClosingModal(false);
    }, 180);
  };

  const closeDeleteModal = () => {
    setIsClosingDelete(true);
    setTimeout(() => {
      setIsDeleteModalOpen(false);
      setIsClosingDelete(false);
    }, 180);
  };

  const handleOperatorSelection = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selected = Array.from(e.target.selectedOptions, option => option.value);
    setAssignedOperators(selected);
  };

  const selectedOrder = workOrders.find(wo => wo.id === selectedId);

  const isAssignedToMe = selectedOrder?.assignedOperators.includes(userName);
  const canActOnOrder = userRole === 'Administrador' || (userRole === 'Operador' && isAssignedToMe);

  const handleAdvancePhase = async () => {
    if (!selectedOrder) return;
    try {
      if (selectedOrder.status === 'Pendiente') selectedOrder.assign();
      else if (selectedOrder.status === 'Asignado') selectedOrder.startMachining();
      else if (selectedOrder.status === 'Trabajando') selectedOrder.sendToInspection();
      
      await workOrderRepository.save(selectedOrder);
      await logSystemEvent(
        'KANBAN',
        'AVANZAR',
        userName,
        `avanzó de fase (${selectedOrder.status.toLowerCase()}) el trabajo: ${selectedOrder.partName}`
      );
      loadOrders();
    } catch (error: any) {
      showToast(`Error: ${error.message}`, 'error');
    }
  };

  const handleRevertPhase = async () => {
    if (!selectedOrder) return;
    try {
      selectedOrder.revert();
      await workOrderRepository.save(selectedOrder);
      await logSystemEvent(
        'KANBAN',
        'RETROCEDER',
        userName,
        `se regresó a la fase anterior (${selectedOrder.status.toLowerCase()}) el trabajo: ${selectedOrder.partName}`
      );
      loadOrders();
    } catch (error: any) {
      showToast(`Error: ${error.message}`, 'error');
    }
  };

  const closeFinishModal = () => {
    setIsClosingFinish(true);
    setTimeout(() => {
      setIsFinishModalOpen(false);
      setIsClosingFinish(false);
    }, 180);
  };

  const handleFinishClick = () => {
    if (!selectedId) return;
    setToolWearEntries([]);
    setIsFinishModalOpen(true);
  };

  const handleAddToolWearRow = () => {
    if (availableTools.length === 0) {
      showToast('No hay herramientas registradas en el inventario.', 'error');
      return;
    }
    setToolWearEntries(prev => [
      ...prev,
      { toolId: availableTools[0].id, wearPercent: 5 }
    ]);
  };

  const handleUpdateToolWearRow = (index: number, field: keyof ToolWearEntry, value: string | number) => {
    setToolWearEntries(prev =>
      prev.map((row, idx) =>
        idx === index
          ? {
              ...row,
              [field]:
                field === 'wearPercent'
                  ? Math.max(0, Math.min(100, Number(value)))
                  : String(value)
            }
          : row
      )
    );
  };

  const handleRemoveToolWearRow = (index: number) => {
    setToolWearEntries(prev => prev.filter((_, idx) => idx !== index));
  };

  const confirmFinishOrder = async () => {
    if (!selectedOrder) return;
    try {
      const finishedPartName = selectedOrder.partName;
      const finishedClient = selectedOrder.client;

      selectedOrder.finish();
      await workOrderRepository.save(selectedOrder);

      const wearSummaryParts: string[] = [];
      for (const entry of toolWearEntries) {
        if (entry.wearPercent <= 0) continue;
        const tool = availableTools.find(t => t.id === entry.toolId);
        if (!tool) continue;

        const wearResult = tool.applyWear(entry.wearPercent);
        await inventoryRepository.save(tool);

        const statusDetail = wearResult.discarded
          ? 'Unidad llegó a 0% (dada de baja del stock)'
          : `Restante: ${wearResult.remainingLife}%`;

        await logSystemEvent(
          'HERRAMIENTAS',
          'DESGASTE HERRAMIENTA',
          userName,
          `${tool.code} - ${tool.description} (-${entry.wearPercent}% vida útil | ${statusDetail}) en O.T. ${finishedPartName}`
        );

        wearSummaryParts.push(`${tool.code}: ${wearResult.discarded ? '0% (baja)' : `${wearResult.remainingLife}%`}`);
      }

      await logSystemEvent(
        'KANBAN',
        'TERMINAR TRABAJO',
        userName,
        `marcó como terminado el trabajo: ${finishedPartName} (Cliente: ${finishedClient})${
          wearSummaryParts.length > 0 ? ` | Desgaste: ${wearSummaryParts.join(', ')}` : ''
        }`
      );

      setSelectedId(null);
      setToolWearEntries([]);
      setIsFinishModalOpen(false); 
      loadOrders();
      
      setSuccessMessage(
        wearSummaryParts.length > 0
          ? `Trabajo completado y vida útil actualizada (${wearSummaryParts.join(' · ')}).`
          : 'Se ha sumado al historial de completados.'
      );
      setIsSuccessModalOpen(true); 
    } catch (error: any) {
      showToast(`Error: ${error.message}`, 'error');
    }
  };

  const handleOpenEdit = () => {
    if (!selectedOrder) return;
    setEditingId(selectedOrder.id);
    setPartName(selectedOrder.partName);
    setClient(selectedOrder.client);
    setDescription(selectedOrder.description);
    setDueDate(selectedOrder.dueDate);
    setPriority(selectedOrder.priority);
    setAssignedOperators(selectedOrder.assignedOperators);
    setMaterialType(selectedOrder.materialType || '');
    setQuantity(selectedOrder.quantity || 1);
    setCustomerPhone(selectedOrder.customerPhone || '');
    setCustomerEmail(selectedOrder.customerEmail || ''); 
    setIsModalOpen(true);
  };

  const handleDeleteClick = () => {
    if (!selectedId) return;
    setIsDeleteModalOpen(true);
  };

  const confirmDelete = async () => {
    if (!selectedId) return;
    try {
      const orderToDelete = workOrders.find(wo => wo.id === selectedId);
      await workOrderRepository.delete(selectedId);
      await logSystemEvent(
        'KANBAN',
        'ELIMINAR TRABAJO',
        userName,
        `eliminó el trabajo: ${orderToDelete?.partName || selectedId}`
      );

      setSelectedId(null);
      setIsDeleteModalOpen(false);
      loadOrders();
      showToast('Trabajo eliminado.', 'success');
    } catch (error: any) {
      showToast(`Error al eliminar: ${error.message}`, 'error');
    }
  };

  const handleSubmitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingId) {
        const existing = workOrders.find(wo => wo.id === editingId);
        if (existing) {
          existing.partName = partName;
          existing.client = client;
          existing.description = description;
          existing.dueDate = dueDate;
          existing.priority = priority;
          existing.assignedOperators = assignedOperators;
          existing.materialType = materialType;
          existing.quantity = Number(quantity);
          existing.customerPhone = customerPhone;
          existing.customerEmail = customerEmail; 
          
          await workOrderRepository.save(existing);
          await logSystemEvent(
            'KANBAN',
            'EDITAR TRABAJO',
            userName,
            `editó el trabajo: ${partName} (Cliente: ${client})`
          );
          showToast('Trabajo actualizado exitosamente.', 'success');
        }
      } else {
        await createWorkOrderUseCase.execute({
          partName, 
          client, 
          description, 
          dueDate, 
          priority, 
          assignedOperators,
          materialType,
          quantity: Number(quantity),
          customerPhone,
          customerEmail 
        });
        await logSystemEvent(
          'KANBAN',
          'NUEVO TRABAJO',
          userName,
          `creó el trabajo: ${partName} para el cliente ${client} (Prioridad: ${priority})`
        );
        showToast('Nuevo trabajo creado exitosamente.', 'success');
      }
      
      setIsModalOpen(false);
      setEditingId(null);
      setPartName(''); setClient(''); setDescription(''); setDueDate(''); setPriority('Baja'); setAssignedOperators([]);
      setMaterialType(''); setQuantity(1); setCustomerPhone(''); setCustomerEmail('');
      loadOrders();
    } catch (error: any) {
      showToast(`Error: ${error.message}`, 'error');
    }
  };

  const getOrderScore = (wo: WorkOrder): number => {
    const today = new Date().toISOString().split('T')[0];
    const isDelayed = wo.dueDate && wo.dueDate < today && wo.status !== 'Inspección';
    
    if (isDelayed) return 100;

    switch (wo.priority) {
      case 'Critica': return 4;
      case 'Alta': return 3;
      case 'Media': return 2;
      case 'Baja': return 1;
      default: return 0;
    }
  };

  const columns = ['Pendiente', 'Asignado', 'Trabajando', 'Inspección'];
  const todayStr = new Date().toISOString().split('T')[0];

  const activeOrders = workOrders
    .filter(wo => wo.status !== 'Terminada')
    .sort((a, b) => getOrderScore(b) - getOrderScore(a));

  const handleContextMenu = (e: React.MouseEvent, id?: string) => {
    e.preventDefault();
    e.stopPropagation();
    setSelectedId(id || null);
    setContextMenu({ x: e.clientX, y: e.clientY });
  };

  return (
    <div 
      className="h-[80vh] flex flex-col relative select-none"
      onClick={() => {
        setSelectedId(null);
        setContextMenu(null);
      }}
    >
      {/* MENÚ CONTEXTUAL */}
      {contextMenu && (
        <div 
          className="fixed bg-white border border-gray-200 shadow-xl rounded-md py-1 z-[150] w-56 animate-fadeIn" 
          style={{ top: contextMenu.y, left: contextMenu.x }} 
          onClick={(e) => e.stopPropagation()}
        >
          {userRole === 'Administrador' && (
            <button 
              className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-100 flex items-center gap-2 transition cursor-pointer" 
              onClick={() => { 
                setContextMenu(null); 
                setEditingId(null); 
                setPartName(''); setClient(''); setDescription(''); setDueDate(''); setPriority('Baja'); setAssignedOperators([]);
                setMaterialType(''); setQuantity(1); setCustomerPhone(''); setCustomerEmail('');
                setIsModalOpen(true); 
              }}
            >
              Nuevo Trabajo
            </button>
          )}
          
          {selectedOrder && (
            <>
              {userRole === 'Administrador' && (
                <button 
                  className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-100 flex items-center gap-2 transition cursor-pointer" 
                  onClick={() => { setContextMenu(null); handleOpenEdit(); }}
                >
                  Editar Trabajo
                </button>
              )}

              {selectedOrder.status === 'Inspección' && canActOnOrder && (
                <button 
                  className="w-full text-left px-4 py-2 text-sm text-emerald-700 font-semibold hover:bg-emerald-50 flex items-center gap-2 transition cursor-pointer" 
                  onClick={() => { setContextMenu(null); handleFinishClick(); }}
                >
                  Terminar Trabajo
                </button>
              )}

              {userRole === 'Administrador' && (
                <>
                  <div className="h-px bg-gray-100 my-1 mx-2"></div>
                  <button 
                    className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 hover:text-red-700 font-bold flex items-center gap-2 transition cursor-pointer" 
                    onClick={() => { setContextMenu(null); handleDeleteClick(); }}
                  >
                    Eliminar Trabajo
                  </button>
                </>
              )}
            </>
          )}
        </div>
      )}
      
      {/* NOTIFICACIÓN TOAST */}
      {toast && (
        <div className={`fixed top-6 left-1/2 transform -translate-x-1/2 z-[100] px-5 py-3 rounded-lg shadow-xl font-bold flex items-center gap-2.5 animate-fadeIn transition-all duration-300 border ${
          toast.type === 'error' ? 'bg-red-50 text-red-700 border-red-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'
        }`}>
          <span className="text-sm">{toast.message}</span>
        </div>
      )}

      {/* BARRA DE ACCIONES SUPERIOR */}
      <div 
        className="bg-white p-4 rounded-lg shadow-2xs border border-gray-200 mb-4 flex gap-2.5 items-center flex-wrap" 
        onClick={e => e.stopPropagation()}
      >
        <span className="text-xs font-black text-slate-500 uppercase tracking-wide mr-1">Acciones:</span>
        
        <button 
          onClick={handleRevertPhase}
          disabled={!selectedOrder || selectedOrder.status === 'Pendiente' || !canActOnOrder}
          className={`px-3.5 py-1.5 rounded font-bold text-xs transition-all ${
            selectedOrder && selectedOrder.status !== 'Pendiente' && canActOnOrder
              ? 'bg-slate-700 text-white hover:bg-slate-800 cursor-pointer' 
              : 'bg-gray-100 text-gray-400 cursor-not-allowed'
          }`}
          title="Retroceder fase"
        >
          ← Anterior
        </button>

        <button 
          onClick={handleAdvancePhase}
          disabled={!selectedOrder || selectedOrder.status === 'Inspección' || selectedOrder.status === 'Terminada' || !canActOnOrder}
          className={`px-3.5 py-1.5 rounded font-bold text-xs transition-all ${
            selectedOrder && selectedOrder.status !== 'Inspección' && selectedOrder.status !== 'Terminada' && canActOnOrder
              ? 'bg-slate-900 text-white hover:bg-slate-800 cursor-pointer' 
              : 'bg-gray-100 text-gray-400 cursor-not-allowed'
          }`}
          title="Avanzar fase"
        >
          Siguiente →
        </button>

        <button 
          onClick={handleFinishClick}
          disabled={!selectedOrder || selectedOrder.status !== 'Inspección' || !canActOnOrder}
          className={`px-3.5 py-1.5 rounded font-bold text-xs transition-all ${
            selectedOrder && selectedOrder.status === 'Inspección' && canActOnOrder
              ? 'bg-emerald-600 text-white hover:bg-emerald-700 cursor-pointer' 
              : 'bg-gray-100 text-gray-400 cursor-not-allowed'
          }`}
        >
          Terminar Trabajo
        </button>

        {userRole === 'Administrador' && (
          <>
            <div className="h-5 w-px bg-gray-200 mx-1"></div>

            <button 
              onClick={handleOpenEdit}
              disabled={!selectedId}
              className={`px-3.5 py-1.5 rounded font-bold text-xs transition-all ${
                selectedId 
                  ? 'bg-slate-600 text-white hover:bg-slate-700 cursor-pointer' 
                  : 'bg-gray-100 text-gray-400 cursor-not-allowed'
              }`}
            >
              Editar
            </button>

            <button 
              onClick={handleDeleteClick}
              disabled={!selectedId}
              className={`px-3.5 py-1.5 rounded font-bold text-xs transition-all ${
                selectedId 
                  ? 'bg-red-600 text-white hover:bg-red-700 cursor-pointer' 
                  : 'bg-gray-100 text-gray-400 cursor-not-allowed'
              }`}
            >
              Eliminar
            </button>
          </>
        )}

        <div className="w-full mt-1.5 pt-2 border-t border-gray-100 flex items-center gap-2 overflow-hidden">
          <span className="text-xs text-slate-500 font-bold shrink-0">Seleccionado:</span>
          <span className="text-xs text-slate-900 font-bold break-all">
            {selectedOrder ? selectedOrder.partName : 'Ninguno'}
          </span>
        </div>
      </div>

      {/* TABLERO KANBAN */}
      <div 
        className="flex-1 flex gap-4 overflow-x-auto pb-4"
        onContextMenu={(e) => handleContextMenu(e)}
      >
        {columns.map(col => {
          const count = activeOrders.filter(wo => wo.status === col).length;

          return (
            <div key={col} className="bg-slate-100/90 min-w-[300px] flex-1 rounded-lg p-4 flex flex-col border border-gray-200 overflow-hidden">
              
              <div className="flex justify-between items-center mb-3 px-1 pb-2 border-b border-gray-200">
                <h3 className="font-black text-slate-700 text-xs uppercase tracking-wider">{col}</h3>
                <span className="bg-white border border-gray-200 text-slate-700 font-bold text-xs px-2 py-0.5 rounded-full">
                  {count}
                </span>
              </div>
              
              <div className="flex-1 overflow-y-auto space-y-2.5 pr-0.5">
                {activeOrders.filter(wo => wo.status === col).map(wo => {
                  const isSelected = selectedId === wo.id;
                  const isDelayed = wo.dueDate && wo.dueDate < todayStr;

                  let cardStyle = "bg-white border border-gray-200 hover:border-gray-300";
                  if (isDelayed) {
                    cardStyle = "bg-white border border-red-300 border-l-4 border-l-red-600";
                  }
                  if (isSelected) {
                    cardStyle = "bg-slate-50 border-2 border-slate-900 shadow-sm z-20";
                  }

                  const priorityBadge =
                    wo.priority === 'Critica'
                      ? 'bg-red-100 text-red-700 border-red-200'
                      : wo.priority === 'Alta'
                      ? 'bg-orange-100 text-orange-700 border-orange-200'
                      : wo.priority === 'Media'
                      ? 'bg-amber-100 text-amber-800 border-amber-200'
                      : 'bg-slate-100 text-slate-600 border-slate-200';

                  return (
                    <div 
                      key={wo.id} 
                      onClick={(e) => {
                        e.stopPropagation(); 
                        setSelectedId(wo.id);
                        setContextMenu(null);
                      }}
                      onContextMenu={(e) => handleContextMenu(e, wo.id)}
                      className={`rounded-lg p-3.5 shadow-2xs cursor-pointer transition-colors duration-150 relative overflow-hidden ${cardStyle}`}
                    >
                      {isDelayed && (
                        <div className="text-red-700 font-black text-[10px] tracking-wider uppercase mb-2 bg-red-50 border border-red-200 px-2 py-0.5 rounded inline-block">
                          TRABAJO RETRASADO
                        </div>
                      )}

                      <div className="flex justify-between items-start mb-1 gap-2">
                        <h4 className="font-black text-slate-900 text-sm break-all">{wo.partName}</h4>
                        <span className="text-[11px] font-mono text-slate-400 shrink-0">{wo.id}</span>
                      </div>

                      <p className="text-xs text-slate-500 line-clamp-2 mb-2 break-all">{wo.description || 'Sin notas adicionales'}</p>
                      <p className="text-xs text-slate-700 font-bold mb-3 truncate">
                        {wo.assignedOperators.join(', ') || 'Sin operador'}
                      </p>
                      
                      <div className="flex justify-between items-center pt-2 border-t border-gray-100">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded border uppercase ${priorityBadge}`}>
                          {wo.priority}
                        </span>
                        <span className={`text-xs font-medium ${isDelayed ? 'text-red-600 font-bold' : 'text-slate-500'}`}>
                          {formatDateToMexican(wo.dueDate)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* BOTÓN FLOTANTE NUEVO TRABAJO */}
      {userRole === 'Administrador' && (
        <button 
          onClick={() => {
            setEditingId(null); 
            setPartName(''); setClient(''); setDescription(''); setDueDate(''); setPriority('Baja'); setAssignedOperators([]);
            setMaterialType(''); setQuantity(1); setCustomerPhone(''); setCustomerEmail('');
            setIsModalOpen(true);
          }}
          className="fixed bottom-8 right-8 bg-slate-900 hover:bg-slate-800 text-white w-14 h-14 rounded-full shadow-xl transition-all duration-200 hover:scale-105 active:scale-95 z-50 cursor-pointer flex items-center justify-center group"
          title="Crear Nuevo Trabajo"
        >
          <svg className="w-6 h-6 text-white transition-transform duration-200 group-hover:rotate-90" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15"></path>
          </svg>
        </button>
      )}

      {/* MODAL FORMULARIO (Crear / Editar) */}
      {isModalOpen && (
        <div 
          className={`fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 ${isClosingModal ? 'animate-fadeOut' : 'animate-fadeIn'}`} 
          onClick={closeModal}
        >
          <div 
            className={`bg-white rounded-xl shadow-2xl w-full max-w-2xl p-7 ${isClosingModal ? 'animate-scaleDown' : 'animate-scaleUp'}`}
            onClick={e => e.stopPropagation()}
          >
            <h2 className="text-lg font-black text-slate-900 mb-5 uppercase tracking-wide border-b border-gray-100 pb-3">
              {editingId ? 'Editar Trabajo Kanban' : 'Nuevo Trabajo Kanban'}
            </h2>
            
            <form onSubmit={handleSubmitForm} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">Título / Pieza:</label>
                  <input type="text" value={partName} onChange={e => setPartName(e.target.value)} className="w-full border border-gray-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-slate-800 focus:outline-none transition" required />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">Cliente:</label>
                  <input type="text" value={client} onChange={e => setClient(e.target.value)} className="w-full border border-gray-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-slate-800 focus:outline-none transition" required />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">Tipo de Material:</label>
                  <input type="text" placeholder="Ej. Acero 1045, Aluminio 6061" value={materialType} onChange={e => setMaterialType(e.target.value)} className="w-full border border-gray-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-slate-800 focus:outline-none transition" required />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">Cantidad de Piezas:</label>
                  <input type="number" min="1" value={quantity} onChange={e => setQuantity(Number(e.target.value))} className="w-full border border-gray-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-slate-800 focus:outline-none transition" required />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">Teléfono de Contacto:</label>
                  <input type="tel" placeholder="Ej. 4421234567" value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} className="w-full border border-gray-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-slate-800 focus:outline-none transition" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">Correo Electrónico:</label>
                  <input type="email" placeholder="cliente@correo.com" value={customerEmail} onChange={e => setCustomerEmail(e.target.value)} className="w-full border border-gray-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-slate-800 focus:outline-none transition" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Descripción / Notas de Maquinado:</label>
                <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} className="w-full border border-gray-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-slate-800 focus:outline-none transition" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">Fecha de Entrega:</label>
                  <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className="w-full border border-gray-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-slate-800 focus:outline-none transition" required />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">Prioridad:</label>
                  <select value={priority} onChange={e => setPriority(e.target.value as Priority)} className="w-full border border-gray-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-slate-800 focus:outline-none transition bg-white">
                    <option value="Baja">Baja</option>
                    <option value="Media">Media</option>
                    <option value="Alta">Alta</option>
                    <option value="Critica">Crítica</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Operadores Asignados (Ctrl+Clic para varios):</label>
                <select multiple value={assignedOperators} onChange={handleOperatorSelection} className="w-full border border-gray-300 rounded-lg p-2 h-20 text-sm focus:ring-2 focus:ring-slate-800 focus:outline-none transition">
                  {dbOperators.map(op => (
                    <option key={op} value={op}>{op}</option>
                  ))}
                </select>
              </div>

              <div className="flex justify-end gap-3 pt-4 mt-2 border-t border-gray-100">
                <button type="button" onClick={closeModal} className="px-5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-lg transition cursor-pointer">
                  Cancelar
                </button>
                <button type="submit" className="px-6 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-lg shadow transition cursor-pointer">
                  {editingId ? 'Actualizar Trabajo' : 'Guardar Trabajo'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL DE CONFIRMACIÓN DE ELIMINACIÓN */}
      {isDeleteModalOpen && (
        <div 
          className={`fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 ${isClosingDelete ? 'animate-fadeOut' : 'animate-fadeIn'}`} 
          onClick={closeDeleteModal}
        >
          <div 
            className={`bg-white rounded-xl shadow-2xl w-full max-w-md p-7 text-center overflow-hidden ${isClosingDelete ? 'animate-scaleDown' : 'animate-scaleUp'}`}
            onClick={e => e.stopPropagation()}
          >
            <h3 className="text-lg font-black text-slate-900 mb-2">¿Eliminar Trabajo?</h3>
            <p className="text-sm text-slate-600 mb-6 font-medium leading-relaxed px-2">
              Estás a punto de eliminar el trabajo <span className="font-bold text-slate-900 break-all">"{selectedOrder?.partName}"</span>. Esta acción no se puede deshacer.
            </p>
            
            <div className="flex justify-center gap-3">
              <button 
                type="button" 
                onClick={closeDeleteModal} 
                className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg transition cursor-pointer text-xs"
              >
                Cancelar
              </button>
              <button 
                type="button" 
                onClick={async () => {
                  await confirmDelete();
                }} 
                className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg shadow transition cursor-pointer text-xs"
              >
                Sí, Eliminar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE ÉXITO */}
      {isSuccessModalOpen && (
        <div 
          className={`fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 ${isClosingSuccess ? 'animate-fadeOut' : 'animate-fadeIn'}`} 
          onClick={closeSuccessModal}
        >
          <div 
            className={`bg-white rounded-xl shadow-2xl w-full max-w-md p-7 text-center overflow-hidden ${isClosingSuccess ? 'animate-scaleDown' : 'animate-scaleUp'}`}
            onClick={e => e.stopPropagation()}
          >
            <h3 className="text-lg font-black text-slate-900 mb-2">Operación Exitosa</h3>
            <p className="text-sm text-slate-600 mb-6 font-medium leading-relaxed">
              {successMessage}
            </p>
            
            <button 
              type="button" 
              onClick={closeSuccessModal} 
              className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-lg shadow transition cursor-pointer text-xs"
            >
              Aceptar
            </button>
          </div>
        </div>
      )}

      {/* MODAL DE TERMINAR TRABAJO + DESGASTE DE HERRAMIENTAS */}
      {isFinishModalOpen && (
        <div 
          className={`fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 ${isClosingFinish ? 'animate-fadeOut' : 'animate-fadeIn'}`} 
          onClick={closeFinishModal}
        >
          <div 
            className={`bg-white rounded-xl shadow-2xl w-full max-w-lg p-7 text-center overflow-hidden ${isClosingFinish ? 'animate-scaleDown' : 'animate-scaleUp'}`}
            onClick={e => e.stopPropagation()}
          >
            <h3 className="text-lg font-black text-slate-900 mb-2">Confirmar Finalización de Trabajo</h3>
            <p className="text-sm text-slate-600 mb-5 font-medium leading-relaxed px-2">
              Estás a punto de marcar <span className="font-bold text-slate-900 break-all">"{selectedOrder?.partName}"</span> como terminado. Pasará directamente al historial general.
            </p>

            <div className="bg-slate-50 border border-gray-200 rounded-lg p-4 mb-6 text-left">
              <div className="flex justify-between items-center mb-2">
                <div>
                  <span className="block text-xs font-black text-slate-800 uppercase tracking-wide">
                    Desgaste de Herramientas (Opcional)
                  </span>
                  <span className="text-[11px] text-slate-500">
                    Resta porcentaje de vida útil a los cortadores o insertos usados.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleAddToolWearRow}
                  className="px-2.5 py-1 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded transition cursor-pointer shrink-0"
                >
                  + Herramienta
                </button>
              </div>

              {toolWearEntries.length === 0 ? (
                <p className="text-xs text-slate-400 italic py-2">
                  Sin desgaste registrado para esta orden.
                </p>
              ) : (
                <div className="space-y-2 mt-3 max-h-40 overflow-y-auto pr-1">
                  {toolWearEntries.map((entry, idx) => {
                    const toolObj = availableTools.find(t => t.id === entry.toolId);
                    const currentLife = toolObj?.lifePercentage ?? 100;
                    const projectedLife = Math.max(0, currentLife - entry.wearPercent);

                    return (
                      <div key={idx} className="flex items-center gap-2 bg-white border border-gray-200 p-2 rounded">
                        <select
                          value={entry.toolId}
                          onChange={e => handleUpdateToolWearRow(idx, 'toolId', e.target.value)}
                          className="flex-1 min-w-0 border border-gray-300 rounded px-2 py-1 text-xs font-semibold text-slate-800 bg-slate-50 outline-none"
                        >
                          {availableTools.map(t => (
                            <option key={t.id} value={t.id}>
                              {t.code} - {t.description} (Vida: {t.lifePercentage ?? 100}%)
                            </option>
                          ))}
                        </select>

                        <div className="flex items-center gap-1 shrink-0" title={`Quedará en ${projectedLife}%`}>
                          <span className="text-[11px] font-bold text-red-600">-</span>
                          <input
                            type="number"
                            min="1"
                            max="100"
                            value={entry.wearPercent}
                            onChange={e => handleUpdateToolWearRow(idx, 'wearPercent', e.target.value)}
                            className="w-14 border border-gray-300 rounded px-1.5 py-1 text-xs font-black text-center text-slate-800"
                          />
                          <span className="text-[11px] font-bold text-slate-500">%</span>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleRemoveToolWearRow(idx)}
                          className="px-2 py-1 rounded bg-red-50 hover:bg-red-100 text-red-600 font-bold text-xs cursor-pointer shrink-0"
                          title="Quitar"
                        >
                          Quitar
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            
            <div className="flex justify-center gap-3">
              <button 
                type="button" 
                onClick={closeFinishModal} 
                className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg transition cursor-pointer text-xs"
              >
                Cancelar
              </button>
              <button 
                type="button" 
                onClick={confirmFinishOrder} 
                className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg shadow transition cursor-pointer text-xs"
              >
                Sí, Terminar
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};