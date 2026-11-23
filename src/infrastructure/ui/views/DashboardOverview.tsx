import { useState, useEffect, useMemo } from 'react';
import { db } from '../../../infrastructure/database/firebase';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { FirestoreWorkOrderRepository } from '../../../adapters/repositories/FirestoreWorkOrderRepository';
import { FirestoreInventoryRepository } from '../../../adapters/repositories/FirestoreInventoryRepository';
import { FirestoreLoanRepository } from '../../../adapters/repositories/FirestoreLoanRepository';
import { FirestoreUserRepository } from '../../../adapters/repositories/FirestoreUserRepository';
import type { WorkOrder } from '../../../domain/entities/WorkOrder';
import type { InventoryItem } from '../../../domain/entities/InventoryItem';
import type { ActiveLoan } from '../../../domain/entities/ActiveLoan';
import type { User } from '../../../domain/entities/User';
import type { SystemLogEntry } from '../../services/systemLogger';

const workOrderRepository = new FirestoreWorkOrderRepository();
const inventoryRepository = new FirestoreInventoryRepository();
const loanRepository = new FirestoreLoanRepository();
const userRepository = new FirestoreUserRepository();

const MONTHS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

const getInventoryLabel = (item: InventoryItem): string => {
  const raw = item as unknown as Record<string, unknown>;
  return String(
    raw.name ?? raw.itemName ?? raw.description ?? raw.title ?? raw.id ?? 'Elemento'
  );
};

// Paleta sobria para estados del Kanban
const KANBAN_STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  Pendiente: { label: 'PENDIENTE', color: '#94a3b8' },
  Asignado: { label: 'ASIGNADO', color: '#475569' },
  Trabajando: { label: 'TRABAJANDO', color: '#ea580c' },
  Inspección: { label: 'INSPECCION', color: '#0f172a' }
};

interface DashboardOverviewProps {
  onNavigateToHistorial?: () => void;
}

interface OperatorMetric {
  id: string;
  name: string;
  avanzados: number;
  terminados: number;
  herramientasOk: number;
  matReg: number;
  rotas: number;
  efficiency: number;
}

interface PdfConfigState {
  fromMonth: number;
  fromYear: number;
  toMonth: number;
  toYear: number;
  includeSummary: boolean;
  includeCharts: boolean;
  includeEfficiencyTable: boolean;
  includeLogs: boolean;
  logKanban: boolean;
  logInventoryTools: boolean;
  logOther: boolean;
}

const escapeHtml = (unsafe: string): string =>
  unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

export const DashboardOverview: React.FC<DashboardOverviewProps> = ({ onNavigateToHistorial }) => {
  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState<number>(now.getMonth());
  const [selectedYear, setSelectedYear] = useState<number>(now.getFullYear());

  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [loans, setLoans] = useState<ActiveLoan[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [periodLogs, setPeriodLogs] = useState<SystemLogEntry[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const [isPdfModalOpen, setIsPdfModalOpen] = useState<boolean>(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState<boolean>(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [pdfConfig, setPdfConfig] = useState<PdfConfigState>({
    fromMonth: now.getMonth(),
    fromYear: now.getFullYear(),
    toMonth: now.getMonth(),
    toYear: now.getFullYear(),
    includeSummary: true,
    includeCharts: true,
    includeEfficiencyTable: true,
    includeLogs: true,
    logKanban: true,
    logInventoryTools: true,
    logOther: true
  });

  const [hoveredSlice, setHoveredSlice] = useState<{
    label: string;
    count: number;
    percentage: string;
    color: string;
  } | null>(null);

  const availableYears = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const years: number[] = [];
    for (let y = currentYear - 2; y <= currentYear + 2; y++) {
      years.push(y);
    }
    return years;
  }, []);

  const loadDashboardData = async () => {
    setIsLoading(true);
    try {
      const logsQuery = query(
        collection(db, 'system_logs'),
        where('year', '==', selectedYear),
        where('month', '==', selectedMonth)
      );

      const [ordersData, inventoryData, loansData, usersData, logsSnap] = await Promise.all([
        workOrderRepository.getAll(),
        inventoryRepository.getAll(),
        loanRepository.getAll(),
        userRepository.getAll(),
        getDocs(logsQuery)
      ]);

      const logsData: SystemLogEntry[] = logsSnap.docs
        .map(d => ({
          id: d.id,
          ...(d.data() as Omit<SystemLogEntry, 'id'>)
        }))
        .sort((a, b) => b.timestamp - a.timestamp);

      setWorkOrders(ordersData);
      setInventory(inventoryData);
      setLoans(loansData);
      setUsers(usersData);
      setPeriodLogs(logsData);
    } catch (error) {
      console.error('Error al cargar métricas del panel:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadDashboardData();
  }, [selectedMonth, selectedYear]);

  const handleResetCurrentMonth = () => {
    const today = new Date();
    setSelectedMonth(today.getMonth());
    setSelectedYear(today.getFullYear());
  };

  const handleOpenPdfModal = () => {
    setPdfError(null);
    setPdfConfig(prev => ({
      ...prev,
      fromMonth: selectedMonth,
      fromYear: selectedYear,
      toMonth: selectedMonth,
      toYear: selectedYear
    }));
    setIsPdfModalOpen(true);
  };

  const computeOperatorMetrics = (logsSource: SystemLogEntry[]): OperatorMetric[] => {
    const operatorsList = users.filter(u => u.role === 'Operador');

    return operatorsList
      .map(op => {
        const nameLower = op.name.trim().toLowerCase();

        const avanzados = logsSource.filter(
          l =>
            l.module === 'KANBAN' &&
            l.action === 'AVANZAR' &&
            l.operator.trim().toLowerCase() === nameLower
        ).length;

        const terminados = logsSource.filter(
          l =>
            l.module === 'KANBAN' &&
            l.action === 'TERMINAR TRABAJO' &&
            (l.operator.trim().toLowerCase() === nameLower ||
              workOrders.some(
                wo =>
                  wo.status === 'Terminada' &&
                  wo.assignedOperators.some(a => a.trim().toLowerCase() === nameLower) &&
                  l.detail.toLowerCase().includes(wo.partName.toLowerCase())
              ))
        ).length;

        const herramientasOk = logsSource.filter(
          l =>
            l.module === 'HERRAMIENTAS' &&
            l.action.includes('CHECK-IN') &&
            l.operator.trim().toLowerCase() === nameLower &&
            l.detail.toLowerCase().includes('estado: ok')
        ).length;

        const rotas = logsSource.filter(
          l =>
            l.module === 'HERRAMIENTAS' &&
            l.action.includes('CHECK-IN') &&
            l.operator.trim().toLowerCase() === nameLower &&
            l.detail.toLowerCase().includes('estado: rota')
        ).length;

        const matReg = logsSource.filter(
          l =>
            l.module === 'INVENTARIO' &&
            l.action === 'CONSUMO MATERIAL' &&
            (l.detail.trim().toLowerCase().startsWith(nameLower) ||
              l.operator.trim().toLowerCase() === nameLower)
        ).length;

        const rawEfficiency =
          avanzados * 1 +
          terminados * 5 +
          herramientasOk * 1 +
          matReg * 1 -
          rotas * 5;

        const efficiency = Math.min(100, Math.max(0, rawEfficiency));

        return {
          id: op.id,
          name: op.name,
          avanzados,
          terminados,
          herramientasOk,
          matReg,
          rotas,
          efficiency
        };
      })
      .sort(
        (a, b) =>
          b.efficiency - a.efficiency ||
          b.terminados - a.terminados ||
          b.avanzados - a.avanzados
      );
  };

  const kpis = useMemo(() => {
    const finishLogs = periodLogs.filter(
      l => l.module === 'KANBAN' && l.action === 'TERMINAR TRABAJO'
    );

    let piecesDelivered = 0;
    if (finishLogs.length > 0) {
      finishLogs.forEach(log => {
        const matchedOrder = workOrders.find(
          wo =>
            wo.status === 'Terminada' &&
            log.detail.toLowerCase().includes(wo.partName.toLowerCase())
        );
        piecesDelivered += matchedOrder ? Number(matchedOrder.quantity || 1) : 1;
      });
    } else {
      const today = new Date();
      if (selectedMonth === today.getMonth() && selectedYear === today.getFullYear()) {
        piecesDelivered = workOrders
          .filter(wo => wo.status === 'Terminada')
          .reduce((sum, wo) => sum + Number(wo.quantity || 1), 0);
      }
    }

    const loanedTools = loans.reduce((sum, loan) => sum + Number(loan.quantity || 1), 0);

    const stoppedMachines = inventory.filter(
      item => item.category === 'Máquinas' && item.status === 'PARADA'
    ).length;

    const lowStockAlerts = inventory.filter(
      item => item.category !== 'Máquinas' && item.quantity <= item.minStock
    ).length;

    return {
      piecesDelivered,
      loanedTools,
      stoppedMachines,
      lowStockAlerts
    };
  }, [periodLogs, workOrders, loans, inventory, selectedMonth, selectedYear]);

  const kanbanDistribution = useMemo(() => {
    const activeOrders = workOrders.filter(wo => wo.status !== 'Terminada');
    const total = activeOrders.length;

    const slices = Object.entries(KANBAN_STATUS_CONFIG)
      .map(([statusKey, cfg]) => {
        const count = activeOrders.filter(wo => wo.status === statusKey).length;
        const percentage = total > 0 ? (count / total) * 100 : 0;
        return {
          statusKey,
          label: cfg.label,
          color: cfg.color,
          count,
          percentage
        };
      })
      .filter(s => s.count > 0);

    return { total, slices };
  }, [workOrders]);

  const operatorMetrics: OperatorMetric[] = useMemo(
    () => computeOperatorMetrics(periodLogs),
    [users, periodLogs, workOrders]
  );

  const top5Operators = useMemo(() => operatorMetrics.slice(0, 5), [operatorMetrics]);

  const handleGenerateAndDownloadPdf = async () => {
    const startSerial = pdfConfig.fromYear * 12 + pdfConfig.fromMonth;
    const endSerial = pdfConfig.toYear * 12 + pdfConfig.toMonth;

    if (startSerial > endSerial) {
      setPdfError('El mes/año inicial ("Desde") no puede ser posterior al final ("Hasta").');
      return;
    }

    const hasAnySection =
      pdfConfig.includeSummary ||
      pdfConfig.includeCharts ||
      pdfConfig.includeEfficiencyTable ||
      (pdfConfig.includeLogs &&
        (pdfConfig.logKanban || pdfConfig.logInventoryTools || pdfConfig.logOther));

    if (!hasAnySection) {
      setPdfError('Selecciona al menos una sección para incluir en el reporte.');
      return;
    }

    setPdfError(null);
    setIsGeneratingPdf(true);

    try {
      let rangeLogs: SystemLogEntry[] = [];
      if (
        pdfConfig.fromYear === selectedYear &&
        pdfConfig.fromMonth === selectedMonth &&
        pdfConfig.toYear === selectedYear &&
        pdfConfig.toMonth === selectedMonth
      ) {
        rangeLogs = [...periodLogs];
      } else {
        const rangeQuery = query(
          collection(db, 'system_logs'),
          where('year', '>=', pdfConfig.fromYear),
          where('year', '<=', pdfConfig.toYear)
        );
        const snap = await getDocs(rangeQuery);
        rangeLogs = snap.docs
          .map(d => ({
            id: d.id,
            ...(d.data() as Omit<SystemLogEntry, 'id'>)
          }))
          .filter(item => {
            const serial = Number(item.year) * 12 + Number(item.month);
            return serial >= startSerial && serial <= endSerial;
          })
          .sort((a, b) => b.timestamp - a.timestamp);
      }

      const finishLogs = rangeLogs.filter(
        l => l.module === 'KANBAN' && l.action === 'TERMINAR TRABAJO'
      );
      let pdfPiecesDelivered = 0;
      if (finishLogs.length > 0) {
        finishLogs.forEach(log => {
          const matchedOrder = workOrders.find(
            wo =>
              wo.status === 'Terminada' &&
              log.detail.toLowerCase().includes(wo.partName.toLowerCase())
          );
          pdfPiecesDelivered += matchedOrder ? Number(matchedOrder.quantity || 1) : 1;
        });
      } else {
        const today = new Date();
        const currentSerial = today.getFullYear() * 12 + today.getMonth();
        if (currentSerial >= startSerial && currentSerial <= endSerial) {
          pdfPiecesDelivered = workOrders
            .filter(wo => wo.status === 'Terminada')
            .reduce((sum, wo) => sum + Number(wo.quantity || 1), 0);
        }
      }

      const stoppedMachinesList = inventory.filter(
        item => item.category === 'Máquinas' && item.status === 'PARADA'
      );
      const lowStockList = inventory.filter(
        item => item.category !== 'Máquinas' && item.quantity <= item.minStock
      );

      const pdfOperatorMetrics = computeOperatorMetrics(rangeLogs);
      const pdfTop5 = pdfOperatorMetrics.slice(0, 5);

      const filteredLogs = rangeLogs.filter(log => {
        const mod = (log.module || '').toUpperCase();
        if (mod === 'KANBAN') return pdfConfig.logKanban;
        if (mod === 'INVENTARIO' || mod === 'HERRAMIENTAS' || mod === 'CATALOGO') {
          return pdfConfig.logInventoryTools;
        }
        return pdfConfig.logOther;
      });

      const buildPieSvg = () => {
        const { total, slices } = kanbanDistribution;
        const cx = 90;
        const cy = 90;
        const r = 74;

        if (total === 0) {
          return `<svg width="180" height="180" viewBox="0 0 180 180">
            <circle cx="${cx}" cy="${cy}" r="${r}" fill="#e2e8f0"/>
            <text x="${cx}" y="${cy + 4}" text-anchor="middle" font-size="11" fill="#64748b" font-weight="700">Sin órdenes</text>
          </svg>`;
        }

        if (slices.length === 1) {
          const s = slices[0];
          return `<svg width="180" height="180" viewBox="0 0 180 180">
            <circle cx="${cx}" cy="${cy}" r="${r}" fill="${s.color}"/>
            <text x="${cx}" y="${cy + 5}" text-anchor="middle" font-size="14" fill="#ffffff" font-weight="800">${s.count} (100%)</text>
          </svg>`;
        }

        let angle = -Math.PI / 2;
        const paths = slices
          .map(s => {
            const sliceAngle = (s.count / total) * 2 * Math.PI;
            const start = angle;
            const end = angle + sliceAngle;
            angle = end;

            const x1 = cx + r * Math.cos(start);
            const y1 = cy + r * Math.sin(start);
            const x2 = cx + r * Math.cos(end);
            const y2 = cy + r * Math.sin(end);
            const largeArc = sliceAngle > Math.PI ? 1 : 0;

            const mid = start + sliceAngle / 2;
            const lx = cx + r * 0.56 * Math.cos(mid);
            const ly = cy + r * 0.56 * Math.sin(mid);

            return `
              <path d="M ${cx} ${cy} L ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 ${largeArc} 1 ${x2.toFixed(2)} ${y2.toFixed(2)} Z" fill="${s.color}" stroke="#ffffff" stroke-width="1.5"/>
              <text x="${lx.toFixed(2)}" y="${(ly + 4).toFixed(2)}" text-anchor="middle" font-size="11" fill="#ffffff" font-weight="800">${s.count}</text>
            `;
          })
          .join('');

        return `<svg width="180" height="180" viewBox="0 0 180 180">${paths}</svg>`;
      };

      const buildBarSvg = () => {
        if (pdfTop5.length === 0) {
          return `<div style="padding:40px 0;text-align:center;color:#94a3b8;font-size:12px;">Sin operadores registrados</div>`;
        }

        const width = 340;
        const height = 185;
        const padLeft = 28;
        const padBottom = 26;
        const padTop = 18;
        const chartW = width - padLeft - 12;
        const chartH = height - padTop - padBottom;

        const gridLines = [100, 80, 60, 40, 20, 0]
          .map(val => {
            const y = padTop + chartH - (val / 100) * chartH;
            return `
              <line x1="${padLeft}" y1="${y.toFixed(1)}" x2="${width - 8}" y2="${y.toFixed(1)}" stroke="#e2e8f0" stroke-width="1"/>
              <text x="${padLeft - 5}" y="${(y + 3).toFixed(1)}" text-anchor="end" font-size="9" fill="#94a3b8">${val}</text>
            `;
          })
          .join('');

        const slotW = chartW / pdfTop5.length;
        const barW = Math.min(34, slotW * 0.52);

        const bars = pdfTop5
          .map((op, idx) => {
            const centerX = padLeft + slotW * idx + slotW / 2;
            const barH = op.efficiency > 0 ? Math.max(3, (op.efficiency / 100) * chartH) : 2;
            const y = padTop + chartH - barH;
            const safeName = escapeHtml(op.name.length > 11 ? op.name.slice(0, 10) + '…' : op.name);

            return `
              <rect x="${(centerX - barW / 2).toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${barH.toFixed(1)}" rx="3" fill="#0f172a"/>
              <text x="${centerX.toFixed(1)}" y="${(y - 4).toFixed(1)}" text-anchor="middle" font-size="10" font-weight="800" fill="#1e293b">${op.efficiency}%</text>
              <text x="${centerX.toFixed(1)}" y="${height - 8}" text-anchor="middle" font-size="9.5" font-weight="600" fill="#475569">${safeName}</text>
            `;
          })
          .join('');

        return `<svg width="100%" height="${height}" viewBox="0 0 ${width} ${height}">${gridLines}${bars}</svg>`;
      };

      const rangeLabel =
        startSerial === endSerial
          ? `${MONTHS[pdfConfig.fromMonth]} ${pdfConfig.fromYear}`
          : `${MONTHS[pdfConfig.fromMonth]} ${pdfConfig.fromYear} – ${MONTHS[pdfConfig.toMonth]} ${pdfConfig.toYear}`;

      const generatedAt = new Date().toLocaleString('es-MX', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });

      const pieLegendHtml =
        kanbanDistribution.slices.length === 0
          ? `<span style="font-size:11px;color:#94a3b8;">Sin órdenes activas</span>`
          : kanbanDistribution.slices
              .map(
                s => `
                <div style="display:flex;align-items:center;gap:6px;font-size:11px;font-weight:700;color:#334155;">
                  <span style="width:10px;height:10px;border-radius:50%;background:${s.color};display:inline-block;"></span>
                  <span>${escapeHtml(s.label)}: ${s.count} (${s.percentage.toFixed(1)}%)</span>
                </div>`
              )
              .join('');

      const htmlReport = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <title>Reporte_CORMA_${escapeHtml(rangeLabel.replace(/\s+/g, '_'))}</title>
  <style>
    @page {
      size: letter portrait;
      margin: 14mm 14mm 16mm 14mm;
    }
    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    body {
      font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      color: #0f172a;
      margin: 0;
      padding: 0;
      background: #ffffff;
      font-size: 12px;
      line-height: 1.4;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 3px solid #0f172a;
      padding-bottom: 12px;
      margin-bottom: 18px;
    }
    .brand-title {
      font-size: 20px;
      font-weight: 900;
      letter-spacing: -0.02em;
      color: #0f172a;
      margin: 0;
    }
    .brand-sub {
      font-size: 11px;
      font-weight: 700;
      color: #ea580c;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-top: 2px;
    }
    .meta-box {
      text-align: right;
      font-size: 11px;
      color: #475569;
    }
    .meta-box strong {
      color: #0f172a;
    }
    .section {
      margin-bottom: 20px;
    }
    .section-title {
      font-size: 13px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: #0f172a;
      border-left: 4px solid #ea580c;
      padding-left: 8px;
      margin: 0 0 10px 0;
    }
    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 10px;
    }
    .kpi-card {
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 10px 12px;
      background: #f8fafc;
    }
    .kpi-label {
      font-size: 9.5px;
      font-weight: 800;
      color: #64748b;
      text-transform: uppercase;
      margin-bottom: 4px;
    }
    .kpi-value {
      font-size: 20px;
      font-weight: 900;
    }
    .kpi-unit {
      font-size: 11px;
      color: #64748b;
      font-weight: 600;
    }
    .alert-strip {
      margin-top: 8px;
      padding: 8px 12px;
      border-radius: 6px;
      background: #fef2f2;
      border: 1px solid #fecaca;
      font-size: 11px;
      color: #991b1b;
    }
    .charts-grid {
      display: grid;
      grid-template-columns: 1fr 1.25fr;
      gap: 12px;
      break-inside: avoid;
    }
    .chart-card {
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 12px;
      background: #ffffff;
    }
    .chart-card h4 {
      margin: 0 0 8px 0;
      font-size: 12px;
      font-weight: 800;
      color: #1e293b;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 11px;
    }
    th {
      background: #f1f5f9;
      color: #334155;
      font-weight: 800;
      text-transform: uppercase;
      font-size: 9.5px;
      letter-spacing: 0.03em;
      padding: 7px 8px;
      border-bottom: 2px solid #cbd5e1;
      text-align: left;
    }
    td {
      padding: 6px 8px;
      border-bottom: 1px solid #e2e8f0;
      vertical-align: middle;
    }
    tr {
      break-inside: avoid;
    }
    tr:nth-child(even) td {
      background: #f8fafc;
    }
    .badge {
      display: inline-block;
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 9px;
      font-weight: 800;
      text-transform: uppercase;
      background: #e2e8f0;
      color: #1e293b;
    }
    .footer {
      margin-top: 24px;
      padding-top: 8px;
      border-top: 1px solid #e2e8f0;
      display: flex;
      justify-content: space-between;
      font-size: 9.5px;
      color: #94a3b8;
    }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <h1 class="brand-title">CORMA · REPORTE OPERATIVO MES</h1>
      <div class="brand-sub">Mecanizados Metálicos Industriales CORMA S.A. de C.V.</div>
    </div>
    <div class="meta-box">
      <div>Período evaluado: <strong>${escapeHtml(rangeLabel)}</strong></div>
      <div>Fecha de emisión: <strong>${escapeHtml(generatedAt)}</strong></div>
    </div>
  </div>

  ${
    pdfConfig.includeSummary
      ? `
  <div class="section">
    <h2 class="section-title">1. Resumen General de Operaciones</h2>
    <div class="kpi-grid">
      <div class="kpi-card">
        <div class="kpi-label">Piezas Entregadas</div>
        <div><span class="kpi-value" style="color:#059669;">${pdfPiecesDelivered}</span> <span class="kpi-unit">unid.</span></div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Herramientas Prestadas</div>
        <div><span class="kpi-value" style="color:#0f172a;">${kpis.loanedTools}</span> <span class="kpi-unit">en mano</span></div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Máquinas Paradas</div>
        <div><span class="kpi-value" style="color:#dc2626;">${stoppedMachinesList.length}</span> <span class="kpi-unit">inactivas</span></div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Alertas de Inventario</div>
        <div><span class="kpi-value" style="color:#d97706;">${lowStockList.length}</span> <span class="kpi-unit">bajo mínimo</span></div>
      </div>
    </div>
    ${
  stoppedMachinesList.length > 0 || lowStockList.length > 0
    ? `<div class="alert-strip">
        ${
          stoppedMachinesList.length > 0
            ? `<div><strong>Máquinas detenidas:</strong> ${stoppedMachinesList.map(m => escapeHtml(getInventoryLabel(m))).join(', ')}</div>`
            : ''
        }
        ${
          lowStockList.length > 0
            ? `<div><strong>Insumos bajo mínimo:</strong> ${lowStockList.map(i => `${escapeHtml(getInventoryLabel(i))} (${i.quantity}/${i.minStock})`).join(', ')}</div>`
            : ''
        }
      </div>`
    : ''
}
  </div>`
      : ''
  }

  ${
    pdfConfig.includeCharts
      ? `
  <div class="section">
    <h2 class="section-title">2. Gráficas Visuales de Producción y Rendimiento</h2>
    <div class="charts-grid">
      <div class="chart-card">
        <h4>Distribución Actual del Kanban</h4>
        <div style="display:flex;align-items:center;gap:14px;">
          ${buildPieSvg()}
          <div style="display:flex;flex-direction:column;gap:6px;">
            ${pieLegendHtml}
          </div>
        </div>
      </div>
      <div class="chart-card">
        <h4>Top 5 Operadores (Eficiencia %)</h4>
        ${buildBarSvg()}
      </div>
    </div>
  </div>`
      : ''
  }

  ${
    pdfConfig.includeEfficiencyTable
      ? `
  <div class="section">
    <h2 class="section-title">3. Tabla de Eficiencia de Operadores</h2>
    <table>
      <thead>
        <tr>
          <th style="width:36px;">Pos.</th>
          <th>Operador</th>
          <th style="text-align:center;">Avanzados (+1%)</th>
          <th style="text-align:center;">Terminados (+5%)</th>
          <th style="text-align:center;">Herr. OK (+1%)</th>
          <th style="text-align:center;">Mat. Reg. (+1%)</th>
          <th style="text-align:center;">Rotas (-5%)</th>
          <th style="text-align:right;width:130px;">Eficiencia</th>
        </tr>
      </thead>
      <tbody>
        ${
          pdfOperatorMetrics.length === 0
            ? `<tr><td colspan="8" style="text-align:center;color:#94a3b8;padding:16px;">No hay operadores registrados.</td></tr>`
            : pdfOperatorMetrics
                .map(
                  (op, idx) => `
              <tr>
                <td style="font-weight:800;color:#64748b;">#${idx + 1}</td>
                <td style="font-weight:800;color:#0f172a;">${escapeHtml(op.name)}</td>
                <td style="text-align:center;">${op.avanzados}</td>
                <td style="text-align:center;">${op.terminados}</td>
                <td style="text-align:center;">${op.herramientasOk}</td>
                <td style="text-align:center;">${op.matReg}</td>
                <td style="text-align:center;color:${op.rotas > 0 ? '#dc2626' : '#64748b'};font-weight:${op.rotas > 0 ? '800' : '400'};">${op.rotas}</td>
                <td style="text-align:right;">
                  <div style="display:inline-flex;align-items:center;gap:6px;">
                    <div style="width:55px;height:6px;background:#e2e8f0;border-radius:99px;overflow:hidden;">
                      <div style="width:${op.efficiency}%;height:100%;background:#0f172a;"></div>
                    </div>
                    <strong style="color:#0f172a;font-size:12px;">${op.efficiency}%</strong>
                  </div>
                </td>
              </tr>`
                )
                .join('')
        }
      </tbody>
    </table>
    <div style="font-size:9.5px;color:#64748b;margin-top:5px;">
      * Cálculo de eficiencia: +1% por etapa avanzada en Kanban, +5% por orden terminada, +1% por herramienta devuelta en buen estado, +1% por registro de material y -5% por herramienta dañada (rango 0% a 100%).
    </div>
  </div>`
      : ''
  }

  ${
    pdfConfig.includeLogs && (pdfConfig.logKanban || pdfConfig.logInventoryTools || pdfConfig.logOther)
      ? `
  <div class="section">
    <h2 class="section-title">4. Bitácora de Movimientos (${filteredLogs.length} registros)</h2>
    <table>
      <thead>
        <tr>
          <th style="width:110px;">Fecha / Hora</th>
          <th style="width:95px;">Módulo</th>
          <th style="width:125px;">Acción</th>
          <th>Detalle del Evento</th>
          <th style="width:120px;">Responsable</th>
        </tr>
      </thead>
      <tbody>
        ${
          filteredLogs.length === 0
            ? `<tr><td colspan="5" style="text-align:center;color:#94a3b8;padding:16px;">No se registraron movimientos en los módulos seleccionados para este período.</td></tr>`
            : filteredLogs
                .map(log => {
                  const mod = (log.module || 'SISTEMA').toUpperCase();
                  const dateStr = log.timestamp
                    ? new Date(log.timestamp).toLocaleString('es-MX', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })
                    : '-';

                  return `
                  <tr>
                    <td style="font-family:monospace;font-size:10px;color:#475569;">${escapeHtml(dateStr)}</td>
                    <td><span class="badge">${escapeHtml(mod)}</span></td>
                    <td style="font-weight:700;color:#1e293b;">${escapeHtml(log.action || '')}</td>
                    <td style="color:#334155;">${escapeHtml(log.detail || '')}</td>
                    <td style="font-weight:600;color:#0f172a;">${escapeHtml(log.operator || 'Sistema')}</td>
                  </tr>`;
                })
                .join('')
        }
      </tbody>
    </table>
  </div>`
      : ''
  }

  <div class="footer">
    <span>CORMA MES · Sistema Integral de Control de Planta</span>
    <span>Reporte confidencial de uso interno</span>
  </div>
</body>
</html>`;

      const previousTitle = document.title;
      document.title = `Reporte_CORMA_${rangeLabel.replace(/\s+/g, '_')}`;

      const iframe = document.createElement('iframe');
      iframe.style.position = 'fixed';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = '0';
      document.body.appendChild(iframe);

      const frameDoc = iframe.contentWindow?.document;
      if (frameDoc && iframe.contentWindow) {
        frameDoc.open();
        frameDoc.write(htmlReport);
        frameDoc.close();

        setTimeout(() => {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
          setTimeout(() => {
            document.title = previousTitle;
            if (document.body.contains(iframe)) {
              document.body.removeChild(iframe);
            }
          }, 1000);
        }, 250);
      }

      setIsPdfModalOpen(false);
    } catch (error: any) {
      console.error('Error al generar reporte PDF:', error);
      setPdfError(`No se pudo generar el reporte: ${error.message || 'Error desconocido'}`);
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const renderPieSlices = () => {
    const { total, slices } = kanbanDistribution;
    const cx = 110;
    const cy = 110;
    const r = 92;

    if (total === 0) {
      return (
        <g>
          <circle cx={cx} cy={cy} r={r} fill="#e2e8f0" />
          <text x={cx} y={cy + 4} textAnchor="middle" className="text-xs fill-slate-500 font-bold">
            Sin órdenes activas
          </text>
        </g>
      );
    }

    if (slices.length === 1) {
      const only = slices[0];
      return (
        <g
          className="cursor-pointer transition-opacity hover:opacity-95"
          onMouseEnter={() =>
            setHoveredSlice({
              label: only.label,
              count: only.count,
              percentage: '100.00%',
              color: only.color
            })
          }
          onMouseLeave={() => setHoveredSlice(null)}
        >
          <circle cx={cx} cy={cy} r={r} fill={only.color} />
          <line x1={cx} y1={cy} x2={cx + r * 0.7} y2={cy - r * 0.7} stroke="#ffffff" strokeWidth="1.5" />
          <text
            x={cx - 26}
            y={cy + 26}
            textAnchor="middle"
            fill="#ffffff"
            className="text-xs font-black select-none"
          >
            {only.count}
          </text>
        </g>
      );
    }

    let cumulativeAngle = -Math.PI / 4;
    return slices.map(slice => {
      const sliceAngle = (slice.count / total) * 2 * Math.PI;
      const startAngle = cumulativeAngle;
      const endAngle = cumulativeAngle + sliceAngle;
      cumulativeAngle = endAngle;

      const x1 = cx + r * Math.cos(startAngle);
      const y1 = cy + r * Math.sin(startAngle);
      const x2 = cx + r * Math.cos(endAngle);
      const y2 = cy + r * Math.sin(endAngle);
      const largeArcFlag = sliceAngle > Math.PI ? 1 : 0;

      const midAngle = startAngle + sliceAngle / 2;
      const labelX = cx + r * 0.55 * Math.cos(midAngle);
      const labelY = cy + r * 0.55 * Math.sin(midAngle);

      const pathData = [
        `M ${cx} ${cy}`,
        `L ${x1} ${y1}`,
        `A ${r} ${r} 0 ${largeArcFlag} 1 ${x2} ${y2}`,
        'Z'
      ].join(' ');

      return (
        <g
          key={slice.statusKey}
          className="cursor-pointer transition-opacity hover:opacity-90"
          onMouseEnter={() =>
            setHoveredSlice({
              label: slice.label,
              count: slice.count,
              percentage: `${slice.percentage.toFixed(2)}%`,
              color: slice.color
            })
          }
          onMouseLeave={() => setHoveredSlice(null)}
        >
          <path d={pathData} fill={slice.color} stroke="#ffffff" strokeWidth="1.5" />
          <text
            x={labelX}
            y={labelY + 4}
            textAnchor="middle"
            fill="#ffffff"
            className="text-xs font-black select-none pointer-events-none"
          >
            {slice.count}
          </text>
        </g>
      );
    });
  };

  return (
    <div className="flex flex-col gap-4 select-none pb-4">
      {/* ENCABEZADO SUPERIOR Y CONTROLES DE PERÍODO */}
      <div className="flex flex-wrap justify-between items-center gap-4">
        <div>
          <h2 className="text-base font-black text-slate-900 tracking-tight uppercase">
            Resumen Operativo
          </h2>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            Mostrando métricas de {MONTHS[selectedMonth]} {selectedYear}
            {isLoading && <span className="ml-2 text-slate-700 font-bold">· Actualizando...</span>}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap print:hidden">
          <select
            value={selectedMonth}
            onChange={e => setSelectedMonth(Number(e.target.value))}
            className="border border-gray-300 rounded-md px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white outline-none focus:ring-2 focus:ring-slate-800 cursor-pointer"
          >
            {MONTHS.map((m, idx) => (
              <option key={m} value={idx}>
                {m}
              </option>
            ))}
          </select>

          <select
            value={selectedYear}
            onChange={e => setSelectedYear(Number(e.target.value))}
            className="border border-gray-300 rounded-md px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white outline-none focus:ring-2 focus:ring-slate-800 cursor-pointer"
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

          <button
            type="button"
            onClick={handleOpenPdfModal}
            className="bg-slate-900 hover:bg-slate-800 text-white rounded-md px-3.5 py-1.5 text-xs font-bold transition cursor-pointer shadow-xs"
          >
            Exportar PDF
          </button>
        </div>
      </div>

      {/* FILA 1: 4 TARJETAS KPI */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-2xs">
          <span className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">
            PIEZAS ENTREGADAS EN PERÍODO
          </span>
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-black text-emerald-700">{kpis.piecesDelivered}</span>
            <span className="text-xs text-slate-400 font-medium">unid.</span>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-2xs">
          <span className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">
            HERRAMIENTAS PRESTADAS
          </span>
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-black text-slate-900">{kpis.loanedTools}</span>
            <span className="text-xs text-slate-400 font-medium">en mano</span>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-2xs">
          <span className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">
            MÁQUINAS PARADAS
          </span>
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-black text-red-600">{kpis.stoppedMachines}</span>
            <span className="text-xs text-slate-400 font-medium">inactivas</span>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-2xs">
          <span className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">
            ALERTAS DE INVENTARIO
          </span>
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-black text-amber-600">{kpis.lowStockAlerts}</span>
            <span className="text-xs text-slate-400 font-medium">bajo mínimo</span>
          </div>
        </div>
      </div>

      {/* FILA 2: DISTRIBUCIÓN DEL KANBAN + TOP 5 OPERADORES */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-5 bg-white border border-gray-200 rounded-lg p-5 shadow-2xs flex flex-col justify-between relative">
          <h2 className="text-sm font-black text-slate-800 mb-2">Distribución del Kanban</h2>

          <div className="flex-1 flex flex-col items-center justify-center relative my-1">
            <svg viewBox="0 0 220 220" className="w-52 h-52 overflow-visible">
              {renderPieSlices()}
            </svg>

            {(hoveredSlice || kanbanDistribution.slices.length === 1) && (
              <div className="absolute right-4 top-1/2 -translate-y-1/2 bg-white/95 border border-gray-200 shadow-md rounded px-3 py-1.5 flex items-center gap-2 text-xs pointer-events-none">
                <span
                  className="w-2.5 h-2.5 rounded-full inline-block shrink-0"
                  style={{
                    backgroundColor: (hoveredSlice || kanbanDistribution.slices[0]).color
                  }}
                />
                <span className="font-bold text-slate-700">
                  {(hoveredSlice || kanbanDistribution.slices[0]).label}
                </span>
                <span className="font-semibold text-slate-600">
                  {(hoveredSlice || kanbanDistribution.slices[0]).count}
                </span>
                <span className="font-black text-slate-900">
                  {hoveredSlice
                    ? hoveredSlice.percentage
                    : `${kanbanDistribution.slices[0].percentage.toFixed(2)}%`}
                </span>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-center gap-4 pt-2">
            {kanbanDistribution.slices.length === 0 ? (
              <span className="text-[11px] text-slate-400 font-medium">Sin tareas activas en tablero</span>
            ) : (
              kanbanDistribution.slices.map(slice => (
                <div key={slice.statusKey} className="flex items-center gap-1.5 text-[11px] font-bold text-slate-700">
                  <span
                    className="w-2.5 h-2.5 rounded-full inline-block"
                    style={{ backgroundColor: slice.color }}
                  />
                  <span>{slice.label}</span>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="lg:col-span-7 bg-white border border-gray-200 rounded-lg p-5 shadow-2xs flex flex-col">
          <h2 className="text-sm font-black text-slate-800 mb-4">Top 5 Operadores (Eficiencia %)</h2>

          <div className="flex-1 flex flex-col justify-end pt-4">
            <div className="relative h-[180px] ml-8 mr-4 mb-6 border-b border-gray-200 flex items-end">
              {[100, 80, 60, 40, 20, 0].map(tick => (
                <div
                  key={tick}
                  className="absolute -left-8 right-0 flex items-center pointer-events-none"
                  style={{ bottom: `${tick}%`, transform: 'translateY(50%)' }}
                >
                  <span className="w-7 text-right pr-2 text-[10px] font-medium text-slate-400">
                    {tick}
                  </span>
                  <div className="flex-1 border-t border-gray-100" />
                </div>
              ))}

              {top5Operators.length === 0 ? (
                <div className="w-full text-center text-xs text-slate-400 italic py-12 z-10">
                  No hay operadores registrados.
                </div>
              ) : (
                <div className="w-full h-full grid grid-flow-col auto-cols-fr gap-4 items-end z-10 px-4">
                  {top5Operators.map(op => (
                    <div key={op.id} className="h-full flex flex-col justify-end items-center relative group">
                      <div className="absolute inset-y-0 w-px bg-gray-100 -z-10" />

                      <span className="text-[11px] font-black text-slate-800 mb-1">
                        {op.efficiency}%
                      </span>

                      <div
                        className="w-12 max-w-[70%] bg-slate-800 group-hover:bg-orange-600 rounded-t transition-colors duration-300"
                        style={{
                          height: op.efficiency > 0 ? `${op.efficiency}%` : '2px'
                        }}
                        title={`${op.name}: ${op.efficiency}% eficiencia`}
                      />

                      <span className="absolute -bottom-6 text-[11px] font-medium text-slate-500 truncate max-w-[90px] text-center">
                        {op.name}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* FILA 3: TABLA DE POSICIONES + MOVIMIENTOS DEL PERÍODO */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-8 bg-white border border-gray-200 rounded-lg p-5 shadow-2xs flex flex-col">
          <h2 className="text-sm font-black text-slate-800 mb-4">Tabla de posiciones del Período</h2>

          <div className="space-y-2.5 flex-1">
            {operatorMetrics.length === 0 ? (
              <p className="text-xs text-slate-400 italic py-8 text-center">
                No hay operadores registrados para evaluar en este período.
              </p>
            ) : (
              operatorMetrics.map(op => (
                <div
                  key={op.id}
                  className="border border-gray-200 rounded-lg px-5 py-3.5 bg-white hover:bg-slate-50 transition flex justify-between items-center gap-4"
                >
                  <div className="min-w-0">
                    <h3 className="text-sm font-black text-slate-900 truncate">{op.name}</h3>
                    <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                      Avanzados: {op.avanzados} | Terminados: {op.terminados} | Herr. OK: {op.herramientasOk} | Mat. Reg: {op.matReg} | Rotas: {op.rotas}
                    </p>
                  </div>

                  <span className="text-lg font-black text-slate-900 shrink-0">
                    {op.efficiency}%
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="lg:col-span-4 bg-white border border-gray-200 rounded-lg p-5 shadow-2xs flex flex-col justify-between">
          <div>
            <h2 className="text-sm font-black text-slate-800 mb-3">Movimientos del Período</h2>

            <div className="space-y-2.5 max-h-[330px] overflow-y-auto pr-1">
              {periodLogs.length === 0 ? (
                <p className="text-xs text-slate-400 italic py-10 text-center">
                  Sin movimientos registrados en {MONTHS[selectedMonth]} {selectedYear}.
                </p>
              ) : (
                periodLogs.slice(0, 20).map(log => (
                  <div
                    key={log.id}
                    className="border border-gray-200 rounded-md p-2.5 bg-slate-50/60 hover:bg-slate-50 transition"
                  >
                    <span className="block text-[10px] font-black text-slate-700 uppercase tracking-wide">
                      {log.action}
                    </span>
                    <p
                      className="text-xs font-medium text-slate-800 truncate my-0.5"
                      title={log.detail}
                    >
                      {log.detail}
                    </p>
                    <span className="block text-[10px] text-slate-500 font-medium">
                      Op: {log.operator}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={onNavigateToHistorial}
            className="w-full mt-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs rounded border border-gray-300 transition cursor-pointer print:hidden"
          >
            Ver Historial Completo
          </button>
        </div>
      </div>

      {/* MODAL: CONFIGURACIÓN DE REPORTE PDF */}
      {isPdfModalOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-fadeIn"
          onClick={() => !isGeneratingPdf && setIsPdfModalOpen(false)}
        >
          <div
            className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden animate-scaleUp p-6"
            onClick={e => e.stopPropagation()}
          >
            <div className="mb-5 border-b border-gray-100 pb-3">
              <h3 className="text-base font-black text-slate-900 tracking-tight uppercase">
                Configuración de Reporte PDF
              </h3>
            </div>

            {/* 1. RANGO DEL REPORTE */}
            <div className="mb-5">
              <h4 className="text-xs font-black text-slate-700 uppercase tracking-wide mb-2">
                1. Rango del Reporte
              </h4>
              <div className="flex flex-wrap items-center gap-3">
                <div>
                  <span className="block text-[11px] text-slate-500 font-semibold mb-1">Desde:</span>
                  <div className="flex items-center gap-1.5">
                    <select
                      value={pdfConfig.fromMonth}
                      onChange={e =>
                        setPdfConfig(prev => ({ ...prev, fromMonth: Number(e.target.value) }))
                      }
                      className="border border-gray-300 rounded px-2.5 py-1.5 text-xs font-medium text-slate-800 bg-white outline-none focus:ring-2 focus:ring-slate-800 cursor-pointer"
                    >
                      {MONTHS.map((m, idx) => (
                        <option key={m} value={idx}>
                          {m}
                        </option>
                      ))}
                    </select>
                    <select
                      value={pdfConfig.fromYear}
                      onChange={e =>
                        setPdfConfig(prev => ({ ...prev, fromYear: Number(e.target.value) }))
                      }
                      className="border border-gray-300 rounded px-2.5 py-1.5 text-xs font-medium text-slate-800 bg-white outline-none focus:ring-2 focus:ring-slate-800 cursor-pointer"
                    >
                      {availableYears.map(yr => (
                        <option key={yr} value={yr}>
                          {yr}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <span className="text-slate-400 font-bold mt-4">-</span>

                <div>
                  <span className="block text-[11px] text-slate-500 font-semibold mb-1">Hasta:</span>
                  <div className="flex items-center gap-1.5">
                    <select
                      value={pdfConfig.toMonth}
                      onChange={e =>
                        setPdfConfig(prev => ({ ...prev, toMonth: Number(e.target.value) }))
                      }
                      className="border border-gray-300 rounded px-2.5 py-1.5 text-xs font-medium text-slate-800 bg-white outline-none focus:ring-2 focus:ring-slate-800 cursor-pointer"
                    >
                      {MONTHS.map((m, idx) => (
                        <option key={m} value={idx}>
                          {m}
                        </option>
                      ))}
                    </select>
                    <select
                      value={pdfConfig.toYear}
                      onChange={e =>
                        setPdfConfig(prev => ({ ...prev, toYear: Number(e.target.value) }))
                      }
                      className="border border-gray-300 rounded px-2.5 py-1.5 text-xs font-medium text-slate-800 bg-white outline-none focus:ring-2 focus:ring-slate-800 cursor-pointer"
                    >
                      {availableYears.map(yr => (
                        <option key={yr} value={yr}>
                          {yr}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            </div>

            {/* 2. CONTENIDO A INCLUIR */}
            <div className="mb-5">
              <h4 className="text-xs font-black text-slate-700 uppercase tracking-wide mb-2">
                2. Contenido a Incluir
              </h4>

              <div className="bg-slate-50 border border-gray-200 rounded-lg p-4 space-y-2.5">
                <label className="flex items-center gap-2.5 cursor-pointer text-xs font-bold text-slate-800">
                  <input
                    type="checkbox"
                    checked={pdfConfig.includeSummary}
                    onChange={e =>
                      setPdfConfig(prev => ({ ...prev, includeSummary: e.target.checked }))
                    }
                    className="w-4 h-4 rounded accent-slate-900 cursor-pointer"
                  />
                  <span>Resumen General (Piezas, Inventario, Máquinas)</span>
                </label>

                <label className="flex items-center gap-2.5 cursor-pointer text-xs font-bold text-slate-800">
                  <input
                    type="checkbox"
                    checked={pdfConfig.includeCharts}
                    onChange={e =>
                      setPdfConfig(prev => ({ ...prev, includeCharts: e.target.checked }))
                    }
                    className="w-4 h-4 rounded accent-slate-900 cursor-pointer"
                  />
                  <span>Gráficas Visuales (Pastel y Barras de Rendimiento)</span>
                </label>

                <label className="flex items-center gap-2.5 cursor-pointer text-xs font-bold text-slate-800">
                  <input
                    type="checkbox"
                    checked={pdfConfig.includeEfficiencyTable}
                    onChange={e =>
                      setPdfConfig(prev => ({ ...prev, includeEfficiencyTable: e.target.checked }))
                    }
                    className="w-4 h-4 rounded accent-slate-900 cursor-pointer"
                  />
                  <span>Tabla de Eficiencia de Operadores</span>
                </label>

                <div className="pt-0.5">
                  <label className="flex items-center gap-2.5 cursor-pointer text-xs font-bold text-slate-800">
                    <input
                      type="checkbox"
                      checked={pdfConfig.includeLogs}
                      onChange={e => {
                        const checked = e.target.checked;
                        setPdfConfig(prev => ({
                          ...prev,
                          includeLogs: checked,
                          logKanban: checked,
                          logInventoryTools: checked,
                          logOther: checked
                        }));
                      }}
                      className="w-4 h-4 rounded accent-slate-900 cursor-pointer"
                    />
                    <span>Bitácora de Movimientos (Selecciona los módulos):</span>
                  </label>

                  <div className="pl-6 mt-2 space-y-2">
                    <label className="flex items-center gap-2.5 cursor-pointer text-xs font-medium text-slate-600">
                      <input
                        type="checkbox"
                        checked={pdfConfig.logKanban}
                        onChange={e => {
                          const checked = e.target.checked;
                          setPdfConfig(prev => {
                            const next = { ...prev, logKanban: checked };
                            next.includeLogs =
                              next.logKanban || next.logInventoryTools || next.logOther;
                            return next;
                          });
                        }}
                        className="w-3.5 h-3.5 rounded accent-slate-800 cursor-pointer"
                      />
                      <span>Solo Trabajos y Avances (Kanban)</span>
                    </label>

                    <label className="flex items-center gap-2.5 cursor-pointer text-xs font-medium text-slate-600">
                      <input
                        type="checkbox"
                        checked={pdfConfig.logInventoryTools}
                        onChange={e => {
                          const checked = e.target.checked;
                          setPdfConfig(prev => {
                            const next = { ...prev, logInventoryTools: checked };
                            next.includeLogs =
                              next.logKanban || next.logInventoryTools || next.logOther;
                            return next;
                          });
                        }}
                        className="w-3.5 h-3.5 rounded accent-slate-800 cursor-pointer"
                      />
                      <span>Consumos de Inventario, Catálogo y Herramientas</span>
                    </label>

                    <label className="flex items-center gap-2.5 cursor-pointer text-xs font-medium text-slate-600">
                      <input
                        type="checkbox"
                        checked={pdfConfig.logOther}
                        onChange={e => {
                          const checked = e.target.checked;
                          setPdfConfig(prev => {
                            const next = { ...prev, logOther: checked };
                            next.includeLogs =
                              next.logKanban || next.logInventoryTools || next.logOther;
                            return next;
                          });
                        }}
                        className="w-3.5 h-3.5 rounded accent-slate-800 cursor-pointer"
                      />
                      <span>Otros Eventos (Sistema, RH, Auditoría)</span>
                    </label>
                  </div>
                </div>
              </div>
            </div>

            {pdfError && (
              <div className="mb-4 px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-xs font-bold text-red-700">
                {pdfError}
              </div>
            )}

            <div className="flex justify-end items-center gap-2.5 pt-2">
              <button
                type="button"
                disabled={isGeneratingPdf}
                onClick={() => setIsPdfModalOpen(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded border border-gray-300 transition cursor-pointer disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isGeneratingPdf}
                onClick={handleGenerateAndDownloadPdf}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded shadow-xs transition cursor-pointer disabled:opacity-60"
              >
                {isGeneratingPdf ? 'Generando...' : 'Generar y Descargar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};