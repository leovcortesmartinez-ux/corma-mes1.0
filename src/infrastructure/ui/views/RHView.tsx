import { useState, useEffect } from 'react';
import { db } from '../../../infrastructure/database/firebase';
import { collection, getDocs, doc, updateDoc, setDoc, deleteDoc } from 'firebase/firestore';
import { logSystemEvent } from '../../services/systemLogger';

interface EmployeeHR {
  id: string;
  name: string;
  email: string;
  phone: string;
  hireDate: string;
  shift: string;
  extraHours: number;
  debtHours: number;
  absencesCount: number;
  vacationsTaken: number;

  contractType?: string;
  birthDate?: string;
  address?: string;
  curp?: string;
  nss?: string;
  academicLevel?: string;
  bloodType?: string;
  allergies?: string;
  chronicDiseases?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
}

interface PlannedAbsence {
  id: string;
  employeeId: string;
  type: 'Vacaciones' | 'Incapacidad Médica' | 'Permiso Personal';
  startDate: string;
  endDate: string;
  status: 'PROGRAMADA' | 'TOMADA';
  days?: number;
}

interface RHViewProps {
  userName?: string;
}

const calculateExactAge = (birthDateStr: string): number => {
  const [bYear, bMonth, bDay] = birthDateStr.split('-').map(Number);
  const today = new Date();
  let age = today.getFullYear() - bYear;
  const monthDiff = today.getMonth() + 1 - bMonth;
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < bDay)) {
    age--;
  }
  return age;
};

const getBirthdayInfo = (birthDateStr?: string) => {
  if (!birthDateStr) {
    return {
      isToday: false,
      isWithin30Days: false,
      daysUntil: null as number | null,
      birthMonth: null as number | null,
      birthDay: null as number | null
    };
  }

  const parts = birthDateStr.split('-').map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) {
    return {
      isToday: false,
      isWithin30Days: false,
      daysUntil: null as number | null,
      birthMonth: null as number | null,
      birthDay: null as number | null
    };
  }

  const birthMonth = parts[1] - 1;
  const birthDay = parts[2];

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const isToday = today.getMonth() === birthMonth && today.getDate() === birthDay;

  let nextBirthday = new Date(today.getFullYear(), birthMonth, birthDay);
  if (nextBirthday < today) {
    nextBirthday = new Date(today.getFullYear() + 1, birthMonth, birthDay);
  }

  const daysUntil = Math.round((nextBirthday.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  const isWithin30Days = daysUntil >= 1 && daysUntil <= 30;

  return {
    isToday,
    isWithin30Days,
    daysUntil,
    birthMonth,
    birthDay
  };
};

const calculateSeniorityAndVacations = (hireDateStr: string) => {
  if (!hireDateStr) return { years: 0, label: 'Sin Registro', totalDays: 0 };

  const hireDate = new Date(hireDateStr + 'T00:00:00');
  const today = new Date();

  let years = today.getFullYear() - hireDate.getFullYear();
  let m = today.getMonth() - hireDate.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < hireDate.getDate())) {
    years--;
  }

  let label = years > 0 ? `${years} años` : `${m >= 0 ? m : 12 + m} meses`;
  if (years === 0 && m === 0) label = 'Recién Ingresado';

  let totalDays = 0;
  if (years === 1) totalDays = 12;
  else if (years === 2) totalDays = 14;
  else if (years === 3) totalDays = 16;
  else if (years === 4) totalDays = 18;
  else if (years === 5) totalDays = 20;
  else if (years >= 6 && years <= 10) totalDays = 22;
  else if (years >= 11 && years <= 15) totalDays = 24;
  else if (years >= 16 && years <= 20) totalDays = 26;
  else if (years >= 21 && years <= 25) totalDays = 28;
  else if (years >= 26) totalDays = 30;

  return { years, label, totalDays };
};

const calculateDaysBetween = (startStr: string, endStr: string) => {
  const start = new Date(startStr + 'T00:00:00');
  const end = new Date(endStr + 'T00:00:00');
  return Math.ceil((end.getTime() - start.getTime()) / (1000 * 3600 * 24)) + 1;
};

export const RHView: React.FC<RHViewProps> = ({ userName = '' }) => {
  const [employees, setEmployees] = useState<EmployeeHR[]>([]);
  const [plannedAbsences, setPlannedAbsences] = useState<PlannedAbsence[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const [editingAbsenceId, setEditingAbsenceId] = useState<string | null>(null);
  const [isExpedienteModalOpen, setIsExpedienteModalOpen] = useState(false);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);

  const [lockPromptEmp, setLockPromptEmp] = useState<EmployeeHR | null>(null);
  const [lockPassword, setLockPassword] = useState('');
  const [correctorEmp, setCorrectorEmp] = useState<EmployeeHR | null>(null);

  const [saldoErrorModal, setSaldoErrorModal] = useState<{ isOpen: boolean; message: string }>({ isOpen: false, message: '' });
  const [confirmTakeModal, setConfirmTakeModal] = useState<PlannedAbsence | null>(null);
  const [deleteAbsenceModal, setDeleteAbsenceModal] = useState<PlannedAbsence | null>(null);

  const [formOperator, setFormOperator] = useState('');
  const [formType, setFormType] = useState<'Vacaciones' | 'Incapacidad Médica' | 'Permiso Personal'>('Vacaciones');
  const [formStartDate, setFormStartDate] = useState('');
  const [formEndDate, setFormEndDate] = useState('');
  const [activeExpediente, setActiveExpediente] = useState<EmployeeHR | null>(null);
  const [activeHistoryEmp, setActiveHistoryEmp] = useState<EmployeeHR | null>(null);

  const [calendarMonth, setCalendarMonth] = useState(new Date());

  const [toast, setToast] = useState<{ message: string; type: 'error' | 'success' } | null>(null);
  const showToast = (message: string, type: 'error' | 'success' = 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  const loadData = async () => {
    setIsLoading(true);
    try {
      const usersSnap = await getDocs(collection(db, 'users'));
      const hrUsers: EmployeeHR[] = usersSnap.docs.map(docSnap => {
        const d = docSnap.data();
        return {
          id: docSnap.id,
          name: d.name || 'Sin Nombre',
          email: d.email || '',
          phone: d.phone || '',
          hireDate: d.hireDate || '',
          shift: d.shift || 'Matutino',
          extraHours: d.extraHours || 0,
          debtHours: d.debtHours || 0,
          absencesCount: d.absencesCount || 0,
          vacationsTaken: d.vacationsTaken || 0,
          contractType: d.contractType || '',
          birthDate: d.birthDate || '',
          address: d.address || '',
          curp: d.curp || '',
          nss: d.nss || '',
          academicLevel: d.academicLevel || '',
          bloodType: d.bloodType || '',
          allergies: d.allergies || '',
          chronicDiseases: d.chronicDiseases || '',
          emergencyContactName: d.emergencyContactName || '',
          emergencyContactPhone: d.emergencyContactPhone || ''
        };
      });
      setEmployees(hrUsers);
      if (hrUsers.length > 0 && !formOperator) setFormOperator(hrUsers[0].id);

      const absSnap = await getDocs(collection(db, 'absences'));
      const loadedAbsences: PlannedAbsence[] = absSnap.docs.map(docSnap => {
        const d = docSnap.data();
        return {
          id: docSnap.id,
          employeeId: d.employeeId,
          type: d.type,
          startDate: d.startDate,
          endDate: d.endDate,
          status: d.status || 'PROGRAMADA',
          days: d.days || calculateDaysBetween(d.startDate, d.endDate)
        };
      });
      setPlannedAbsences(loadedAbsences);
    } catch (error: any) {
      showToast(`Error al cargar datos: ${error.message}`, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const updateHourField = async (empId: string, field: keyof EmployeeHR, newValue: number) => {
    if (newValue < 0) return;
    try {
      const emp = employees.find(e => e.id === empId);
      setEmployees(prev => prev.map(e => (e.id === empId ? { ...e, [field]: newValue } : e)));
      await updateDoc(doc(db, 'users', empId), { [field]: newValue });

      const fieldLabels: Record<string, string> = {
        extraHours: 'Horas Extra',
        debtHours: 'Horas Deuda',
        absencesCount: 'Faltas'
      };

      await logSystemEvent(
        'RH',
        'CONTROL DE TIEMPO',
        userName,
        `Se actualizó ${fieldLabels[field] || field} de ${emp?.name || empId} a ${newValue}`
      );
    } catch (error: any) {
      showToast('Error al actualizar horas', 'error');
      loadData();
    }
  };

  const handleOpenNewSchedule = () => {
    setEditingAbsenceId(null);
    if (employees.length > 0) setFormOperator(employees[0].id);
    setFormType('Vacaciones');
    setFormStartDate('');
    setFormEndDate('');
    setIsScheduleModalOpen(true);
  };

  const handleOpenEditSchedule = (abs: PlannedAbsence) => {
    setEditingAbsenceId(abs.id);
    setFormOperator(abs.employeeId);
    setFormType(abs.type);
    setFormStartDate(abs.startDate);
    setFormEndDate(abs.endDate);
    setIsScheduleModalOpen(true);
  };

  const handleScheduleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const emp = employees.find(e => e.id === formOperator);
    if (!emp) return;

    const start = new Date(formStartDate + 'T00:00:00');
    const end = new Date(formEndDate + 'T00:00:00');

    if (end < start) {
      showToast('La fecha final no puede ser anterior a la inicial.', 'error');
      return;
    }

    const daysRequested = calculateDaysBetween(formStartDate, formEndDate);

    if (formType === 'Vacaciones') {
      const stats = calculateSeniorityAndVacations(emp.hireDate);
      const available = stats.totalDays - emp.vacationsTaken;

      if (available <= 0 || daysRequested > available) {
        setSaldoErrorModal({
          isOpen: true,
          message: `El operador ${emp.name} no cuenta con días de vacaciones suficientes para este periodo. (Disponibles: ${Math.max(0, available)} días, Solicitados: ${daysRequested} días).`
        });
        return;
      }
    }

    try {
      if (editingAbsenceId) {
        await updateDoc(doc(db, 'absences', editingAbsenceId), {
          employeeId: emp.id,
          type: formType,
          startDate: formStartDate,
          endDate: formEndDate,
          days: daysRequested
        });
        await logSystemEvent(
          'RH',
          'EDITAR AUSENCIA',
          userName,
          `Se modificó la ausencia de tipo ${formType} programada para el operador: ${emp.name}`
        );
        showToast('Ausencia programada actualizada.', 'success');
      } else {
        const newId = `abs-${Date.now()}`;
        const newAbsence: PlannedAbsence = {
          id: newId,
          employeeId: emp.id,
          type: formType,
          startDate: formStartDate,
          endDate: formEndDate,
          status: 'PROGRAMADA',
          days: daysRequested
        };
        await setDoc(doc(db, 'absences', newId), newAbsence);
        await logSystemEvent(
          'RH',
          'PROGRAMAR AUSENCIA',
          userName,
          `Se gestionó una ausencia de tipo ${formType} para el operador: ${emp.name}`
        );
        showToast('Ausencia programada. Confírmala cuando se tome.', 'success');
      }

      setIsScheduleModalOpen(false);
      setEditingAbsenceId(null);
      loadData();
    } catch (error: any) {
      showToast(`Error al guardar: ${error.message}`, 'error');
    }
  };

  const handleConfirmAbsenceTaken = async () => {
    if (!confirmTakeModal) return;
    const abs = confirmTakeModal;
    const days = abs.days || calculateDaysBetween(abs.startDate, abs.endDate);
    const emp = employees.find(e => e.id === abs.employeeId);

    try {
      await updateDoc(doc(db, 'absences', abs.id), {
        status: 'TOMADA',
        days
      });

      if (abs.type === 'Vacaciones') {
        const newVacationsTaken = (emp?.vacationsTaken || 0) + days;
        await updateDoc(doc(db, 'users', abs.employeeId), {
          vacationsTaken: newVacationsTaken
        });
      }

      await logSystemEvent(
        'RH',
        'CONFIRMAR TOMADAS',
        userName,
        `Se confirmó el goce de ausencia ID ${abs.id} como TOMADA (${abs.type} - ${emp?.name || 'Operador'})`
      );

      setConfirmTakeModal(null);
      showToast('Ausencia confirmada y saldo actualizado.', 'success');
      loadData();
    } catch (error: any) {
      showToast(`Error al confirmar: ${error.message}`, 'error');
    }
  };

  const handleDeleteAbsence = async () => {
    if (!deleteAbsenceModal) return;
    const empName = employees.find(e => e.id === deleteAbsenceModal.employeeId)?.name || 'Operador';
    try {
      await deleteDoc(doc(db, 'absences', deleteAbsenceModal.id));
      await logSystemEvent(
        'RH',
        'ELIMINAR AUSENCIA',
        userName,
        `Se canceló/eliminó la ausencia programada de ${empName}`
      );
      setDeleteAbsenceModal(null);
      showToast('Ausencia cancelada y eliminada.', 'success');
      loadData();
    } catch (error: any) {
      showToast(`Error al eliminar: ${error.message}`, 'error');
    }
  };

  const handleOpenLockPrompt = (emp: EmployeeHR) => {
    setLockPromptEmp(emp);
    setLockPassword('');
  };

  const handleVerifyLockPassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (lockPassword === 'CORMACORMA123') {
      const targetEmp = lockPromptEmp;
      setLockPromptEmp(null);
      setLockPassword('');
      setCorrectorEmp(targetEmp);
    } else {
      showToast('Contraseña incorrecta. Acceso denegado.', 'error');
    }
  };

  const handleRevertVacationToScheduled = async (abs: PlannedAbsence) => {
    if (!correctorEmp) return;
    const days = abs.days || calculateDaysBetween(abs.startDate, abs.endDate);

    try {
      await updateDoc(doc(db, 'absences', abs.id), {
        status: 'PROGRAMADA'
      });

      const currentEmp = employees.find(e => e.id === correctorEmp.id);
      const restoredTaken = Math.max(0, (currentEmp?.vacationsTaken || 0) - days);

      await updateDoc(doc(db, 'users', correctorEmp.id), {
        vacationsTaken: restoredTaken
      });

      await logSystemEvent(
        'RH',
        'REVERTIR VACACIONES',
        userName,
        `Se revirtieron ${days} día(s) de vacaciones tomadas a PROGRAMADA para el operador: ${correctorEmp.name}`
      );

      showToast(`Se revirtieron ${days} día(s) a 'Programada' y se devolvieron al saldo.`, 'success');
      loadData();
    } catch (error: any) {
      showToast(`Error al revertir: ${error.message}`, 'error');
    }
  };

  const handleOpenExpediente = (emp: EmployeeHR) => {
    setActiveExpediente({ ...emp });
    setIsExpedienteModalOpen(true);
  };

  const handleOpenHistory = (emp: EmployeeHR) => {
    setActiveHistoryEmp(emp);
    setIsHistoryModalOpen(true);
  };

  const handleExpedienteChange = (field: keyof EmployeeHR, value: string) => {
    if (activeExpediente) {
      setActiveExpediente({ ...activeExpediente, [field]: value });
    }
  };

  const handleSaveExpediente = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeExpediente) return;

    if (activeExpediente.birthDate) {
      const exactAge = calculateExactAge(activeExpediente.birthDate);
      if (exactAge < 18) {
        showToast(
          `Registro rechazado (RN-3): El trabajador tiene ${Math.max(0, exactAge)} años y debe ser mayor de 18 años.`,
          'error'
        );
        return;
      }
    }

    try {
      await updateDoc(doc(db, 'users', activeExpediente.id), { ...activeExpediente });
      await logSystemEvent(
        'RH',
        'EDITAR EXPEDIENTE',
        userName,
        `Se actualizó el expediente del empleado: ${activeExpediente.name}`
      );
      setEmployees(prev => prev.map(emp => (emp.id === activeExpediente.id ? activeExpediente : emp)));
      setIsExpedienteModalOpen(false);
      showToast('Expediente actualizado.', 'success');
    } catch (error: any) {
      showToast(`Error al guardar: ${error.message}`, 'error');
    }
  };

  const prevMonth = () => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1));
  const nextMonth = () => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1));

  const renderCalendarDays = () => {
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const days = [];
    for (let i = 0; i < firstDay; i++) days.push(null);
    for (let i = 1; i <= daysInMonth; i++) days.push(new Date(year, month, i));

    return days.map((day, index) => {
      if (!day) return <div key={`empty-${index}`} className="w-8 h-8"></div>;

      const dayAbsence = plannedAbsences.find(abs => {
        const start = new Date(abs.startDate + 'T00:00:00');
        const end = new Date(abs.endDate + 'T00:00:00');
        return day >= start && day <= end;
      });

      const upcomingBirthdays = employees
        .map(emp => ({ emp, info: getBirthdayInfo(emp.birthDate) }))
        .filter(
          ({ info }) =>
            (info.isToday || info.isWithin30Days) &&
            info.birthMonth === day.getMonth() &&
            info.birthDay === day.getDate()
        );

      const hasBirthdayHighlight = upcomingBirthdays.length > 0;

      let bgClass = 'hover:bg-slate-100 text-slate-700';
      if (dayAbsence) {
        if (dayAbsence.type === 'Vacaciones') bgClass = 'bg-emerald-600 text-white font-bold rounded-sm';
        else if (dayAbsence.type === 'Incapacidad Médica') bgClass = 'bg-red-600 text-white font-bold rounded-sm';
        else bgClass = 'bg-slate-700 text-white font-bold rounded-sm';

        if (hasBirthdayHighlight) {
          bgClass += ' ring-2 ring-orange-500';
        }
      } else if (hasBirthdayHighlight) {
        bgClass = 'bg-orange-500 text-white font-bold rounded-sm';
      }

      const isToday = new Date().toDateString() === day.toDateString();
      if (isToday && !dayAbsence && !hasBirthdayHighlight) {
        bgClass = 'bg-slate-300 text-slate-900 font-bold rounded-sm';
      }

      const tooltipParts: string[] = [];
      if (dayAbsence) {
        const tooltipEmp = employees.find(e => e.id === dayAbsence.employeeId)?.name || 'Operador';
        tooltipParts.push(`${tooltipEmp} - ${dayAbsence.type} (${dayAbsence.status})`);
      }
      if (hasBirthdayHighlight) {
        upcomingBirthdays.forEach(({ emp, info }) => {
          tooltipParts.push(
            info.isToday
              ? `Cumpleaños de ${emp.name} (Hoy)`
              : `Cumpleaños de ${emp.name} (en ${info.daysUntil} ${info.daysUntil === 1 ? 'día' : 'días'})`
          );
        });
      }

      return (
        <div
          key={index}
          title={tooltipParts.length > 0 ? tooltipParts.join(' | ') : undefined}
          className={`w-8 h-8 flex items-center justify-center text-xs cursor-default transition-colors ${bgClass}`}
        >
          {day.getDate()}
        </div>
      );
    });
  };

  const scheduledAbsences = plannedAbsences
    .filter(abs => abs.status === 'PROGRAMADA')
    .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());

  return (
    <div className="h-[calc(100vh-100px)] flex flex-col relative select-none pb-1">
      {/* NOTIFICACIÓN TOAST */}
      {toast && (
        <div
          className={`fixed top-6 left-1/2 transform -translate-x-1/2 z-[200] px-5 py-3 rounded-lg shadow-xl font-bold flex items-center gap-2.5 animate-fadeIn transition-all duration-300 border ${
            toast.type === 'error' ? 'bg-red-50 text-red-700 border-red-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'
          }`}
        >
          <span className="text-sm">{toast.message}</span>
        </div>
      )}

      {/* HEADER */}
      <div className="mb-4">
        <h2 className="text-base font-black text-slate-900 uppercase">Recursos Humanos y Planificación</h2>
        <p className="text-xs text-slate-500 font-medium">Gestión de horarios, turnos operativos y programación de vacaciones.</p>
      </div>

      <div className="flex-1 flex gap-6 overflow-hidden">
        {/* PANEL IZQUIERDO: LISTA DE EMPLEADOS */}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-xs font-black text-slate-700 uppercase tracking-wider">Control de Turnos y Personal</h3>
            {isLoading && <span className="text-xs text-slate-600 font-bold">Cargando BD...</span>}
          </div>

          <div className="flex-1 overflow-auto space-y-3.5 pr-2">
            {employees.length === 0 && !isLoading && (
              <p className="text-xs text-slate-500 text-center py-10">No hay usuarios registrados.</p>
            )}

            {employees.map(emp => {
              const stats = calculateSeniorityAndVacations(emp.hireDate);
              const available = Math.max(0, stats.totalDays - emp.vacationsTaken);
              const bdayInfo = getBirthdayInfo(emp.birthDate);

              return (
                <div key={emp.id} className="bg-white border border-gray-200 rounded-lg p-5 shadow-2xs">
                  <div className="flex justify-between items-start mb-1 gap-2">
                    <div>
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <h3 className="text-base font-black text-slate-900">{emp.name}</h3>
                        {bdayInfo.isToday && (
                          <span className="px-2.5 py-0.5 rounded text-[11px] font-bold bg-orange-50 text-orange-800 border border-orange-200 uppercase">
                            Cumpleaños Hoy
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-4 text-xs text-slate-500 mt-1">
                        <span>Tel: {emp.phone || 'Sin teléfono'}</span>
                        <span>Correo: {emp.email || 'Sin correo'}</span>
                      </div>
                      <span className="text-[11px] text-slate-400 font-mono mt-1 block">{emp.id}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs font-bold text-slate-500">Turno:</span>
                      <span className="bg-slate-100 text-slate-800 px-3 py-1 rounded text-xs font-bold border border-gray-200">{emp.shift}</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 mt-5 mb-4 items-center">
                    <div>
                      <span className="block text-[11px] text-slate-400 font-bold uppercase mb-1">Antigüedad</span>
                      <span className="text-sm font-bold text-slate-800">{stats.label}</span>
                    </div>
                    <div className="col-span-2 text-center">
                      <span className="block text-[11px] text-slate-400 font-bold uppercase mb-1">Control de Vacaciones (Año Actual)</span>
                      <div className="flex items-center justify-center gap-2">
                        <span className="text-xs font-bold text-slate-700">
                          {emp.vacationsTaken} tomados de {stats.totalDays}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded text-xs font-bold border ${
                            available > 0 ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-500 border-gray-200'
                          }`}
                        >
                          {available} disponibles
                        </span>
                        <button
                          type="button"
                          onClick={() => handleOpenLockPrompt(emp)}
                          title="Abrir corrector de vacaciones tomadas (Requiere contraseña)"
                          className="px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold border border-gray-300 transition cursor-pointer"
                        >
                          Ajustar
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-between items-center bg-slate-50 p-3 rounded-lg border border-gray-200 mb-4">
                    <div className="text-center">
                      <span className="block text-[11px] text-slate-500 font-bold mb-1.5">Horas Extra</span>
                      <div className="flex items-center gap-1 bg-white border border-gray-300 rounded">
                        <button
                          className="w-7 h-7 text-slate-700 hover:bg-slate-100 font-bold cursor-pointer"
                          onClick={() => updateHourField(emp.id, 'extraHours', emp.extraHours - 1)}
                        >
                          -
                        </button>
                        <span className="w-8 text-center text-xs font-black text-slate-900">{emp.extraHours}</span>
                        <button
                          className="w-7 h-7 text-slate-700 hover:bg-slate-100 font-bold cursor-pointer"
                          onClick={() => updateHourField(emp.id, 'extraHours', emp.extraHours + 1)}
                        >
                          +
                        </button>
                      </div>
                    </div>

                    <div className="text-center">
                      <span className="block text-[11px] text-slate-500 font-bold mb-1.5">Horas Deuda</span>
                      <div className="flex items-center gap-1 bg-white border border-gray-300 rounded">
                        <button
                          className="w-7 h-7 text-slate-700 hover:bg-slate-100 font-bold cursor-pointer"
                          onClick={() => updateHourField(emp.id, 'debtHours', emp.debtHours - 1)}
                        >
                          -
                        </button>
                        <span className="w-8 text-center text-xs font-black text-amber-700">{emp.debtHours}</span>
                        <button
                          className="w-7 h-7 text-slate-700 hover:bg-slate-100 font-bold cursor-pointer"
                          onClick={() => updateHourField(emp.id, 'debtHours', emp.debtHours + 1)}
                        >
                          +
                        </button>
                      </div>
                    </div>

                    <div className="text-center">
                      <span className="block text-[11px] text-slate-500 font-bold mb-1.5">Faltas</span>
                      <div className="flex items-center gap-1 bg-white border border-gray-300 rounded">
                        <button
                          className="w-7 h-7 text-slate-700 hover:bg-slate-100 font-bold cursor-pointer"
                          onClick={() => updateHourField(emp.id, 'absencesCount', emp.absencesCount - 1)}
                        >
                          -
                        </button>
                        <span className="w-8 text-center text-xs font-black text-red-700">{emp.absencesCount}</span>
                        <button
                          className="w-7 h-7 text-slate-700 hover:bg-slate-100 font-bold cursor-pointer"
                          onClick={() => updateHourField(emp.id, 'absencesCount', emp.absencesCount + 1)}
                        >
                          +
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => handleOpenExpediente(emp)}
                      className="px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded transition cursor-pointer"
                    >
                      Expediente
                    </button>
                    <button
                      onClick={() => handleOpenHistory(emp)}
                      className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-gray-300 text-xs font-bold rounded transition cursor-pointer"
                    >
                      Historial de Ausencias
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* PANEL DERECHO: CALENDARIO VISUAL Y PRÓXIMAS AUSENCIAS */}
        <div className="w-[380px] shrink-0 flex flex-col gap-4 overflow-hidden">
          <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-2xs shrink-0">
            <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider mb-3">Calendario de Ausencias</h3>

            <div className="flex justify-between items-center mb-3">
              <button
                onClick={prevMonth}
                className="w-8 h-8 flex items-center justify-center bg-slate-100 hover:bg-slate-200 rounded font-bold text-slate-700 text-xs cursor-pointer"
              >
                &lt;
              </button>
              <h4 className="text-xs font-black text-slate-900 uppercase">
                {calendarMonth.toLocaleString('es-MX', { month: 'long', year: 'numeric' })}
              </h4>
              <button
                onClick={nextMonth}
                className="w-8 h-8 flex items-center justify-center bg-slate-100 hover:bg-slate-200 rounded font-bold text-slate-700 text-xs cursor-pointer"
              >
                &gt;
              </button>
            </div>

            <div className="border border-gray-200 rounded-lg p-3 mb-3 bg-white">
              <div className="grid grid-cols-7 gap-1 text-center mb-2">
                <div className="text-[10px] font-black text-slate-400">Do</div>
                <div className="text-[10px] font-black text-slate-400">Lu</div>
                <div className="text-[10px] font-black text-slate-400">Ma</div>
                <div className="text-[10px] font-black text-slate-400">Mi</div>
                <div className="text-[10px] font-black text-slate-400">Ju</div>
                <div className="text-[10px] font-black text-slate-400">Vi</div>
                <div className="text-[10px] font-black text-slate-400">Sa</div>
              </div>
              <div className="grid grid-cols-7 gap-1 justify-items-center">{renderCalendarDays()}</div>
            </div>

            <div className="flex flex-wrap justify-between gap-2 text-[10px] font-bold text-slate-500 mb-3 px-1">
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-xs bg-emerald-600 inline-block"></span> Vacaciones
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-xs bg-slate-700 inline-block"></span> Permiso
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-xs bg-red-600 inline-block"></span> Incapacidad
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-xs bg-orange-500 inline-block"></span> Cumpleaños
              </span>
            </div>

            <button
              onClick={handleOpenNewSchedule}
              className="w-full py-2.5 bg-orange-600 hover:bg-orange-700 text-white font-bold text-xs uppercase tracking-wide rounded-lg shadow-xs transition cursor-pointer"
            >
              + Programar Ausencia / Vacaciones
            </button>
          </div>

          <div className="flex-1 overflow-auto pr-1">
            <h4 className="text-xs font-black text-slate-600 uppercase tracking-wider mb-2.5">Próximas Ausencias Aprobadas</h4>
            <div className="space-y-2.5">
              {scheduledAbsences.length === 0 ? (
                <p className="text-xs text-slate-400 italic">No hay ausencias pendientes por confirmar.</p>
              ) : (
                scheduledAbsences.map(abs => {
                  const empName = employees.find(e => e.id === abs.employeeId)?.name || 'Operador';
                  const borderAndText =
                    abs.type === 'Vacaciones'
                      ? 'border-l-emerald-600 text-emerald-700'
                      : abs.type === 'Incapacidad Médica'
                      ? 'border-l-red-600 text-red-700'
                      : 'border-l-slate-700 text-slate-700';

                  return (
                    <div
                      key={abs.id}
                      className={`bg-white border border-gray-200 border-l-4 p-3 rounded-lg shadow-2xs flex justify-between items-center gap-2 ${borderAndText}`}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-black text-slate-900 truncate">{empName}</p>
                        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                          <span className="text-[10px] font-mono text-slate-500">
                            {abs.startDate.split('-').reverse().join('/')}
                          </span>
                          <span className="text-[10px] font-bold bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">
                            PROGRAMADA
                          </span>
                          <span className="text-[10px] font-black uppercase truncate">{abs.type}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => setConfirmTakeModal(abs)}
                          title="Confirmar que ya se tomó (Descuenta saldo)"
                          className="px-2 py-1 rounded bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-700 font-bold text-[11px] transition cursor-pointer"
                        >
                          OK
                        </button>
                        <button
                          type="button"
                          onClick={() => handleOpenEditSchedule(abs)}
                          title="Editar ausencia programada"
                          className="px-2 py-1 rounded bg-slate-50 hover:bg-slate-100 border border-gray-200 text-slate-700 font-bold text-[11px] transition cursor-pointer"
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteAbsenceModal(abs)}
                          title="Cancelar y eliminar ausencia"
                          className="px-2 py-1 rounded bg-red-50 hover:bg-red-100 border border-red-200 text-red-600 font-bold text-[11px] transition cursor-pointer"
                        >
                          X
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>

      {/* MODAL 1: CONTRASEÑA PARA EL CORRECTOR */}
      {lockPromptEmp && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-fadeIn"
          onClick={() => setLockPromptEmp(null)}
        >
          <div
            className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden animate-scaleUp"
            onClick={e => e.stopPropagation()}
          >
            <div className="p-6 text-center">
              <h3 className="text-base font-black text-slate-900 uppercase">Acceso Protegido</h3>
              <p className="text-xs text-slate-500 mt-1.5">
                Ingresa la contraseña maestra para corregir las vacaciones tomadas de{' '}
                <span className="font-bold text-slate-800">{lockPromptEmp.name}</span>.
              </p>

              <form onSubmit={handleVerifyLockPassword} className="mt-4 space-y-4">
                <input
                  type="password"
                  autoFocus
                  required
                  value={lockPassword}
                  onChange={e => setLockPassword(e.target.value)}
                  placeholder="Contraseña de autorización..."
                  className="w-full border border-gray-300 rounded-lg p-2.5 text-sm text-center font-mono bg-slate-50 outline-none focus:ring-2 focus:ring-slate-800"
                />
                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setLockPromptEmp(null)}
                    className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg transition cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-lg transition cursor-pointer"
                  >
                    Desbloquear
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: CORRECTOR DE VACACIONES */}
      {correctorEmp && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-fadeIn"
          onClick={() => setCorrectorEmp(null)}
        >
          <div
            className="bg-white rounded-xl shadow-2xl w-full max-w-xl overflow-hidden animate-scaleUp flex flex-col max-h-[85vh]"
            onClick={e => e.stopPropagation()}
          >
            <div className="p-5 border-b border-gray-100">
              <h3 className="text-base font-black text-slate-900 uppercase">
                Corrector de Vacaciones — {correctorEmp.name}
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                Vacaciones marcadas como TOMADAS. Puedes revertirlas al estado &apos;Programada&apos;.
              </p>
            </div>

            <div className="p-6 overflow-y-auto flex-1 bg-slate-50">
              <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-2xs space-y-3">
                {plannedAbsences.filter(
                  a => a.employeeId === correctorEmp.id && a.type === 'Vacaciones' && a.status === 'TOMADA'
                ).length === 0 ? (
                  <p className="text-xs text-slate-400 text-center italic py-6">
                    Este operador no tiene vacaciones confirmadas como tomadas.
                  </p>
                ) : (
                  plannedAbsences
                    .filter(a => a.employeeId === correctorEmp.id && a.type === 'Vacaciones' && a.status === 'TOMADA')
                    .map(abs => {
                      const days = abs.days || calculateDaysBetween(abs.startDate, abs.endDate);
                      return (
                        <div
                          key={abs.id}
                          className="flex items-center justify-between gap-3 border-b border-gray-100 pb-3 last:border-0 last:pb-0"
                        >
                          <span className="text-xs font-bold text-slate-800">
                            Del {abs.startDate.split('-').reverse().join('/')} al{' '}
                            {abs.endDate.split('-').reverse().join('/')} ({days} {days === 1 ? 'día descontado' : 'días descontados'})
                          </span>
                          <button
                            type="button"
                            onClick={() => handleRevertVacationToScheduled(abs)}
                            className="px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded text-xs font-bold transition cursor-pointer shrink-0"
                          >
                            Revertir a Programada
                          </button>
                        </div>
                      );
                    })
                )}
              </div>
            </div>

            <div className="p-4 border-t border-gray-100 bg-white">
              <button
                type="button"
                onClick={() => setCorrectorEmp(null)}
                className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-lg transition cursor-pointer"
              >
                Cerrar Corrector
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: ERROR DE SALDO AGOTADO */}
      {saldoErrorModal.isOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-[110] p-4 animate-fadeIn"
          onClick={() => setSaldoErrorModal({ isOpen: false, message: '' })}
        >
          <div
            className="bg-white rounded-xl shadow-2xl w-full max-w-md p-7 text-center overflow-hidden animate-scaleUp"
            onClick={e => e.stopPropagation()}
          >
            <h3 className="text-lg font-black text-slate-900 mb-2">Saldo de Vacaciones Insuficiente</h3>
            <p className="text-sm text-slate-600 mb-6 font-medium leading-relaxed">{saldoErrorModal.message}</p>
            <button
              type="button"
              onClick={() => setSaldoErrorModal({ isOpen: false, message: '' })}
              className="w-full py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg transition cursor-pointer text-xs"
            >
              Entendido
            </button>
          </div>
        </div>
      )}

      {/* MODAL 4: CONFIRMAR AUSENCIA TOMADA */}
      {confirmTakeModal && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-[110] p-4 animate-fadeIn"
          onClick={() => setConfirmTakeModal(null)}
        >
          <div
            className="bg-white rounded-xl shadow-2xl w-full max-w-md p-7 text-center overflow-hidden animate-scaleUp"
            onClick={e => e.stopPropagation()}
          >
            <h3 className="text-lg font-black text-slate-900 mb-2">Confirmar Ausencia Tomada</h3>
            <p className="text-sm text-slate-600 mb-6 font-medium leading-relaxed">
              ¿Confirmar que el operador ya se tomó esta ausencia ({confirmTakeModal.type})?
              {confirmTakeModal.type === 'Vacaciones' &&
                ' Esto descontará los días correspondientes de su saldo anual.'}
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setConfirmTakeModal(null)}
                className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg transition cursor-pointer text-xs"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmAbsenceTaken}
                className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg transition cursor-pointer text-xs"
              >
                Sí, Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 5: ELIMINAR AUSENCIA */}
      {deleteAbsenceModal && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-[110] p-4 animate-fadeIn"
          onClick={() => setDeleteAbsenceModal(null)}
        >
          <div
            className="bg-white rounded-xl shadow-2xl w-full max-w-md p-7 text-center overflow-hidden animate-scaleUp"
            onClick={e => e.stopPropagation()}
          >
            <h3 className="text-lg font-black text-slate-900 mb-2">¿Eliminar Ausencia Programada?</h3>
            <p className="text-sm text-slate-600 mb-6 font-medium leading-relaxed">
              Esta acción cancelará y eliminará el registro de {deleteAbsenceModal.type}. No se puede deshacer.
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setDeleteAbsenceModal(null)}
                className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg transition cursor-pointer text-xs"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleDeleteAbsence}
                className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg transition cursor-pointer text-xs"
              >
                Sí, Eliminar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 6: PROGRAMAR / EDITAR AUSENCIA */}
      {isScheduleModalOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-fadeIn"
          onClick={() => setIsScheduleModalOpen(false)}
        >
          <div
            className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-scaleUp"
            onClick={e => e.stopPropagation()}
          >
            <div className="p-5 border-b border-gray-100">
              <h3 className="text-base font-black text-slate-900 uppercase">
                {editingAbsenceId ? 'Editar Ausencia Programada' : 'Programar Ausencia / Vacaciones'}
              </h3>
            </div>
            <form onSubmit={handleScheduleSubmit} className="p-6 flex flex-col gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Operador:</label>
                <select
                  value={formOperator}
                  onChange={e => setFormOperator(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg p-2.5 text-sm bg-slate-50 outline-none focus:ring-2 focus:ring-slate-800 font-medium"
                >
                  {employees.map(emp => (
                    <option key={emp.id} value={emp.id}>
                      {emp.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Tipo de Ausencia:</label>
                <select
                  value={formType}
                  onChange={e => setFormType(e.target.value as any)}
                  className="w-full border border-gray-300 rounded-lg p-2.5 text-sm bg-slate-50 outline-none focus:ring-2 focus:ring-slate-800 font-medium"
                >
                  <option value="Vacaciones">Vacaciones</option>
                  <option value="Incapacidad Médica">Incapacidad Médica</option>
                  <option value="Permiso Personal">Permiso Personal</option>
                </select>
              </div>
              <div className="flex gap-4">
                <div className="flex-1">
                  <label className="block text-xs font-bold text-slate-700 mb-1">Fecha Inicial:</label>
                  <input
                    type="date"
                    required
                    value={formStartDate}
                    onChange={e => setFormStartDate(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg p-2 text-xs bg-slate-50 outline-none focus:ring-2 focus:ring-slate-800"
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-xs font-bold text-slate-700 mb-1">Fecha Final:</label>
                  <input
                    type="date"
                    required
                    value={formEndDate}
                    onChange={e => setFormEndDate(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg p-2 text-xs bg-slate-50 outline-none focus:ring-2 focus:ring-slate-800"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-3 mt-4 pt-4 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setIsScheduleModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 text-slate-700 font-bold rounded-lg hover:bg-slate-200 transition text-xs cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-orange-600 text-white font-bold rounded-lg hover:bg-orange-700 transition shadow-xs text-xs cursor-pointer"
                >
                  {editingAbsenceId ? 'Actualizar Ausencia' : 'Confirmar Ausencia'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 7: EXPEDIENTE DEL TRABAJADOR */}
      {isExpedienteModalOpen && activeExpediente && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-fadeIn"
          onClick={() => setIsExpedienteModalOpen(false)}
        >
          <div
            className="bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden animate-scaleUp flex flex-col max-h-[90vh]"
            onClick={e => e.stopPropagation()}
          >
            <div className="p-5 border-b border-gray-100 shrink-0">
              <h3 className="text-base font-black text-slate-900 uppercase">
                Expediente: {activeExpediente.name}
              </h3>
              <p className="text-xs text-slate-500">Consulta y actualización de datos laborales y médicos.</p>
            </div>
            <form onSubmit={handleSaveExpediente} className="p-6 overflow-y-auto space-y-6">
              <div>
                <h4 className="text-xs font-black text-orange-600 uppercase tracking-wider border-b border-gray-200 pb-1.5 mb-3">
                  1. Datos Laborales
                </h4>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Fecha de Ingreso:</label>
                    <input
                      type="date"
                      value={activeExpediente.hireDate}
                      onChange={e => handleExpedienteChange('hireDate', e.target.value)}
                      className="w-full border border-gray-300 rounded-lg p-2 text-xs bg-slate-50 outline-none focus:ring-2 focus:ring-slate-800"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Turno Operativo:</label>
                    <select
                      value={activeExpediente.shift}
                      onChange={e => handleExpedienteChange('shift', e.target.value)}
                      className="w-full border border-gray-300 rounded-lg p-2 text-xs bg-slate-50 outline-none focus:ring-2 focus:ring-slate-800"
                    >
                      <option value="Matutino">Matutino</option>
                      <option value="Vespertino">Vespertino</option>
                      <option value="Nocturno">Nocturno</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Tipo de Contrato:</label>
                    <select
                      value={activeExpediente.contractType}
                      onChange={e => handleExpedienteChange('contractType', e.target.value)}
                      className="w-full border border-gray-300 rounded-lg p-2 text-xs bg-slate-50 outline-none focus:ring-2 focus:ring-slate-800"
                    >
                      <option value="">Seleccionar...</option>
                      <option value="Indeterminado">Indeterminado</option>
                      <option value="Temporal">Temporal</option>
                      <option value="Prueba">Periodo de Prueba</option>
                    </select>
                  </div>
                </div>
              </div>

              <div>
                <h4 className="text-xs font-black text-orange-600 uppercase tracking-wider border-b border-gray-200 pb-1.5 mb-3">
                  2. Información Personal e Identificación
                </h4>
                <div className="grid grid-cols-3 gap-4 mb-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Fecha de Nacimiento:</label>
                    <input
                      type="date"
                      value={activeExpediente.birthDate}
                      onChange={e => handleExpedienteChange('birthDate', e.target.value)}
                      className="w-full border border-gray-300 rounded-lg p-2 text-xs bg-slate-50 outline-none focus:ring-2 focus:ring-slate-800"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Teléfono Celular:</label>
                    <input
                      type="text"
                      value={activeExpediente.phone}
                      onChange={e => handleExpedienteChange('phone', e.target.value)}
                      className="w-full border border-gray-300 rounded-lg p-2 text-xs bg-slate-50 outline-none focus:ring-2 focus:ring-slate-800"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Correo Electrónico:</label>
                    <input
                      type="email"
                      value={activeExpediente.email}
                      onChange={e => handleExpedienteChange('email', e.target.value)}
                      className="w-full border border-gray-300 rounded-lg p-2 text-xs bg-slate-50 outline-none focus:ring-2 focus:ring-slate-800"
                    />
                  </div>
                </div>
                <div className="mb-3">
                  <label className="block text-xs font-bold text-slate-700 mb-1">Domicilio Completo:</label>
                  <input
                    type="text"
                    value={activeExpediente.address}
                    onChange={e => handleExpedienteChange('address', e.target.value)}
                    className="w-full border border-gray-300 rounded-lg p-2 text-xs bg-slate-50 outline-none focus:ring-2 focus:ring-slate-800"
                  />
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">CURP:</label>
                    <input
                      type="text"
                      value={activeExpediente.curp}
                      onChange={e => handleExpedienteChange('curp', e.target.value.toUpperCase())}
                      className="w-full border border-gray-300 rounded-lg p-2 text-xs bg-slate-50 outline-none focus:ring-2 focus:ring-slate-800 uppercase font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">NSS (Seguro Social):</label>
                    <input
                      type="text"
                      value={activeExpediente.nss}
                      onChange={e => handleExpedienteChange('nss', e.target.value)}
                      className="w-full border border-gray-300 rounded-lg p-2 text-xs bg-slate-50 outline-none focus:ring-2 focus:ring-slate-800 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Grado Académico:</label>
                    <select
                      value={activeExpediente.academicLevel}
                      onChange={e => handleExpedienteChange('academicLevel', e.target.value)}
                      className="w-full border border-gray-300 rounded-lg p-2 text-xs bg-slate-50 outline-none focus:ring-2 focus:ring-slate-800"
                    >
                      <option value="">Seleccionar...</option>
                      <option value="Secundaria">Secundaria</option>
                      <option value="Preparatoria / Técnico">Preparatoria / Técnico</option>
                      <option value="Ingeniería / Licenciatura">Ingeniería / Licenciatura</option>
                    </select>
                  </div>
                </div>
              </div>

              <div>
                <h4 className="text-xs font-black text-red-700 uppercase tracking-wider border-b border-gray-200 pb-1.5 mb-3">
                  3. Ficha Médica y Contacto de Emergencia
                </h4>
                <div className="grid grid-cols-3 gap-4 mb-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Tipo de Sangre:</label>
                    <select
                      value={activeExpediente.bloodType}
                      onChange={e => handleExpedienteChange('bloodType', e.target.value)}
                      className="w-full border border-gray-300 rounded-lg p-2 text-xs bg-slate-50 outline-none focus:ring-2 focus:ring-slate-800"
                    >
                      <option value="">Desconocido</option>
                      <option value="O+">O+</option>
                      <option value="O-">O-</option>
                      <option value="A+">A+</option>
                      <option value="A-">A-</option>
                      <option value="B+">B+</option>
                      <option value="B-">B-</option>
                      <option value="AB+">AB+</option>
                      <option value="AB-">AB-</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Alergias Conocidas:</label>
                    <input
                      type="text"
                      value={activeExpediente.allergies}
                      onChange={e => handleExpedienteChange('allergies', e.target.value)}
                      className="w-full border border-gray-300 rounded-lg p-2 text-xs bg-slate-50 outline-none focus:ring-2 focus:ring-slate-800"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Enfermedades Crónicas:</label>
                    <input
                      type="text"
                      value={activeExpediente.chronicDiseases}
                      onChange={e => handleExpedienteChange('chronicDiseases', e.target.value)}
                      className="w-full border border-gray-300 rounded-lg p-2 text-xs bg-slate-50 outline-none focus:ring-2 focus:ring-slate-800"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Nombre Contacto Emergencia:</label>
                    <input
                      type="text"
                      value={activeExpediente.emergencyContactName}
                      onChange={e => handleExpedienteChange('emergencyContactName', e.target.value)}
                      className="w-full border border-gray-300 rounded-lg p-2 text-xs bg-slate-50 outline-none focus:ring-2 focus:ring-slate-800"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Teléfono Emergencia:</label>
                    <input
                      type="text"
                      value={activeExpediente.emergencyContactPhone}
                      onChange={e => handleExpedienteChange('emergencyContactPhone', e.target.value)}
                      className="w-full border border-gray-300 rounded-lg p-2 text-xs bg-slate-50 outline-none focus:ring-2 focus:ring-slate-800"
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setIsExpedienteModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 text-slate-700 font-bold rounded-lg hover:bg-slate-200 transition text-xs cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-lg transition shadow-xs text-xs cursor-pointer"
                >
                  Guardar Expediente
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 8: HISTORIAL DE AUSENCIAS POR EMPLEADO */}
      {isHistoryModalOpen && activeHistoryEmp && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-fadeIn"
          onClick={() => setIsHistoryModalOpen(false)}
        >
          <div
            className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden animate-scaleUp flex flex-col max-h-[80vh]"
            onClick={e => e.stopPropagation()}
          >
            <div className="p-5 border-b border-gray-100 flex justify-between items-center">
              <div>
                <h3 className="text-base font-black text-slate-900 uppercase">Historial de Ausencias</h3>
                <p className="text-xs text-slate-500 font-bold">{activeHistoryEmp.name}</p>
              </div>
              <button
                onClick={() => setIsHistoryModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 font-black text-sm cursor-pointer"
              >
                Cerrar
              </button>
            </div>
            <div className="p-6 overflow-y-auto space-y-3">
              {plannedAbsences.filter(a => a.employeeId === activeHistoryEmp.id).length === 0 ? (
                <p className="text-xs text-slate-400 text-center italic py-8">
                  No hay registros de vacaciones, permisos o incapacidades para este trabajador.
                </p>
              ) : (
                plannedAbsences
                  .filter(a => a.employeeId === activeHistoryEmp.id)
                  .map(abs => {
                    const days = abs.days || calculateDaysBetween(abs.startDate, abs.endDate);
                    const badgeColor =
                      abs.type === 'Vacaciones'
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : abs.type === 'Incapacidad Médica'
                        ? 'bg-red-50 text-red-700 border-red-200'
                        : 'bg-slate-100 text-slate-700 border-slate-300';

                    return (
                      <div
                        key={abs.id}
                        className="border border-gray-200 rounded-lg p-3.5 flex justify-between items-center bg-slate-50"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span className={`px-2 py-0.5 rounded border text-[10px] font-black uppercase ${badgeColor}`}>
                              {abs.type}
                            </span>
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                                abs.status === 'TOMADA'
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                  : 'bg-amber-50 text-amber-800 border-amber-200'
                              }`}
                            >
                              {abs.status === 'TOMADA' ? 'TOMADA' : 'PROGRAMADA'}
                            </span>
                          </div>
                          <p className="text-xs font-bold text-slate-700 mt-2">
                            Del {abs.startDate.split('-').reverse().join('/')} al{' '}
                            {abs.endDate.split('-').reverse().join('/')}
                          </p>
                        </div>
                        <div className="text-right">
                          <span className="text-lg font-black text-slate-900">{days}</span>
                          <span className="block text-[10px] font-bold text-slate-400 uppercase">
                            {days === 1 ? 'Día' : 'Días'}
                          </span>
                        </div>
                      </div>
                    );
                  })
              )}
            </div>
            <div className="p-4 border-t border-gray-100 bg-slate-50 flex justify-end">
              <button
                onClick={() => setIsHistoryModalOpen(false)}
                className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-lg transition cursor-pointer"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};