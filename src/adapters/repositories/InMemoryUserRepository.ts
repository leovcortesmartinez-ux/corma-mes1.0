import { User } from '../../domain/entities/User';
import type { IUserRepository } from '../../application/interfaces/IUserRepository';

export class InMemoryUserRepository implements IUserRepository {
  private users: User[] = [
    new User('1', 'Ing. Miguel Cortes', 'Administrador', '1234'),
    new User('2', 'Beto', 'Operador', '1234'),
    new User('3', 'Oswaldo', 'Operador', '1234'),
    new User('4', 'Nelson', 'Operador', '1234'),
    new User('5', 'Oliver', 'Operador', '1234'),
    new User('6', 'lupita', 'RH', '1234'),
  ];

  public async findByName(name: string): Promise<User | null> {
    const user = this.users.find(u => u.name === name);
    return user || null;
  }

  // NUEVA FUNCIÓN PARA CUMPLIR EL CONTRATO
  public async getAll(): Promise<User[]> {
    return this.users;
  }

}