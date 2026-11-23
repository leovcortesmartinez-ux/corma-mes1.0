import { InventoryItem, type ItemCategory } from '../../domain/entities/InventoryItem';
import type { IInventoryRepository } from '../../application/interfaces/IInventoryRepository';
import { db } from '../../infrastructure/database/firebase';
import { collection, doc, setDoc, getDoc, getDocs, deleteDoc } from 'firebase/firestore';

export class FirestoreInventoryRepository implements IInventoryRepository {
  
  public async save(item: InventoryItem): Promise<void> {
    const docRef = doc(db, 'inventory', item.id);
    await setDoc(docRef, {
      id: item.id,
      category: item.category,
      code: item.code,
      description: item.description,
      quantity: item.quantity,
      unit: item.unit,
      status: item.status,
      minStock: item.minStock,
      lifePercentage: item.lifePercentage ?? 100,
      unitLives: item.unitLives ?? []
    });
  }

  public async findById(id: string): Promise<InventoryItem | null> {
    const docRef = doc(db, 'inventory', id);
    const snapshot = await getDoc(docRef);
    if (!snapshot.exists()) return null;
    
    const data = snapshot.data();
    return new InventoryItem(
      data.id || snapshot.id,
      data.category as ItemCategory,
      data.code,
      data.description,
      data.quantity || 0,
      data.unit || '',
      data.status || 'OK',
      data.minStock || 0,
      data.lifePercentage ?? 100,
      Array.isArray(data.unitLives) ? data.unitLives : undefined
    );
  }

  public async getAll(): Promise<InventoryItem[]> {
    const snapshot = await getDocs(collection(db, 'inventory'));
    return snapshot.docs.map(docSnap => {
      const data = docSnap.data();
      return new InventoryItem(
        data.id || docSnap.id,
        data.category as ItemCategory,
        data.code,
        data.description,
        data.quantity || 0,
        data.unit || '',
        data.status || 'OK',
        data.minStock || 0,
        data.lifePercentage ?? 100,
        Array.isArray(data.unitLives) ? data.unitLives : undefined
      );
    });
  }

  public async delete(id: string): Promise<void> {
    const docRef = doc(db, 'inventory', id);
    await deleteDoc(docRef);
  }
}