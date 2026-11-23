export class ActiveLoan {
  public id: string;
  public code: string;
  public toolName: string;
  public operator: string;
  public quantity: number;
  public notes?: string;

  constructor(
    id: string,
    code: string,
    toolName: string,
    operator: string,
    quantity: number,
    notes?: string
  ) {
    this.id = id;
    this.code = code;
    this.toolName = toolName;
    this.operator = operator;
    this.quantity = quantity;
    this.notes = notes;
  }
}