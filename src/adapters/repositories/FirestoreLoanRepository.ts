import { ActiveLoan } from '../../domain/entities/ActiveLoan';
import { db } from '../../infrastructure/database/firebase';
import { collection, doc, setDoc, getDocs, deleteDoc } from 'firebase/firestore';

export class FirestoreLoanRepository {
  public async save(loan: ActiveLoan): Promise<void> {
    const docRef = doc(db, 'activeLoans', loan.id);
    await setDoc(docRef, {
      id: loan.id,
      code: loan.code,
      toolName: loan.toolName,
      operator: loan.operator,
      quantity: loan.quantity,
      notes: loan.notes || ''
    });
  }

  public async getAll(): Promise<ActiveLoan[]> {
    const snapshot = await getDocs(collection(db, 'activeLoans'));
    return snapshot.docs.map(docSnap => {
      const data = docSnap.data();
      return new ActiveLoan(
        data.id,
        data.code,
        data.toolName,
        data.operator,
        data.quantity,
        data.notes || ''
      );
    });
  }

  public async delete(id: string): Promise<void> {
    const docRef = doc(db, 'activeLoans', id);
    await deleteDoc(docRef);
  }
}