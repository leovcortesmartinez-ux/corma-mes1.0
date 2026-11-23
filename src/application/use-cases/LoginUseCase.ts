import { User } from '../../domain/entities/User';
import type { IUserRepository } from '../interfaces/IUserRepository';

export interface LoginDTO {
  name: string;
  password: string;
}

export class LoginUseCase {
  // Declaración explícita
  private userRepository: IUserRepository;

  // Inyección clásica sin el atajo "private"
  constructor(userRepository: IUserRepository) {
    this.userRepository = userRepository;
  }

  public async execute(dto: LoginDTO): Promise<User> {
    const user = await this.userRepository.findByName(dto.name);
    
    if (!user) {
      throw new Error("El usuario seleccionado no existe en el sistema.");
    }

    if (user.password !== dto.password) {
      throw new Error("Contraseña incorrecta. Inténtalo de nuevo.");
    }

    return user;
  }
}