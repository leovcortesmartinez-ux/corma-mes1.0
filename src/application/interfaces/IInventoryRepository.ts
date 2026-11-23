import { InventoryItem } from '../../domain/entities/InventoryItem';

export interface IInventoryRepository {
  getAll(): Promise<InventoryItem[]>;
  findById(id: string): Promise<InventoryItem | null>;
  save(item: InventoryItem): Promise<void>;
  delete(id: string): Promise<void>;
}