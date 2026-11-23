import { WorkOrder } from '../../domain/entities/WorkOrder';
import type { IWorkOrderRepository } from '../../application/interfaces/IWorkOrderRepository';

export class InMemoryWorkOrderRepository implements IWorkOrderRepository {
  // Simulamos una tabla de base de datos
  private database: WorkOrder[] = [];

  public async save(workOrder: WorkOrder): Promise<void> {
    this.database.push(workOrder);
    console.log("Base de datos en memoria actualizada:", this.database);
  }

  public async findById(id: string): Promise<WorkOrder | null> {
    const order = this.database.find(o => o.id === id);
    return order || null;
  }
  
  // NUEVA FUNCIÓN PARA CUMPLIR EL CONTRATO
  public async getAll(): Promise<WorkOrder[]> {
    return this.database;
  }

  public async delete(id: string): Promise<void> {
    this.database = this.database.filter(o => o.id !== id);
  }

}