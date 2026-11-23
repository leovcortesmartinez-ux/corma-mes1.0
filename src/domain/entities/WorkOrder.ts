export type WorkOrderStatus = 'Pendiente' | 'Asignado' | 'Trabajando' | 'Inspección' | 'Terminada';
export type Priority = 'Baja' | 'Media' | 'Alta' | 'Critica';

export class WorkOrder {
  public id: string;
  public partName: string;
  public materialType: string;
  public quantity: number;
  public status: WorkOrderStatus;
  public customerPhone?: string;
  public customerEmail?: string;
  
  public client: string;
  public description: string;
  public dueDate: string;
  public priority: Priority;
  public assignedOperators: string[];

  constructor(
    id: string,
    partName: string,
    materialType: string,
    quantity: number,
    status: WorkOrderStatus = 'Pendiente',
    customerPhone: string | undefined,
    customerEmail: string | undefined,
    client: string,
    description: string,
    dueDate: string,
    priority: Priority,
    assignedOperators: string[]
  ) {
    if (!customerPhone && !customerEmail) {
      throw new Error("BR-01: Toda orden de trabajo debe incluir un número de contacto válido.");
    }
    if (quantity <= 0) {
      throw new Error("La cantidad de piezas debe ser mayor a cero.");
    }

    this.id = id;
    this.partName = partName;
    this.materialType = materialType;
    this.quantity = quantity;
    this.status = status;
    this.customerPhone = customerPhone;
    this.customerEmail = customerEmail;
    this.client = client;
    this.description = description;
    this.dueDate = dueDate;
    this.priority = priority;
    this.assignedOperators = assignedOperators;
  }

  // Transiciones de Estado (BR-02)
  public assign(): void {
    if (this.status !== 'Pendiente') throw new Error("BR-02: Solo una orden 'Pendiente' puede pasar a 'Asignado'.");
    this.status = 'Asignado';
  }

  public startMachining(): void {
    if (this.status !== 'Asignado') throw new Error("BR-02: Solo una orden 'Asignada' puede pasar a 'Trabajando'.");
    this.status = 'Trabajando';
  }

  public sendToInspection(): void {
    if (this.status !== 'Trabajando') throw new Error("BR-02: Una orden debe estar 'Trabajando' para pasar a 'Inspección'.");
    this.status = 'Inspección';
  }

  public finish(): void {
    if (this.status !== 'Inspección') throw new Error("BR-02: Solo un trabajo en 'Inspección' puede ser marcado como Terminado.");
    this.status = 'Terminada';
  }

  public revert(): void {
    if (this.status === 'Inspección') this.status = 'Trabajando';
    else if (this.status === 'Trabajando') this.status = 'Asignado';
    else if (this.status === 'Asignado') this.status = 'Pendiente';
    else throw new Error("BR-02: Un trabajo en estado 'Pendiente' no se puede regresar más.");
  }
}