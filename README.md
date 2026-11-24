# CORMA — Sistema MES (Manufacturing Execution System)

Sistema web de ejecución de manufactura diseñado para Mecanizados Metálicos Industriales CORMA S.A. de C.V., que digitaliza el control de producción, el inventario de herramientas y estado de maquinaria, el control operativo y la gestión de recursos humanos.

## Equipo

| Nombre | Expediente | Rol |
| Leonardo Cortés Martínez | 333312 | Arquitectura, Frontend & Integración Firebase |


## Stack Tecnológico

* Lenguaje: TypeScript
* Frontend/UI: React + Vite + Tailwind CSS
* Base de Datos / Backend: Firebase Cloud Firestore
* Arquitectura: Clean Architecture

## Arquitectura

![Diagrama de Arquitectura](docs/arquitectura.png)

El sistema implementa Clean Architecture respetando la Regla de Dependencia, todas las dependencias apuntan hacia el núcleo del dominio; el dominio no importa React ni Firebase

* src/domain/entities/ (Entities / Domain): Entidades puras del negocio (User, WorkOrder, InventoryItem, ActiveLoan) sin dependencias de frameworks externos.
* src/application/ (Use Cases & Ports): Casos de uso (LoginUseCase, CreateWorkOrderUseCase) y contratos de persistencia (interfaces/IUserRepository, IWorkOrderRepository, IInventoryRepository).
* src/adapters/repositories/ Interface Adapters: Implementaciones concretas de los puertos para Firebase Firestore (FirestoreUserRepository, FirestoreWorkOrderRepository, FirestoreInventoryRepository, FirestoreLoanRepository) y repositorios en memoria para pruebas (InMemoryUserRepository, InMemoryWorkOrderRepository).
* src/infrastructure/ (Frameworks & Drivers): Configuración de Firebase (database/firebase.ts), bitácora del sistema (services/systemLogger.ts) e interfaz de usuario en React (ui/pages/Dashboard.tsx, ui/views/KanbanBoard.tsx, InventarioView.tsx, ControlView.tsx, RHView.tsx, HistorialView.tsx).

## Acceso en Producción (Vercel)

La aplicación se encuentra desplegada y disponible en línea a través de Vercel:

- URL de producción: https://corma-mes1-0.vercel.app
- Despliegue continuo: Cada push a la rama principal en GitHub dispara automáticamente una nueva compilación y despliegue en Vercel.
- Variables de entorno:** Las credenciales de Firebase Firestore se configuran en el panel del proyecto en Vercel (Settings > Environment Variables) y no se versionan en el repositorio.

---

## Cómo correrlo localmente (Desarrollo y pruebas)

Si deseas ejecutar o modificar el proyecto en tu equipo local:

1. **Requisitos:**
   - Node.js `v18+` y `npm` `v9+`
   - Proyecto activo en **Firebase Firestore**[cite: 62]

2. **Instalar dependencias:**
   ```bash
   npm install