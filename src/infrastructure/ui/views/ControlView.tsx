import { useState, useEffect } from 'react';
import { User } from '../../../domain/entities/User';
import { FirestoreUserRepository } from '../../../adapters/repositories/FirestoreUserRepository';
import { logSystemEvent } from '../../services/systemLogger';

const userRepository = new FirestoreUserRepository();

interface ControlViewProps {
  userName?: string;
}

export const ControlView = ({ userName = '' }: ControlViewProps) => {
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isClosingModal, setIsClosingModal] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isClosingDelete, setIsClosingDelete] = useState(false);
  
  const [toast, setToast] = useState<{ message: string; type: 'error' | 'success' } | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [formName, setFormName] = useState('');
  const [formRole, setFormRole] = useState('Operador');
  const [formPassword, setFormPassword] = useState('');

  const showToast = (message: string, type: 'error' | 'success' = 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const loadUsers = async () => {
    setIsLoading(true);
    try {
      const data = await userRepository.getAll();
      setUsers(data);
    } catch (error: any) {
      showToast(`Error al cargar usuarios: ${error.message}`, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const handleGlobalClick = () => {
    setSelectedUserId(null);
    setContextMenu(null);
  };

  const handleContextMenu = (e: React.MouseEvent, id?: string) => {
    e.preventDefault();
    e.stopPropagation();
    setSelectedUserId(id || null);
    setContextMenu({ x: e.clientX, y: e.clientY });
  };

  const closeModal = () => {
    setIsClosingModal(true);
    setTimeout(() => { setIsModalOpen(false); setIsClosingModal(false); }, 180);
  };

  const closeDeleteModal = () => {
    setIsClosingDelete(true);
    setTimeout(() => { setIsDeleteModalOpen(false); setIsClosingDelete(false); }, 180);
  };

  const handleOpenEdit = (user: User) => {
    setEditingId(user.id);
    setFormName(user.name);
    setFormRole(user.role);
    setFormPassword('');
    setIsModalOpen(true);
  };

  const handleOpenCreate = () => {
    setEditingId(null);
    setFormName('');
    setFormRole('Operador');
    setFormPassword('');
    setIsModalOpen(true);
  };

  const handleSubmitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const roleTyped = formRole as 'Administrador' | 'Operador' | 'RH';

      if (editingId) {
        const existing = users.find(u => u.id === editingId);
        if (existing) {
          existing.name = formName;
          existing.role = roleTyped;
          
          const passwordChanged = formPassword.trim() !== '';
          if (passwordChanged) {
            (existing as any).password = formPassword; 
          }

          await userRepository.save(existing);
          await logSystemEvent(
            'CONTROL',
            'EDITAR CUENTA',
            userName,
            `Se modificó la cuenta de ${formName} (Rol: ${roleTyped}${passwordChanged ? ', contraseña actualizada' : ''})`
          );

          showToast('Usuario actualizado exitosamente.', 'success');
        }
      } else {
        if (formPassword.trim() === '') throw new Error("La contraseña es obligatoria para nuevos usuarios.");
        
        const newId = `usr-${Date.now()}`;
        const newUser = new User(newId, formName, roleTyped, formPassword); 

        await userRepository.save(newUser);
        await logSystemEvent(
          'CONTROL',
          'ALTA DE CUENTA',
          userName,
          `Se creó la cuenta para ${formName} con rol: ${roleTyped}`
        );

        showToast('Usuario creado exitosamente.', 'success');
      }
      
      closeModal();
      loadUsers();
    } catch (error: any) {
      showToast(error.message, 'error');
    }
  };

  const confirmDelete = async () => {
    if (!selectedUserId) return;
    try {
      const userToDelete = users.find(u => u.id === selectedUserId);
      await userRepository.delete(selectedUserId);
      await logSystemEvent(
        'CONTROL',
        'BAJA DE CUENTA',
        userName,
        `Se dio de baja la cuenta de ${userToDelete?.name || selectedUserId} (Rol: ${userToDelete?.role || 'N/A'})`
      );

      setSelectedUserId(null);
      closeDeleteModal();
      loadUsers();
      showToast('Usuario eliminado del sistema.', 'success');
    } catch (error: any) {
      showToast(`Error: ${error.message}`, 'error');
    }
  };

  const selectedUser = users.find(u => u.id === selectedUserId);

  return (
    <div className="h-[calc(100vh-100px)] flex flex-col relative select-none pb-1" onClick={handleGlobalClick}>
      
      {/* NOTIFICACIÓN TOAST */}
      {toast && (
        <div className={`fixed top-6 left-1/2 transform -translate-x-1/2 z-[100] px-5 py-3 rounded-lg shadow-xl font-bold flex items-center gap-2.5 animate-fadeIn transition-all duration-300 border ${
          toast.type === 'error' ? 'bg-red-50 text-red-700 border-red-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'
        }`}>
          <span className="text-sm">{toast.message}</span>
        </div>
      )}

      {/* BARRA SUPERIOR DE ACCIONES */}
      <div className="bg-white p-3.5 rounded-lg shadow-2xs border border-gray-200 mb-4 flex justify-between items-center shrink-0" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2">
          <span className="text-xs font-black text-slate-500 uppercase tracking-wider">Acciones de Control:</span>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={() => { if (selectedUser) handleOpenEdit(selectedUser); }} 
            disabled={!selectedUser} 
            className={`px-3.5 py-1.5 rounded text-xs font-bold transition ${selectedUser ? 'bg-slate-700 hover:bg-slate-800 text-white cursor-pointer' : 'bg-gray-100 text-gray-400 cursor-not-allowed'}`}
          >
            Editar Usuario
          </button>
          <button 
            onClick={() => setIsDeleteModalOpen(true)} 
            disabled={!selectedUser} 
            className={`px-3.5 py-1.5 rounded text-xs font-bold transition ${selectedUser ? 'bg-red-600 hover:bg-red-700 text-white cursor-pointer' : 'bg-gray-100 text-gray-400 cursor-not-allowed'}`}
          >
            Dar de Baja
          </button>
        </div>
      </div>

      {/* TABLA PRINCIPAL DE USUARIOS */}
      <div className="bg-white rounded-lg shadow-2xs border border-gray-200 flex-1 flex flex-col overflow-hidden" onContextMenu={(e) => handleContextMenu(e)}>
        <div className="p-3 border-b border-gray-200 bg-slate-50 flex justify-between items-center shrink-0">
          <h2 className="text-xs font-black text-slate-800 uppercase tracking-wider">Cuentas Registradas en el Sistema</h2>
          {isLoading && <span className="text-xs text-slate-600 font-bold">Cargando usuarios...</span>}
        </div>
        
        <div className="flex-1 overflow-auto min-h-0">
          <table className="w-full text-left border-collapse table-fixed">
            <thead className="bg-slate-100 sticky top-0 z-10 border-b border-gray-200">
              <tr>
                <th className="p-3 text-[11px] font-black text-slate-600 uppercase w-[20%]">ID Sistema</th>
                <th className="p-3 text-[11px] font-black text-slate-600 uppercase w-[40%]">Nombre de Usuario</th>
                <th className="p-3 text-[11px] font-black text-slate-600 uppercase w-[20%]">Rol</th>
                <th className="p-3 text-[11px] font-black text-slate-600 uppercase w-[20%] text-center">Estado</th>
              </tr>
            </thead>
            <tbody>
              {users.length === 0 && !isLoading ? (
                <tr><td colSpan={4} className="p-6 text-center text-slate-400 text-xs font-medium">No hay cuentas registradas.</td></tr>
              ) : (
                users.map((user) => {
                  const isSelected = selectedUserId === user.id;
                  let rowClass = "border-b cursor-pointer transition-colors ";
                  if (isSelected) rowClass += "bg-slate-100 border-gray-200 border-l-4 border-l-slate-900";
                  else rowClass += "hover:bg-slate-50 border-gray-100 border-l-4 border-l-transparent";

                  return (
                    <tr 
                      key={user.id} 
                      onClick={(e) => { 
                        e.stopPropagation();
                        setSelectedUserId(user.id); 
                        setContextMenu(null); 
                      }}
                      onContextMenu={(e) => handleContextMenu(e, user.id)}
                      className={rowClass}
                    >
                      <td className="p-3 text-xs text-slate-500 font-mono truncate">{user.id}</td>
                      <td className="p-3 text-xs font-bold text-slate-900 truncate">{user.name}</td>
                      <td className="p-3 text-xs font-medium truncate">
                        <span className={`px-2 py-0.5 rounded border text-[11px] font-bold ${
                          user.role === 'Administrador'
                            ? 'bg-slate-900 text-white border-slate-900'
                            : user.role === 'RH'
                            ? 'bg-orange-50 text-orange-800 border-orange-200'
                            : 'bg-slate-100 text-slate-700 border-slate-300'
                        }`}>
                          {user.role}
                        </span>
                      </td>
                      <td className="p-3 text-xs text-center">
                        <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-bold px-2.5 py-0.5 rounded-full">
                          Activa
                        </span>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MENÚ CONTEXTUAL */}
      {contextMenu && (
        <div className="fixed bg-white border border-gray-200 shadow-xl rounded-md py-1 z-50 w-56 animate-fadeIn" style={{ top: contextMenu.y, left: contextMenu.x }} onClick={(e) => e.stopPropagation()}>
          <button className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-100 transition cursor-pointer" onClick={() => { setContextMenu(null); handleOpenCreate(); }}>Crear Registro</button>
          
          {selectedUser && (
            <>
              <button className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-100 transition cursor-pointer" onClick={() => { setContextMenu(null); handleOpenEdit(selectedUser); }}>Editar Registro</button>
              <div className="h-px bg-gray-100 my-1 mx-2"></div>
              <button className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 font-bold transition cursor-pointer" onClick={() => { setContextMenu(null); setIsDeleteModalOpen(true); }}>Dar de Baja</button>
            </>
          )}
        </div>
      )}

      {/* BOTÓN FLOTANTE NUEVO USUARIO */}
      <button 
        onClick={(e) => { e.stopPropagation(); setContextMenu(null); handleOpenCreate(); }}
        className="fixed bottom-8 right-8 bg-slate-900 hover:bg-slate-800 text-white w-14 h-14 rounded-full shadow-xl transition-all duration-200 hover:scale-105 active:scale-95 z-40 cursor-pointer flex items-center justify-center group"
        title="Dar de Alta Nueva Cuenta"
      >
        <svg className="w-6 h-6 text-white transition-transform duration-200 group-hover:rotate-90" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15"></path>
        </svg>
      </button>

      {/* MODAL: REGISTRO / EDICIÓN */}
      {isModalOpen && (
        <div className={`fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 ${isClosingModal ? 'animate-fadeOut' : 'animate-fadeIn'}`} onClick={closeModal}>
          <div className={`bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden ${isClosingModal ? 'animate-scaleDown' : 'animate-scaleUp'}`} onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-gray-100"><h3 className="text-base font-black text-slate-900 uppercase">{editingId ? 'Editar Cuenta' : 'Alta de Cuenta'}</h3></div>
            <form onSubmit={handleSubmitForm} className="p-6 flex flex-col gap-4">
              
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Nombre del Usuario</label>
                <input type="text" required value={formName} onChange={e => setFormName(e.target.value)} placeholder="Ej. Juan Pérez" className="w-full border border-gray-300 rounded-lg p-2.5 text-sm bg-slate-50 outline-none focus:ring-2 focus:ring-slate-800" />
              </div>
              
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Rol / Permisos</label>
                <select value={formRole} onChange={e => setFormRole(e.target.value)} className="w-full border border-gray-300 rounded-lg p-2.5 text-sm bg-slate-50 outline-none focus:ring-2 focus:ring-slate-800 font-medium">
                  <option value="Operador">Operador</option>
                  <option value="RH">Recursos Humanos</option>
                  <option value="Administrador">Administrador</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Contraseña {editingId && <span className="text-slate-400 font-normal">(Dejar en blanco para no cambiar)</span>}
                </label>
                <input 
                  type="password" 
                  required={!editingId} 
                  value={formPassword} 
                  onChange={e => setFormPassword(e.target.value)} 
                  placeholder={editingId ? '••••••••' : 'Asignar contraseña...'}
                  className="w-full border border-gray-300 rounded-lg p-2.5 text-sm bg-slate-50 outline-none focus:ring-2 focus:ring-slate-800 font-mono" 
                />
              </div>

              <div className="flex justify-end gap-3 mt-4 pt-4 border-t border-gray-100">
                <button type="button" onClick={closeModal} className="px-4 py-2 bg-slate-100 text-slate-700 font-bold rounded-lg hover:bg-slate-200 transition text-xs cursor-pointer">Cancelar</button>
                <button type="submit" className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-lg transition shadow-xs text-xs cursor-pointer">
                  {editingId ? 'Guardar Cambios' : 'Registrar Cuenta'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL DE ELIMINACIÓN */}
      {isDeleteModalOpen && (
        <div className={`fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 ${isClosingDelete ? 'animate-fadeOut' : 'animate-fadeIn'}`} onClick={closeDeleteModal}>
          <div className={`bg-white rounded-xl shadow-2xl w-full max-w-md p-7 text-center overflow-hidden ${isClosingDelete ? 'animate-scaleDown' : 'animate-scaleUp'}`} onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-black text-slate-900 mb-2">¿Dar de Baja Cuenta?</h3>
            <p className="text-sm text-slate-600 mb-6 font-medium px-2">
              El usuario <span className="font-bold text-slate-900 break-all">"{selectedUser?.name}"</span> perderá su acceso al sistema MES inmediatamente. Esta acción es irreversible.
            </p>
            
            <div className="flex justify-center gap-3">
              <button type="button" onClick={closeDeleteModal} className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg transition cursor-pointer text-xs">Cancelar</button>
              <button type="button" onClick={confirmDelete} className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg shadow transition cursor-pointer text-xs">Sí, Dar de Baja</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};