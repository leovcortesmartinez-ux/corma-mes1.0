import { User } from '../../domain/entities/User';

export interface IUserRepository {
  findByName(name: string): Promise<User | null>;
  getAll(): Promise<User[]>;
}