import { WorkOrder, type Priority } from '../../domain/entities/WorkOrder';
import type { IWorkOrderRepository } from '../interfaces/IWorkOrderRepository';

export interface CreateWorkOrderDTO {
  partName: string;
  client: string;
  description: string;
  dueDate: string;
  priority: Priority;
  assignedOperators: string[];
  materialType: string;
  quantity: number;
  customerPhone?: string;
  customerEmail?: string; // 👈 Asegúrate de agregarlo aquí
}

export class CreateWorkOrderUseCase {
  // Solución al error erasableSyntaxOnly
  private workOrderRepository: IWorkOrderRepository;

  constructor(workOrderRepository: IWorkOrderRepository) {
    this.workOrderRepository = workOrderRepository;
  }

  public async execute(dto: CreateWorkOrderDTO): Promise<WorkOrder> {
    if (!dto.customerPhone || dto.customerPhone.trim() === '') {
      throw new Error("BR-01: Toda orden de trabajo debe incluir un número de contacto válido.");
    }

    const newId = `WO-${Math.floor(Math.random() * 10000)}`;
    const newOrder = new WorkOrder(
      newId,
      dto.partName,
      dto.materialType,
      dto.quantity,
      'Pendiente', 
      dto.customerPhone,
      dto.customerEmail,
      dto.client,
      dto.description,
      dto.dueDate,
      dto.priority,
      dto.assignedOperators
    );

    await this.workOrderRepository.save(newOrder);
    return newOrder;
  }
}