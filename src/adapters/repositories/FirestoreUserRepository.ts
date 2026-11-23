import { User, type Role } from '../../domain/entities/User';
import type { IUserRepository } from '../../application/interfaces/IUserRepository';
import { db } from '../../infrastructure/database/firebase';
// 👇 1. Agregamos doc, setDoc y deleteDoc a las importaciones
import { collection, query, where, getDocs, doc, setDoc, deleteDoc } from 'firebase/firestore';

export class FirestoreUserRepository implements IUserRepository {
  public async findByName(name: string): Promise<User | null> {
    const usersRef = collection(db, 'users');
    const q = query(usersRef, where('name', '==', name));
    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      return null;
    }

    const docData = snapshot.docs[0].data();
    
    return new User(
      snapshot.docs[0].id,
      docData.name,
      docData.role as Role,
      docData.password
    );
  }

  // NUEVO: Método para traer todos los usuarios de Firestore
  public async getAll(): Promise<User[]> {
    const usersRef = collection(db, 'users');
    const snapshot = await getDocs(usersRef);
    
    return snapshot.docs.map(doc => {
      const data = doc.data();
      return new User(doc.id, data.name, data.role as Role, data.password);
    });
  }

  // 👇 2. NUEVO: Método para Crear o Actualizar un usuario
  public async save(user: User): Promise<void> {
    // Apuntamos al documento específico usando el ID del usuario
    const userRef = doc(db, 'users', user.id); 
    await setDoc(userRef, {
      id: user.id,
      name: user.name,
      role: user.role,
      // Usamos as any por si el atributo es privado en tu clase User
      password: (user as any).password 
    }, { merge: true }); // merge: true actualiza sin borrar otros datos
  }

  // 👇 3. NUEVO: Método para Eliminar (Dar de baja)
  public async delete(id: string): Promise<void> {
    const userRef = doc(db, 'users', id);
    await deleteDoc(userRef);
  }
}