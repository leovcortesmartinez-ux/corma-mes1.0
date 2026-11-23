import { ActiveLoan } from '../../domain/entities/ActiveLoan';
import { db } from '../../infrastructure/database/firebase';
import { collection, doc, setDoc, getDocs, deleteDoc } from 'firebase/firestore';

export class FirestoreLoanRepository {
  public async save(loan: ActiveLoan, lifePercentage: number = 100): Promise<void> {
    const docRef = doc(db, 'activeLoans', loan.id);
    await setDoc(docRef, {
      id: loan.id,
      code: loan.code,
      toolName: loan.toolName,
      operator: loan.operator,
      quantity: loan.quantity,
      notes: loan.notes || '',
      lifePercentage
    });
  }

  public async getAllWithLife(): Promise<{ loans: ActiveLoan[]; lifeMap: Record<string, number> }> {
    const snapshot = await getDocs(collection(db, 'activeLoans'));
    const loans: ActiveLoan[] = [];
    const lifeMap: Record<string, number> = {};

    snapshot.docs.forEach(docSnap => {
      const data = docSnap.data();
      const id = data.id || docSnap.id;
      loans.push(
        new ActiveLoan(
          id,
          data.code,
          data.toolName,
          data.operator,
          data.quantity,
          data.notes || ''
        )
      );
      lifeMap[id] = typeof data.lifePercentage === 'number' ? data.lifePercentage : 100;
    });

    return { loans, lifeMap };
  }

  public async getAll(): Promise<ActiveLoan[]> {
    const { loans } = await this.getAllWithLife();
    return loans;
  }

  public async delete(id: string): Promise<void> {
    const docRef = doc(db, 'activeLoans', id);
    await deleteDoc(docRef);
  }
}