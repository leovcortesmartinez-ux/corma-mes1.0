import { WorkOrder } from '../../domain/entities/WorkOrder';

export interface IWorkOrderRepository {
  save(workOrder: WorkOrder): Promise<void>;
  findById(id: string): Promise<WorkOrder | null>;
  getAll(): Promise<WorkOrder[]>;
  delete(id: string): Promise<void>; // <--- Nueva función
}