export type Role = 'Administrador' | 'Operador' | 'RH';

export class User {
  public id: string;
  public name: string;
  public role: Role;
  public password: string;

  constructor(id: string, name: string, role: Role, password: string) {
    this.id = id;
    this.name = name;
    this.role = role;
    this.password = password;
  }
}