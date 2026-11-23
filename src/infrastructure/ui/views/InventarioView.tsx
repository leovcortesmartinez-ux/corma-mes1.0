import { useState, useEffect, useRef } from 'react';
import { InventoryItem, type ItemCategory } from '../../../domain/entities/InventoryItem';
import { ActiveLoan } from '../../../domain/entities/ActiveLoan';
import { FirestoreInventoryRepository } from '../../../adapters/repositories/FirestoreInventoryRepository';
import { FirestoreLoanRepository } from '../../../adapters/repositories/FirestoreLoanRepository';
import { FirestoreUserRepository } from '../../../adapters/repositories/FirestoreUserRepository';
import { logSystemEvent } from '../../services/systemLogger';

const inventoryRepository = new FirestoreInventoryRepository();
const loanRepository = new FirestoreLoanRepository();
const userRepository = new FirestoreUserRepository();

interface InventarioViewProps {
  onAlertsLoaded?: (count: number) => void;
  userName?: string;
}

const generateNextCode = (category: ItemCategory, currentInventory: InventoryItem[]) => {
  const prefix = category === 'Herramientas' ? 'h-' : category === 'Materiales' ? 'm-' : 'MAQ-';
  const categoryItems = currentInventory.filter(item => item.category === category);
  
  let maxNumber = 0;
  categoryItems.forEach(item => {
    const match = item.code.match(/\d+$/);
    if (match) {
      const num = parseInt(match[0], 10);
      if (num > maxNumber) maxNumber = num;
    }
  });
  
  return `${prefix}${(maxNumber + 1).toString().padStart(3, '0')}`;
};

export const InventarioView = ({ onAlertsLoaded, userName = '' }: InventarioViewProps) => {
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [loans, setLoans] = useState<ActiveLoan[]>([]);
  const [loanLifeMap, setLoanLifeMap] = useState<Record<string, number>>({});
  const [operators, setOperators] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState('Todos');
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [selectedLoanId, setSelectedLoanId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [loanContextMenu, setLoanContextMenu] = useState<{ x: number; y: number } | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isLoanModalOpen, setIsLoanModalOpen] = useState(false);
  const [isConsumeModalOpen, setIsConsumeModalOpen] = useState(false);
  const [isReturnModalOpen, setIsReturnModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

  const [toast, setToast] = useState<{ message: string; type: 'error' | 'success' } | null>(null);

  const showToast = (message: string, type: 'error' | 'success' = 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  const [formCategory, setFormCategory] = useState<ItemCategory>('Herramientas');
  const [formCode, setFormCode] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formQuantity, setFormQuantity] = useState(1);
  const [formUnit, setFormUnit] = useState('pza');
  const [formMinStock, setFormMinStock] = useState(1);
  const [formUnitLives, setFormUnitLives] = useState<number[]>([100]);
  const [formMachineStatus, setFormMachineStatus] = useState<'OPERATIVA' | 'PARADA'>('OPERATIVA');

  const [loanOperator, setLoanOperator] = useState('');
  const [selectedUnitIndex, setSelectedUnitIndex] = useState<number>(0);
  const [loanNotes, setLoanNotes] = useState('');
  const [consumeOperator, setConsumeOperator] = useState('');
  const [consumeQuantity, setConsumeQuantity] = useState(1);
  const [consumeProject, setConsumeProject] = useState('');
  const [returnStatus, setReturnStatus] = useState<'ok' | 'rota'>('ok');
  const [returnWear, setReturnWear] = useState<number>(1);
  const [returnComments, setReturnComments] = useState('');

  const selectedItem = inventory.find(item => item.id === selectedItemId);
  const selectedLoan = loans.find(loan => loan.id === selectedLoanId);

  const alertCount = inventory.filter(item => 
    (item.category !== 'Máquinas' && item.quantity <= item.minStock) || 
    (item.category === 'Herramientas' && item.unitLives.some(v => v <= 20)) ||
    (item.category === 'Máquinas' && item.status === 'PARADA')
  ).length;

  useEffect(() => {
    if (onAlertsLoaded) {
      onAlertsLoaded(alertCount);
    }
  }, [alertCount, onAlertsLoaded]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [inventoryData, loansResult, usersData] = await Promise.all([
        inventoryRepository.getAll(),
        loanRepository.getAllWithLife(),
        userRepository.getAll()
      ]);

      setInventory(inventoryData);
      setLoans(loansResult.loans);
      setLoanLifeMap(loansResult.lifeMap);

      const activeOperators = usersData.filter(u => u.role === 'Operador').map(u => u.name);
      setOperators(activeOperators);

      if (activeOperators.length > 0) {
        setLoanOperator(prev => prev || activeOperators[0]);
        setConsumeOperator(prev => prev || activeOperators[0]);
      }
    } catch (error) {
      console.error("Error al cargar datos:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    const handleGlobalClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('tr')) return;
      if (
        target.closest('button') ||
        target.closest('input') ||
        target.closest('select') ||
        target.closest('.fixed')
      ) {
        return;
      }
      setSelectedItemId(null);
      setSelectedLoanId(null);
      setContextMenu(null);
      setLoanContextMenu(null);
    };

    window.addEventListener('click', handleGlobalClick);
    return () => window.removeEventListener('click', handleGlobalClick);
  }, []);

  useEffect(() => {
    if (isAddModalOpen) {
      const nextCode = generateNextCode(formCategory, inventory);
      setFormCode(nextCode);
    }
  }, [formCategory, isAddModalOpen, inventory]);

  const handleQuantityChange = (newQtyRaw: number) => {
    const safeQty = Math.max(0, Math.floor(newQtyRaw) || 0);
    setFormQuantity(safeQty);
    if (formCategory === 'Herramientas') {
      setFormUnitLives(prev => {
        if (safeQty === prev.length) return prev;
        if (safeQty > prev.length) {
          return [...prev, ...Array.from({ length: safeQty - prev.length }, () => 100)];
        }
        return prev.slice(0, safeQty);
      });
    }
  };

  const handleContextMenu = (e: React.MouseEvent, itemId?: string) => {
    e.preventDefault();
    e.stopPropagation();
    setSelectedItemId(itemId || null);
    setSelectedLoanId(null);
    setContextMenu({ x: e.clientX, y: e.clientY });
  };

  const handleLoanContextMenu = (e: React.MouseEvent, loanId?: string) => {
    e.preventDefault();
    e.stopPropagation();
    setSelectedLoanId(loanId || null);
    setSelectedItemId(null);
    setContextMenu(null);
    
    if (loanId) {
      setLoanContextMenu({ x: e.clientX, y: e.clientY });
    } else {
      setLoanContextMenu(null);
    }
  };

  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const initialUnitLives =
        formCategory === 'Herramientas'
          ? Array.from({ length: Math.max(0, formQuantity) }, () => 100)
          : undefined;

      const newId = `INV-${Math.floor(Math.random() * 100000)}`;
      const newItem = new InventoryItem(
        newId,
        formCategory,
        formCode,
        formDesc,
        formQuantity,
        formUnit,
        formCategory === 'Máquinas' ? formMachineStatus : 'OK',
        formMinStock,
        100,
        initialUnitLives
      );
      await inventoryRepository.save(newItem);

      const extraInfo = formCategory === 'Máquinas'
        ? `Estado: ${formMachineStatus}`
        : formCategory === 'Herramientas'
        ? `Cantidad: ${formQuantity} ${formUnit} | Vida útil: 100% c/u`
        : `Cantidad: ${formQuantity} ${formUnit}`;

      await logSystemEvent(
        'INVENTARIO',
        'NUEVO REGISTRO',
        userName,
        `Se registró en ${formCategory}: ${formCode} - ${formDesc} (${extraInfo})`
      );

      setIsAddModalOpen(false);
      resetForm();
      loadData();
      showToast('Registro creado exitosamente.', 'success');
    } catch (error: any) { showToast(`Error al registrar: ${error.message}`, 'error'); }
  };

  const handleOpenEdit = () => {
    if (!selectedItem) return;
    setFormCategory(selectedItem.category);
    setFormCode(selectedItem.code);
    setFormDesc(selectedItem.description);
    setFormQuantity(selectedItem.quantity);
    setFormUnit(selectedItem.unit);
    setFormMinStock(selectedItem.minStock);
    setFormUnitLives(
      selectedItem.category === 'Herramientas'
        ? [...selectedItem.unitLives]
        : [100]
    );
    if (selectedItem.category === 'Máquinas') {
      setFormMachineStatus(selectedItem.status as 'OPERATIVA' | 'PARADA');
    }
    setIsEditModalOpen(true);
  };

  const handleUpdateItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItem) return;
    try {
      const cleanedUnitLives =
        formCategory === 'Herramientas'
          ? formUnitLives
              .slice(0, formQuantity)
              .map(v => Math.max(1, Math.min(100, Math.round(Number(v) || 1))))
          : undefined;

      const updatedItem = new InventoryItem(
        selectedItem.id,
        formCategory,
        formCode,
        formDesc,
        formQuantity,
        formUnit,
        formCategory === 'Máquinas' ? formMachineStatus : 'OK',
        formMinStock,
        cleanedUnitLives && cleanedUnitLives.length > 0 ? Math.max(...cleanedUnitLives) : 100,
        cleanedUnitLives
      );
      await inventoryRepository.save(updatedItem);

      const extraInfo = formCategory === 'Máquinas'
        ? `Estado: ${formMachineStatus}`
        : formCategory === 'Herramientas'
        ? `Stock: ${updatedItem.quantity} ${formUnit} | Vidas: [${updatedItem.unitLives.map(v => `${v}%`).join(', ')}]`
        : `Stock: ${formQuantity} ${formUnit}`;

      await logSystemEvent(
        'INVENTARIO',
        'EDITAR REGISTRO',
        userName,
        `Se actualizó ${formCategory}: ${formCode} - ${formDesc} (${extraInfo})`
      );

      setIsEditModalOpen(false);
      resetForm();
      loadData();
      showToast('Registro actualizado exitosamente.', 'success');
    } catch (error: any) { showToast(`Error al actualizar: ${error.message}`, 'error'); }
  };

  const handleConfirmDelete = async () => {
    if (!selectedItem) return;
    try {
      const deletedCode = selectedItem.code;
      const deletedDesc = selectedItem.description;
      const deletedCategory = selectedItem.category;

      await inventoryRepository.delete(selectedItem.id);
      await logSystemEvent(
        'INVENTARIO',
        'ELIMINAR REGISTRO',
        userName,
        `Se eliminó de ${deletedCategory}: ${deletedCode} - ${deletedDesc}`
      );

      setIsDeleteModalOpen(false);
      setSelectedItemId(null);
      loadData();
      showToast('Registro eliminado.', 'success');
    } catch (error: any) { showToast(`Error al eliminar: ${error.message}`, 'error'); }
  };

  const resetForm = () => {
    setFormCategory('Herramientas');
    setFormDesc(''); setFormQuantity(1); setFormUnit('pza'); setFormMinStock(1);
    setFormUnitLives([100]);
    setFormMachineStatus('OPERATIVA');
  };

  const handleOpenLoan = () => {
    if (!selectedItem) { showToast('Selecciona una herramienta.', 'error'); return; }
    if (selectedItem.category !== 'Herramientas') { showToast('Solo las herramientas se pueden prestar.', 'error'); return; }
    if (selectedItem.quantity <= 0 || selectedItem.unitLives.length === 0) {
      showToast('No hay unidades disponibles en stock.', 'error');
      return;
    }
    setSelectedUnitIndex(0);
    setLoanNotes('');
    setIsLoanModalOpen(true);
  };

  const handleConfirmLoan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItem) return;
    try {
      const loanedLife = selectedItem.checkoutUnit(selectedUnitIndex);
      const loanId = `loan-${Date.now()}`;
      const newLoan = new ActiveLoan(
        loanId,
        selectedItem.code,
        selectedItem.description,
        loanOperator,
        1,
        loanNotes
      );

      await loanRepository.save(newLoan, loanedLife);
      await inventoryRepository.save(selectedItem);

      await logSystemEvent(
        'HERRAMIENTAS',
        'CHECK-OUT',
        loanOperator || userName,
        `${selectedItem.code} - ${selectedItem.description.toLowerCase()} | Vida entregada: ${loanedLife}%${loanNotes ? ` | Notas: ${loanNotes}` : ''}`
      );

      setIsLoanModalOpen(false);
      loadData();
      showToast(`Préstamo registrado (Unidad con ${loanedLife}% de vida).`, 'success');
    } catch (error: any) { showToast(`Error: ${error.message}`, 'error'); }
  };

  const handleOpenConsume = () => {
    if (!selectedItem) { showToast('Selecciona un material.', 'error'); return; }
    if (selectedItem.category !== 'Materiales') { showToast('Solo los materiales se pueden consumir.', 'error'); return; }
    if (selectedItem.quantity <= 0) { showToast('No hay stock disponible.', 'error'); return; }
    setConsumeQuantity(1); setConsumeProject(''); setIsConsumeModalOpen(true);
  };

  const handleConfirmConsume = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItem) return;
    if (consumeQuantity > selectedItem.quantity) { showToast('La cantidad excede el stock actual.', 'error'); return; }
    try {
      selectedItem.quantity -= consumeQuantity;
      await inventoryRepository.save(selectedItem);

      await logSystemEvent(
        'INVENTARIO',
        'CONSUMO MATERIAL',
        userName || consumeOperator,
        `${consumeOperator} consumió ${consumeQuantity} de ${selectedItem.description.toLowerCase()} (${selectedItem.code})${consumeProject ? ` | O.T.: ${consumeProject}` : ''}.`
      );

      setIsConsumeModalOpen(false);
      loadData();
      showToast('Consumo registrado.', 'success');
    } catch (error: any) { showToast(`Error: ${error.message}`, 'error'); }
  };

  const handleOpenReturn = () => {
    if (loans.length === 0) { showToast('No hay préstamos activos.', 'error'); return; }
    if (!selectedLoanId) {
      setSelectedLoanId(loans[0].id);
    }
    setReturnStatus('ok');
    setReturnWear(1);
    setReturnComments('');
    setIsReturnModalOpen(true);
  };

  const handleConfirmReturn = async (e: React.FormEvent) => {
    e.preventDefault();
    const loanToReturn = loans.find(l => l.id === selectedLoanId);
    if (!loanToReturn) return;
    try {
      const originalItem = inventory.find(item => item.code.toLowerCase() === loanToReturn.code.toLowerCase());
      const previousUnitLife = loanLifeMap[loanToReturn.id] ?? 100;
      const clampedWear = Math.max(0, Math.min(100, Number(returnWear) || 0));
      let wearLogText = '';
      let wasDiscarded = false;

      if (originalItem) {
        const result = originalItem.checkinUnit(
          previousUnitLife,
          clampedWear,
          returnStatus === 'rota'
        );
        wasDiscarded = result.discarded;
        await inventoryRepository.save(originalItem);

        if (result.discarded) {
          wearLogText =
            returnStatus === 'rota'
              ? ' | Unidad rota (0% vida): dada de baja del stock'
              : ` | Desgaste: -${clampedWear}% (0% vida): unidad dada de baja del stock`;
        } else {
          wearLogText = ` | Desgaste: -${clampedWear}% (Reingresa con ${result.remainingLife}% de vida)`;
        }
      }

      await loanRepository.delete(loanToReturn.id);

      await logSystemEvent(
        'HERRAMIENTAS',
        'CHECK-IN',
        loanToReturn.operator || userName,
        `${loanToReturn.code} - ${loanToReturn.toolName.toLowerCase()} | Estado: ${returnStatus}${wearLogText}${returnComments ? ` | Notas: ${returnComments}` : ''}`
      );

      setIsReturnModalOpen(false);
      setSelectedLoanId(null);
      loadData();
      showToast(
        wasDiscarded
          ? 'Devolución registrada: la unidad llegó a 0% y se descontó del stock.'
          : 'Devolución completada y stock actualizado.',
        'success'
      );
    } catch (error: any) { showToast(`Error: ${error.message}`, 'error'); }
  };

  const filteredInventory = inventory
    .filter(item => {
      const matchesSearch = item.description.toLowerCase().includes(searchTerm.toLowerCase()) || item.code.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCategory = filterCategory === 'Todos' || item.category === filterCategory;
      return matchesSearch && matchesCategory;
    })
    .sort((a, b) => {
      if (a.category < b.category) return -1;
      if (a.category > b.category) return 1;
      return a.code.localeCompare(b.code, undefined, { numeric: true, sensitivity: 'base' });
    });

  return (
    <div ref={containerRef} className="flex flex-col h-[calc(100vh-100px)] max-h-[calc(100vh-100px)] gap-3 relative select-none overflow-hidden pb-1">
      
      {/* NOTIFICACIÓN TOAST */}
      {toast && (
        <div className={`fixed top-6 left-1/2 transform -translate-x-1/2 z-[100] px-5 py-3 rounded-lg shadow-xl font-bold flex items-center gap-2.5 animate-fadeIn transition-all duration-300 border ${
          toast.type === 'error' ? 'bg-red-50 text-red-700 border-red-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'
        }`}>
          <span className="text-sm">{toast.message}</span>
        </div>
      )}

      {/* BARRA SUPERIOR DE CONTROLES */}
      <div className="bg-white p-3 rounded-lg shadow-2xs border border-gray-200 flex flex-wrap justify-between items-center gap-4 shrink-0">
        <div className="flex items-center gap-4 flex-1 min-w-[300px]">
          <div className="flex items-center gap-2 flex-1 max-w-md">
            <label className="text-xs font-bold text-slate-700 uppercase">Buscar:</label>
            <input type="text" placeholder="Código o descripción" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="flex-1 border border-gray-300 rounded-md p-2 focus:ring-2 focus:ring-slate-800 focus:outline-none transition text-xs bg-white" />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs font-bold text-slate-700 uppercase">Categoría:</label>
            <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)} className="border border-gray-300 rounded-md p-2 focus:ring-2 focus:ring-slate-800 focus:outline-none transition text-xs font-semibold text-slate-700 bg-white">
              <option value="Todos">Todos</option>
              <option value="Herramientas">Herramientas</option>
              <option value="Materiales">Materiales</option>
              <option value="Máquinas">Máquinas</option>
            </select>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button onClick={handleOpenEdit} disabled={!selectedItem} className={`px-3.5 py-1.5 rounded text-xs font-bold transition ${selectedItem ? 'bg-slate-600 hover:bg-slate-700 text-white cursor-pointer' : 'bg-gray-100 text-gray-400 cursor-not-allowed'}`}>
            Editar
          </button>
          <button onClick={() => setIsDeleteModalOpen(true)} disabled={!selectedItem} className={`px-3.5 py-1.5 rounded text-xs font-bold transition ${selectedItem ? 'bg-red-600 hover:bg-red-700 text-white cursor-pointer' : 'bg-gray-100 text-gray-400 cursor-not-allowed'}`}>
            Eliminar
          </button>

          <div className="h-5 w-px bg-gray-200 mx-1"></div>
          
          <button 
            onClick={handleOpenLoan} 
            disabled={selectedItem?.category !== 'Herramientas'} 
            className={`px-3.5 py-1.5 rounded text-xs font-bold transition ${selectedItem?.category === 'Herramientas' ? 'bg-slate-900 hover:bg-slate-800 text-white cursor-pointer' : 'bg-gray-100 text-gray-400 cursor-not-allowed'}`}
          >
            Prestar
          </button>
          
          <button 
            onClick={handleOpenConsume} 
            disabled={selectedItem?.category !== 'Materiales'} 
            className={`px-3.5 py-1.5 rounded text-xs font-bold transition ${selectedItem?.category === 'Materiales' ? 'bg-orange-600 hover:bg-orange-700 text-white cursor-pointer' : 'bg-gray-100 text-gray-400 cursor-not-allowed'}`}
          >
            Consumir
          </button>
        </div>
      </div>

      {/* TABLA PRINCIPAL DE INVENTARIO */}
      <div className="bg-white rounded-lg shadow-2xs border border-gray-200 flex-[3] min-h-0 flex flex-col overflow-hidden">
        <div className="p-2.5 border-b border-gray-200 bg-slate-50 flex justify-between items-center shrink-0 min-h-[42px]">
          <div className="flex items-center gap-3 w-full">
            <h2 className="text-xs font-black text-slate-800 uppercase tracking-wider whitespace-nowrap">
              Vista General de Inventario
            </h2>
            {alertCount > 0 && (
              <span className="bg-red-600 text-white text-[11px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap">
                {alertCount} {alertCount === 1 ? 'alerta' : 'alertas'}
              </span>
            )}
          </div>
          {isLoading && <span className="text-xs text-slate-600 font-bold whitespace-nowrap">Cargando...</span>}
        </div>
        
        <div className="flex-1 overflow-auto min-h-0" onContextMenu={(e) => handleContextMenu(e)}>
          <table className="w-full text-left border-collapse table-fixed">
            <thead className="bg-slate-100 sticky top-0 z-10 border-b border-gray-200">
              <tr>
                <th className="p-2.5 text-[11px] font-black text-slate-600 uppercase w-[13%]">Código / Ref</th>
                <th className="p-2.5 text-[11px] font-black text-slate-600 uppercase w-[30%]">Descripción</th>
                <th className="p-2.5 text-[11px] font-black text-slate-600 uppercase w-[13%]">Categoría</th>
                <th className="p-2.5 text-[11px] font-black text-slate-600 uppercase w-[14%]">Cantidad / Estado</th>
                <th className="p-2.5 text-[11px] font-black text-slate-600 uppercase w-[30%]">Detalle Extra / Vida Útil</th>
              </tr>
            </thead>
            <tbody>
              {filteredInventory.length === 0 && !isLoading ? (
                <tr><td colSpan={5} className="p-6 text-center text-slate-400 text-xs font-medium">No se encontraron registros.</td></tr>
              ) : (
                filteredInventory.map((item) => {
                  const units = item.unitLives ?? [];
                  const isLowStock = item.category !== 'Máquinas' && item.quantity <= item.minStock;
                  const isLowLife = item.category === 'Herramientas' && units.some(v => v <= 20);
                  const isMachineStopped = item.category === 'Máquinas' && item.status === 'PARADA';
                  const hasAlert = isLowStock || isLowLife || isMachineStopped;

                  let rowClass = "border-b cursor-pointer transition-colors ";
                  if (selectedItemId === item.id) rowClass += "bg-slate-100 border-gray-200 border-l-4 border-l-slate-900";
                  else if (hasAlert) rowClass += "bg-red-50/70 hover:bg-red-50 border-red-100 border-l-4 border-l-red-600";
                  else rowClass += "hover:bg-slate-50 border-gray-100 border-l-4 border-l-transparent";

                  return (
                    <tr 
                      key={item.id} 
                      onClick={() => { 
                        setSelectedItemId(item.id); 
                        setSelectedLoanId(null);
                        setContextMenu(null); 
                      }}
                      onContextMenu={(e) => handleContextMenu(e, item.id)}
                      className={rowClass}
                    >
                      <td className="p-2.5 text-xs font-bold text-slate-900 truncate" title={item.code}>{item.code}</td>
                      <td className="p-2.5 text-xs text-slate-700 uppercase font-medium truncate" title={item.description}>{item.description}</td>
                      <td className="p-2.5 text-xs text-slate-600 truncate">{item.category}</td>
                      <td className={`p-2.5 text-xs font-bold truncate ${hasAlert ? 'text-red-700' : 'text-slate-800'}`}>{item.displayQuantity}</td>
                      <td className="p-2.5 text-xs text-slate-500">
                        <div className="flex items-center gap-2 flex-wrap">
                          {item.category !== 'Máquinas' && (
                            <span className="text-[11px] font-medium text-slate-500">Mín: {item.minStock}</span>
                          )}

                          {item.category === 'Herramientas' && (() => {
                            if (units.length === 0) {
                              return <span className="text-[11px] font-black text-red-600">Sin stock (0%)</span>;
                            }
                            const avgLife = Math.round(
                              units.reduce((acc, val) => acc + val, 0) / units.length
                            );
                            const avgBarColor =
                              avgLife > 50 ? 'bg-emerald-600' : avgLife > 20 ? 'bg-amber-500' : 'bg-red-600';

                            return (
                              <div
                                className="flex items-center gap-1.5"
                                title={`Promedio de ${units.length} ${units.length === 1 ? 'unidad' : 'unidades'}: ${avgLife}%`}
                              >
                                <div className="w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                                  <div
                                    className={`h-full transition-all duration-300 ${avgBarColor}`}
                                    style={{ width: `${avgLife}%` }}
                                  />
                                </div>
                                <span
                                  className={`text-[11px] font-black ${
                                    avgLife <= 20 ? 'text-red-600' : 'text-slate-700'
                                  }`}
                                >
                                  {avgLife}%
                                </span>
                              </div>
                            );
                          })()}

                          {hasAlert && (
                            <span className="inline-flex items-center text-[10px] font-black text-red-700 bg-red-100 px-2 py-0.5 rounded border border-red-200 uppercase">
                              {isMachineStopped
                                ? 'MÁQUINA PARADA'
                                : isLowLife
                                ? 'VIDA CRÍTICA'
                                : 'BAJO STOCK'}
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MENÚ CONTEXTUAL INVENTARIO */}
      {contextMenu && (
        <div className="fixed bg-white border border-gray-200 shadow-xl rounded-md py-1 z-50 w-56 animate-fadeIn" style={{ top: contextMenu.y, left: contextMenu.x }} onClick={(e) => e.stopPropagation()}>
          <button className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-100 transition cursor-pointer" onClick={() => { setContextMenu(null); resetForm(); setIsAddModalOpen(true); }}>Nuevo Registro</button>
          
          {selectedItem && (
            <>
              <button className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-100 transition cursor-pointer" onClick={() => { setContextMenu(null); handleOpenEdit(); }}>Editar Artículo</button>
              <div className="h-px bg-gray-100 my-1 mx-2"></div>
              
              {selectedItem.category === 'Herramientas' && (
                <button className="w-full text-left px-4 py-2 text-sm text-slate-800 font-semibold hover:bg-slate-100 transition cursor-pointer" onClick={() => { setContextMenu(null); handleOpenLoan(); }}>Prestar Herramienta</button>
              )}
              
              {selectedItem.category === 'Materiales' && (
                <button className="w-full text-left px-4 py-2 text-sm text-orange-700 font-semibold hover:bg-orange-50 transition cursor-pointer" onClick={() => { setContextMenu(null); handleOpenConsume(); }}>Consumir Material</button>
              )}
              
              <div className="h-px bg-gray-100 my-1 mx-2"></div>
              <button className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 font-bold transition cursor-pointer" onClick={() => { setContextMenu(null); setIsDeleteModalOpen(true); }}>Eliminar Registro</button>
            </>
          )}
        </div>
      )}

      {/* MENÚ CONTEXTUAL PRÉSTAMOS */}
      {loanContextMenu && selectedLoanId && (
        <div className="fixed bg-white border border-gray-200 shadow-xl rounded-md py-1 z-50 w-56 animate-fadeIn" style={{ top: loanContextMenu.y, left: loanContextMenu.x }} onClick={(e) => e.stopPropagation()}>
          <button 
            className="w-full text-left px-4 py-2 text-sm text-emerald-700 hover:bg-emerald-50 font-bold transition cursor-pointer" 
            onClick={() => { 
              setLoanContextMenu(null); 
              handleOpenReturn(); 
            }}
          >
            Devolver Herramienta
          </button>
        </div>
      )}

      {/* SECCIÓN PRÉSTAMOS ACTIVOS */}
      <div className="bg-white rounded-lg shadow-2xs border border-gray-200 flex-[2] min-h-0 flex flex-col overflow-hidden">
        <div className="p-2.5 border-b border-gray-200 bg-slate-50 flex justify-between items-center shrink-0">
          <div className="flex items-center gap-2">
            <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider">
              Préstamos Activos <span className="text-slate-500 font-semibold ml-1">(Total: {loans.length} en piso)</span>
            </h3>
          </div>
          <button 
            onClick={handleOpenReturn} 
            disabled={loans.length === 0 || !selectedLoanId}
            className={`px-3.5 py-1 rounded text-xs font-bold transition ${loans.length > 0 && selectedLoanId ? 'bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer' : 'bg-gray-100 text-gray-400 cursor-not-allowed'}`}
          >
            Devolver
          </button>
        </div>
        <div className="flex-1 overflow-auto min-h-0" onContextMenu={(e) => handleLoanContextMenu(e)}>
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-100 sticky top-0 border-b border-gray-200">
              <tr>
                <th className="p-2 px-4 text-[11px] font-black text-slate-600 uppercase">Código</th>
                <th className="p-2 px-4 text-[11px] font-black text-slate-600 uppercase">Descripción</th>
                <th className="p-2 px-4 text-[11px] font-black text-slate-600 uppercase">Operador</th>
                <th className="p-2 px-4 text-[11px] font-black text-slate-600 uppercase">Vida al Salir</th>
                <th className="p-2 px-4 text-[11px] font-black text-slate-600 uppercase text-right">Cantidad</th>
              </tr>
            </thead>
            <tbody>
              {loans.length === 0 ? (
                <tr><td colSpan={5} className="p-4 text-center text-slate-400 text-xs font-medium">No hay herramientas prestadas.</td></tr>
              ) : (
                loans.map(loan => {
                  const isLoanSelected = selectedLoanId === loan.id;
                  const outLife = loanLifeMap[loan.id] ?? 100;
                  let loanRowClass = "border-b border-gray-100 cursor-pointer transition-colors ";
                  if (isLoanSelected) loanRowClass += "bg-slate-100 border-l-4 border-l-slate-900";
                  else loanRowClass += "hover:bg-slate-50 border-l-4 border-l-transparent";

                  return (
                    <tr 
                      key={loan.id} 
                      onClick={() => {
                        setSelectedLoanId(loan.id);
                        setSelectedItemId(null);
                        setLoanContextMenu(null);
                      }}
                      onContextMenu={(e) => handleLoanContextMenu(e, loan.id)}
                      className={loanRowClass}
                    >
                      <td className="p-2 px-4 text-xs font-bold text-slate-900">{loan.code}</td>
                      <td className="p-2 px-4 text-xs text-slate-700 uppercase">{loan.toolName}</td>
                      <td className="p-2 px-4 text-xs text-slate-800 font-bold">{loan.operator}</td>
                      <td className="p-2 px-4 text-xs font-black text-slate-700">{outLife}%</td>
                      <td className="p-2 px-4 text-xs text-slate-700 font-medium text-right">{loan.quantity}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL: REGISTRO / EDICIÓN */}
      {(isAddModalOpen || isEditModalOpen) && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-fadeIn" onClick={() => { setIsAddModalOpen(false); setIsEditModalOpen(false); }}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden animate-scaleUp" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-gray-100"><h3 className="text-base font-black text-slate-900 uppercase">{isEditModalOpen ? 'Editar Artículo' : 'Registrar en Inventario'}</h3></div>
            <form onSubmit={isEditModalOpen ? handleUpdateItem : handleAddItem} className="p-6 flex flex-col gap-4">
              <div className="flex gap-4">
                <div className="flex-1">
                  <label className="block text-xs font-bold text-slate-700 mb-1">Categoría</label>
                  <select value={formCategory} onChange={e => setFormCategory(e.target.value as ItemCategory)} className="w-full border border-gray-300 rounded-lg p-2.5 text-sm bg-slate-50 outline-none focus:ring-2 focus:ring-slate-800 font-medium">
                    <option value="Herramientas">Herramientas</option><option value="Materiales">Materiales</option><option value="Máquinas">Máquinas</option>
                  </select>
                </div>
                <div className="flex-1">
                  <label className="block text-xs font-bold text-slate-700 mb-1">Código / Ref (Auto)</label>
                  <input type="text" required disabled value={formCode} className="w-full border border-gray-300 rounded-lg p-2.5 text-sm bg-gray-100 text-slate-600 outline-none font-bold cursor-not-allowed" />
                </div>
              </div>
              <div><label className="block text-xs font-bold text-slate-700 mb-1">Descripción</label><input type="text" required value={formDesc} onChange={e => setFormDesc(e.target.value)} className="w-full border border-gray-300 rounded-lg p-2.5 text-sm bg-slate-50 outline-none focus:ring-2 focus:ring-slate-800" /></div>
              
              {formCategory === 'Máquinas' ? (
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Estado de la Máquina</label>
                  <select 
                    value={formMachineStatus} 
                    onChange={e => setFormMachineStatus(e.target.value as 'OPERATIVA' | 'PARADA')} 
                    className="w-full border border-gray-300 rounded-lg p-2.5 text-sm bg-slate-50 outline-none focus:ring-2 focus:ring-slate-800 font-medium"
                  >
                    <option value="OPERATIVA">OPERATIVA</option>
                    <option value="PARADA">PARADA</option>
                  </select>
                </div>
              ) : (
                <>
                  <div className="flex gap-4">
                    <div className="flex-1">
                      <label className="block text-xs font-bold text-slate-700 mb-1">Cantidad</label>
                      <input
                        type="number"
                        required
                        min="0"
                        value={formQuantity}
                        onChange={e => handleQuantityChange(Number(e.target.value))}
                        className="w-full border border-gray-300 rounded-lg p-2.5 text-sm bg-slate-50 outline-none focus:ring-2 focus:ring-slate-800"
                      />
                    </div>
                    <div className="flex-1">
                      <label className="block text-xs font-bold text-slate-700 mb-1">Unidad</label>
                      <input type="text" required value={formUnit} onChange={e => setFormUnit(e.target.value)} className="w-full border border-gray-300 rounded-lg p-2.5 text-sm bg-slate-50 outline-none focus:ring-2 focus:ring-slate-800" />
                    </div>
                    <div className="flex-1">
                      <label className="block text-xs font-bold text-slate-700 mb-1">Mínimo</label>
                      <input type="number" required min="0" value={formMinStock} onChange={e => setFormMinStock(Number(e.target.value))} className="w-full border border-gray-300 rounded-lg p-2.5 text-sm bg-slate-50 outline-none focus:ring-2 focus:ring-slate-800" />
                    </div>
                  </div>

                  {formCategory === 'Herramientas' && (
                    <div className="bg-slate-50 border border-gray-200 rounded-lg p-3">
                      <span className="block text-xs font-bold text-slate-700 mb-1.5">
                        {isAddModalOpen
                          ? `Vida Útil: Cada una de las ${formQuantity} pieza(s) se inicializará al 100%`
                          : 'Vida Útil Individual por Pieza (1% - 100%):'}
                      </span>

                      {isEditModalOpen && formUnitLives.length > 0 && (
                        <div className="grid grid-cols-2 gap-2 max-h-32 overflow-y-auto pr-1 mt-2">
                          {formUnitLives.map((uLife, idx) => (
                            <div key={idx} className="flex items-center justify-between bg-white border border-gray-200 rounded px-2.5 py-1.5">
                              <span className="text-xs font-bold text-slate-600">Pieza #{idx + 1}:</span>
                              <div className="flex items-center gap-1">
                                <input
                                  type="number"
                                  min="1"
                                  max="100"
                                  value={uLife}
                                  onChange={e => {
                                    const val = Math.max(1, Math.min(100, Number(e.target.value) || 1));
                                    setFormUnitLives(prev => prev.map((v, i) => (i === idx ? val : v)));
                                  }}
                                  className="w-16 border border-gray-300 rounded px-1.5 py-0.5 text-xs font-black text-center"
                                />
                                <span className="text-xs font-bold text-slate-500">%</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}

              <div className="flex justify-end gap-3 mt-4 pt-4 border-t border-gray-100">
                <button type="button" onClick={() => { setIsAddModalOpen(false); setIsEditModalOpen(false); }} className="px-4 py-2 bg-slate-100 text-slate-700 font-bold rounded-lg hover:bg-slate-200 transition text-xs cursor-pointer">Cancelar</button>
                <button type="submit" className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-lg transition shadow-xs text-xs cursor-pointer">{isEditModalOpen ? 'Guardar Cambios' : 'Guardar Registro'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL DE ELIMINACIÓN */}
      {isDeleteModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-fadeIn" onClick={() => setIsDeleteModalOpen(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-7 text-center overflow-hidden animate-scaleUp" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-black text-slate-900 mb-2">¿Eliminar Registro?</h3>
            <p className="text-sm text-slate-600 mb-6 font-medium leading-relaxed px-2">
              Estás a punto de eliminar <span className="font-bold text-slate-900 break-all">"{selectedItem?.description}"</span>. Esta acción no se puede deshacer.
            </p>
            
            <div className="flex justify-center gap-3">
              <button type="button" onClick={() => setIsDeleteModalOpen(false)} className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg transition cursor-pointer text-xs">
                Cancelar
              </button>
              <button type="button" onClick={handleConfirmDelete} className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg shadow transition cursor-pointer text-xs">
                Sí, Eliminar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: PRESTAR */}
      {isLoanModalOpen && selectedItem && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-fadeIn" onClick={() => setIsLoanModalOpen(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden animate-scaleUp" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-gray-100"><h3 className="text-base font-black text-slate-900 uppercase">Check-Out de Herramienta</h3></div>
            <form onSubmit={handleConfirmLoan} className="p-6 flex flex-col gap-4">
              <div className="bg-slate-50 border border-gray-200 p-4 rounded-lg">
                <span className="block text-[11px] font-black text-slate-500 uppercase tracking-wide">Recurso:</span>
                <span className="text-sm font-bold text-slate-900 uppercase">{selectedItem.description} ({selectedItem.code})</span>
                <span className="block text-xs font-semibold text-slate-600 mt-1">
                  Unidades disponibles en stock: {selectedItem.unitLives.length}
                </span>
              </div>

              {selectedItem.unitLives.length > 1 && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Seleccionar Unidad a Prestar:</label>
                  <select
                    value={selectedUnitIndex}
                    onChange={e => setSelectedUnitIndex(Number(e.target.value))}
                    className="w-full border border-gray-300 rounded-lg p-2.5 text-sm bg-slate-50 outline-none focus:ring-2 focus:ring-slate-800 font-bold"
                  >
                    {selectedItem.unitLives.map((uLife, idx) => (
                      <option key={idx} value={idx}>
                        Unidad #{idx + 1} — Vida útil: {uLife}%
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Operador Responsable</label>
                <select value={loanOperator} onChange={e => setLoanOperator(e.target.value)} className="w-full border border-gray-300 rounded-lg p-2.5 text-sm bg-slate-50 outline-none focus:ring-2 focus:ring-slate-800 font-medium">
                  {operators.map(op => <option key={op} value={op}>{op}</option>)}
                </select>
              </div>
              <div><label className="block text-xs font-bold text-slate-700 mb-1">Notas / O.T.</label><textarea rows={3} value={loanNotes} onChange={e => setLoanNotes(e.target.value)} className="w-full border border-gray-300 rounded-lg p-2.5 text-sm bg-slate-50 outline-none focus:ring-2 focus:ring-slate-800" /></div>
              <div className="flex justify-end gap-3 mt-4 pt-4 border-t border-gray-100">
                <button type="button" onClick={() => setIsLoanModalOpen(false)} className="px-4 py-2 bg-slate-100 text-slate-700 font-bold rounded-lg hover:bg-slate-200 transition text-xs cursor-pointer">Cancelar</button>
                <button type="submit" className="px-5 py-2 bg-slate-900 text-white font-bold rounded-lg hover:bg-slate-800 transition shadow-xs text-xs cursor-pointer">Registrar Préstamo</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: CONSUMIR */}
      {isConsumeModalOpen && selectedItem && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-fadeIn" onClick={() => setIsConsumeModalOpen(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden animate-scaleUp" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-gray-100"><h3 className="text-base font-black text-slate-900 uppercase">Consumir Material</h3></div>
            <form onSubmit={handleConfirmConsume} className="p-6 flex flex-col gap-4">
              <div className="bg-slate-50 border border-gray-200 p-4 rounded-lg">
                <span className="block text-[11px] font-black text-slate-500 uppercase tracking-wide">Material:</span>
                <span className="text-sm font-bold text-slate-900 uppercase">{selectedItem.description} ({selectedItem.code})</span>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Operador:</label>
                <select value={consumeOperator} onChange={e => setConsumeOperator(e.target.value)} className="w-full border border-gray-300 rounded-lg p-2.5 text-sm bg-slate-50 outline-none focus:ring-2 focus:ring-slate-800 font-medium">
                  {operators.map(op => <option key={op} value={op}>{op}</option>)}
                </select>
              </div>
              <div><label className="block text-xs font-bold text-slate-700 mb-1">Cantidad a descontar:</label><input type="number" min="1" max={selectedItem.quantity} required value={consumeQuantity} onChange={e => setConsumeQuantity(Number(e.target.value))} className="w-full border border-gray-300 rounded-lg p-2.5 text-sm bg-slate-50 outline-none focus:ring-2 focus:ring-slate-800 font-bold" /></div>
              <div><label className="block text-xs font-bold text-slate-700 mb-1">Proyecto / O.T.:</label><input type="text" value={consumeProject} onChange={e => setConsumeProject(e.target.value)} className="w-full border border-gray-300 rounded-lg p-2.5 text-sm bg-slate-50 outline-none focus:ring-2 focus:ring-slate-800" /></div>
              <div className="flex justify-end gap-3 mt-4 pt-4 border-t border-gray-100">
                <button type="button" onClick={() => setIsConsumeModalOpen(false)} className="px-4 py-2 bg-slate-100 text-slate-700 font-bold rounded-lg hover:bg-slate-200 transition text-xs cursor-pointer">Cancelar</button>
                <button type="submit" className="px-5 py-2 bg-orange-600 text-white font-bold rounded-lg hover:bg-orange-700 transition shadow-xs text-xs cursor-pointer">Registrar Consumo</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: DEVOLVER */}
      {isReturnModalOpen && selectedLoan && (() => {
        const currentUnitLife = loanLifeMap[selectedLoan.id] ?? 100;
        const clampedWear = Math.max(0, Math.min(100, Number(returnWear) || 0));
        const projectedLife = returnStatus === 'rota' ? 0 : Math.max(0, currentUnitLife - clampedWear);

        return (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-fadeIn" onClick={() => setIsReturnModalOpen(false)}>
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden animate-scaleUp" onClick={e => e.stopPropagation()}>
              <div className="p-5 border-b border-gray-100">
                <h3 className="text-base font-black text-slate-900 uppercase">Check-In de Herramienta</h3>
              </div>
              <form onSubmit={handleConfirmReturn} className="p-6 flex flex-col gap-4">
                <div className="bg-slate-50 border border-gray-200 p-4 rounded-lg">
                  <span className="block text-[11px] font-black text-slate-500 uppercase tracking-wide">Préstamo seleccionado:</span>
                  <span className="text-sm font-bold text-slate-900 uppercase">{selectedLoan.operator} - {selectedLoan.toolName} ({selectedLoan.code})</span>
                  <span className="block text-xs font-bold text-slate-700 mt-1">
                    Vida útil de esta unidad: {currentUnitLife}% →{' '}
                    {projectedLife <= 0 ? (
                      <strong className="text-red-600">0% (Se dará de baja del stock)</strong>
                    ) : (
                      <strong className={projectedLife <= 20 ? 'text-amber-700' : 'text-emerald-700'}>
                        Reingresa con {projectedLife}%
                      </strong>
                    )}
                  </span>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Estado</label>
                  <select
                    value={returnStatus}
                    onChange={e => setReturnStatus(e.target.value as 'ok' | 'rota')}
                    className="w-full border border-gray-300 rounded-lg p-2.5 text-sm bg-slate-50 outline-none focus:ring-2 focus:ring-slate-800 font-medium"
                  >
                    <option value="ok">ok (Reintegrar a Stock si vida &gt; 0%)</option>
                    <option value="rota">rota (Dar de baja esta unidad)</option>
                  </select>
                </div>

                {returnStatus === 'ok' && (
                  <div className="bg-slate-50 border border-gray-200 rounded-lg p-3.5 space-y-2.5">
                    <div className="flex justify-between items-center">
                      <label className="text-xs font-bold text-slate-700">Desgaste en este uso (%):</label>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-black text-red-600">-</span>
                        <input
                          type="number"
                          min="0"
                          max="100"
                          value={returnWear}
                          onChange={e => setReturnWear(Math.max(0, Math.min(100, Number(e.target.value))))}
                          className="w-20 border border-gray-300 rounded-lg p-1.5 text-sm text-center font-black bg-white outline-none focus:ring-2 focus:ring-slate-800"
                        />
                        <span className="text-xs font-bold text-slate-500">%</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 flex-wrap">
                      {[
                        { label: '0% (Sin desgaste)', value: 0 },
                        { label: '1% (Normal)', value: 1 },
                        { label: '5%', value: 5 },
                        { label: '10%', value: 10 },
                        { label: '25%', value: 25 }
                      ].map(preset => (
                        <button
                          key={preset.value}
                          type="button"
                          onClick={() => setReturnWear(preset.value)}
                          className={`px-2.5 py-1 rounded text-xs font-bold border transition cursor-pointer ${
                            clampedWear === preset.value
                              ? 'bg-slate-900 text-white border-slate-900'
                              : 'bg-white text-slate-700 border-gray-300 hover:bg-slate-100'
                          }`}
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Comentarios:</label>
                  <textarea
                    rows={3}
                    value={returnComments}
                    onChange={e => setReturnComments(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg p-2.5 text-sm bg-slate-50 outline-none focus:ring-2 focus:ring-slate-800"
                  />
                </div>

                <div className="flex justify-end gap-3 mt-4 pt-4 border-t border-gray-100">
                  <button type="button" onClick={() => setIsReturnModalOpen(false)} className="px-4 py-2 bg-slate-100 text-slate-700 font-bold rounded-lg hover:bg-slate-200 transition text-xs cursor-pointer">
                    Cancelar
                  </button>
                  <button type="submit" className="px-5 py-2 bg-emerald-600 text-white font-bold rounded-lg hover:bg-emerald-700 transition shadow-xs text-xs cursor-pointer">
                    Confirmar Retorno
                  </button>
                </div>
              </form>
            </div>
          </div>
        );
      })()}

      {/* BOTÓN FLOTANTE NUEVO REGISTRO */}
      <button 
        onClick={(e) => { e.stopPropagation(); resetForm(); setIsAddModalOpen(true); }}
        className="fixed bottom-8 right-8 bg-slate-900 hover:bg-slate-800 text-white w-14 h-14 rounded-full shadow-xl transition-all duration-200 hover:scale-105 active:scale-95 z-40 cursor-pointer flex items-center justify-center group"
        title="Crear Nuevo Registro"
      >
        <svg className="w-6 h-6 text-white transition-transform duration-200 group-hover:rotate-90" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15"></path>
        </svg>
      </button>

    </div>
  );
};