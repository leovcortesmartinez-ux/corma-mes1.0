import { WorkOrder, type WorkOrderStatus, type Priority } from '../../domain/entities/WorkOrder';
import type { IWorkOrderRepository } from '../../application/interfaces/IWorkOrderRepository';
import { db } from '../../infrastructure/database/firebase';
import { collection, doc, setDoc, getDoc, getDocs, deleteDoc} from 'firebase/firestore';

export class FirestoreWorkOrderRepository implements IWorkOrderRepository {
  public async save(workOrder: WorkOrder): Promise<void> {
    const docRef = doc(db, 'workOrders', workOrder.id);
    await setDoc(docRef, {
      id: workOrder.id,
      partName: workOrder.partName,
      materialType: workOrder.materialType,
      quantity: workOrder.quantity,
      status: workOrder.status,
      customerPhone: workOrder.customerPhone || null,
      customerEmail: workOrder.customerEmail || null, // 👈 Revisa que sea exactamente esta propiedad
      client: workOrder.client,
      description: workOrder.description,
      dueDate: workOrder.dueDate,
      priority: workOrder.priority,
      assignedOperators: workOrder.assignedOperators
    });
  }

  public async findById(id: string): Promise<WorkOrder | null> {
    const docRef = doc(db, 'workOrders', id);
    const snapshot = await getDoc(docRef);
    if (!snapshot.exists()) return null;
    
    const data = snapshot.data();
    return new WorkOrder(
      data.id, 
      data.partName, 
      data.materialType, 
      data.quantity, 
      data.status as WorkOrderStatus, 
      data.customerPhone || undefined, 
      data.customerEmail || undefined, // 👈 Evita que pase un 'null' plano
      data.client, 
      data.description, 
      data.dueDate, 
      data.priority as Priority, 
      data.assignedOperators || []
    );
  }

  public async getAll(): Promise<WorkOrder[]> {
    const snapshot = await getDocs(collection(db, 'workOrders'));
    return snapshot.docs.map(docSnap => {
      const data = docSnap.data();
      return new WorkOrder(
        data.id, 
        data.partName, 
        data.materialType, 
        data.quantity, 
        data.status as WorkOrderStatus, 
        data.customerPhone || undefined, 
        data.customerEmail || undefined, // 👈 Evita que pase un 'null' plano
        data.client, 
        data.description, 
        data.dueDate, 
        data.priority as Priority, 
        data.assignedOperators || []
      );
    });
  }

  public async delete(id: string): Promise<void> {
    const docRef = doc(db, 'workOrders', id);
    await deleteDoc(docRef);
  }
  
}