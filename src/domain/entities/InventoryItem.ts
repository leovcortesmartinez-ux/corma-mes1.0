export type ItemCategory = 'Herramientas' | 'Materiales' | 'Máquinas';

export class InventoryItem {
  public id: string;
  public category: ItemCategory;
  public code: string;
  public description: string;
  public quantity: number;
  public unit: string;
  public status: string;
  public minStock: number;
  public lifePercentage: number = 100; // Vida útil más alta disponible (0 a 100%)
  public unitLives: number[];     // Vida útil individual por cada unidad en stock

  constructor(
    id: string,
    category: ItemCategory,
    code: string,
    description: string,
    quantity: number,
    unit: string,
    status: string,
    minStock: number,
    lifePercentage: number = 100,
    unitLives?: number[]
  ) {
    if (lifePercentage < 0 || lifePercentage > 100) {
      throw new Error('RN-16: La vida útil de una herramienta debe estar entre 0% y 100%.');
    }

    this.id = id;
    this.category = category;
    this.code = code;
    this.description = description;
    this.quantity = Math.max(0, quantity);
    this.unit = unit;
    this.status = status;
    this.minStock = minStock;

    if (category === 'Herramientas') {
      if (Array.isArray(unitLives)) {
        this.unitLives = unitLives.map(v => Math.max(0, Math.min(100, Math.round(v))));
      } else {
        // Compatibilidad con registros anteriores: crea una vida independiente por cada pieza
        const initialLife = this.quantity > 0 ? Math.max(0, Math.min(100, Math.round(lifePercentage))) : 0;
        this.unitLives = Array.from({ length: this.quantity }, () => initialLife);
      }
      this.syncFromUnitLives();
    } else {
      this.unitLives = [];
      this.lifePercentage = Math.round(lifePercentage);
    }
  }

  // Mantiene sincronizados quantity y lifePercentage con las unidades individuales
  public syncFromUnitLives(): void {
    if (this.category !== 'Herramientas') return;
    this.unitLives.sort((a, b) => b - a); // Ordena de mayor a menor vida útil
    this.quantity = this.unitLives.length;
    this.lifePercentage = this.unitLives.length > 0 ? this.unitLives[0] : 0;
  }

  // Check-Out: Saca una unidad específica del stock y devuelve su vida útil actual
  public checkoutUnit(unitIndex: number = 0): number {
    if (this.category !== 'Herramientas' || this.unitLives.length === 0) {
      throw new Error('No hay unidades disponibles para prestar.');
    }
    const safeIndex = Math.max(0, Math.min(this.unitLives.length - 1, unitIndex));
    const [loanedLife] = this.unitLives.splice(safeIndex, 1);
    this.syncFromUnitLives();
    return loanedLife;
  }

  // Check-In: Aplica desgaste a la unidad devuelta. Si llega a 0% o está rota, se da de baja del stock
  public checkinUnit(
    previousLife: number,
    wearPercentage: number,
    isBroken: boolean
  ): { remainingLife: number; discarded: boolean } {
    if (wearPercentage < 0) {
      throw new Error('El porcentaje de desgaste no puede ser negativo.');
    }

    const remainingLife = isBroken
      ? 0
      : Math.max(0, Math.min(100, Math.round(previousLife - wearPercentage)));

    if (remainingLife <= 0) {
      // Llegó a 0% o se rompió: NO regresa al stock (se descuenta esa unidad)
      this.syncFromUnitLives();
      return { remainingLife: 0, discarded: true };
    }

    // Reingresa al stock con su vida útil actualizada
    this.unitLives.push(remainingLife);
    this.syncFromUnitLives();
    return { remainingLife, discarded: false };
  }

  // UC-19: Descuenta desgaste a la herramienta activa al terminar una O.T. en Kanban
  public applyWear(wearPercentage: number): { remainingLife: number; discarded: boolean } {
    if (wearPercentage < 0) {
      throw new Error('El porcentaje de desgaste no puede ser negativo.');
    }

    if (this.category === 'Herramientas') {
      if (this.unitLives.length === 0) {
        return { remainingLife: 0, discarded: true };
      }
      const nextLife = Math.max(0, Math.min(100, Math.round(this.unitLives[0] - wearPercentage)));
      if (nextLife <= 0) {
        this.unitLives.shift(); // Elimina solo la unidad que llegó a 0%
        this.syncFromUnitLives();
        return { remainingLife: 0, discarded: true };
      }
      this.unitLives[0] = nextLife;
      this.syncFromUnitLives();
      return { remainingLife: nextLife, discarded: false };
    }

    this.lifePercentage = Math.max(0, Math.min(100, Math.round(this.lifePercentage - wearPercentage)));
    return { remainingLife: this.lifePercentage, discarded: this.lifePercentage <= 0 };
  }

  public get displayQuantity(): string {
    if (this.category === 'Máquinas') return this.status;
    return `${this.quantity} ${this.unit}`;
  }

  public get displayExtraDetail(): string {
    if (this.category === 'Máquinas') return '';
    if (this.category === 'Herramientas') {
      if (this.unitLives.length > 1) {
        return `Mín: ${this.minStock} • Vidas: ${this.unitLives.map(v => `${v}%`).join(', ')}`;
      }
      return `Mínimo: ${this.minStock} • Vida: ${this.lifePercentage}%`;
    }
    return `Mínimo: ${this.minStock}`;
  }
}