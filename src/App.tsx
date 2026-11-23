import { useState, useEffect } from 'react';
import { User } from './domain/entities/User';
import { LoginUseCase } from './application/use-cases/LoginUseCase';
import cormaLogo from './Images/CORMA_logo2.png';
import { FirestoreUserRepository } from './adapters/repositories/FirestoreUserRepository';
import { Dashboard } from './infrastructure/ui/pages/Dashboard';

const userRepository = new FirestoreUserRepository();
const loginUseCase = new LoginUseCase(userRepository);

function App() {
  const [userOptions, setUserOptions] = useState<string[]>(["Cargando usuarios..."]);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [selectedName, setSelectedName] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const users = await userRepository.getAll();
        const names = users.map(u => u.name);
        setUserOptions(["Selecciona un usuario...", ...names]);
      } catch (error) {
        console.error("Error al conectar con Firebase:", error);
        setUserOptions(["Error al cargar usuarios"]);
      }
    };
    fetchUsers();
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    if (!selectedName || selectedName === "Selecciona un usuario...") {
      setErrorMsg('Por favor selecciona un usuario.');
      return;
    }
    try {
      const user = await loginUseCase.execute({ name: selectedName, password });
      setCurrentUser(user);
    } catch (error: any) {
      setErrorMsg(error.message);
    }
  };

  const handleLogout = () => {
    setCurrentUser(null);
    setPassword('');
    setSelectedName('');
    setShowPassword(false);
  };

  // --- VISTA 1: DASHBOARD DE LA APLICACIÓN ---
  if (currentUser) {
    return <Dashboard user={currentUser} onLogout={handleLogout} />;
  }

  // --- VISTA 2: PANTALLA DE LOGIN A PANTALLA COMPLETA ---
  return (
    <div className="min-h-screen w-full bg-white grid grid-cols-1 md:grid-cols-2 font-sans select-none">
      
      {/* COLUMNA IZQUIERDA: FORMULARIO A PANTALLA COMPLETA */}
      <div className="bg-white px-8 py-12 sm:px-16 lg:px-24 flex flex-col justify-center items-center">
        <div className="w-full max-w-md">
          <div className="mb-8">
            <h1 className="text-3xl font-black text-slate-900 tracking-tight">
              Inicio de Sesión
            </h1>
            <p className="text-sm text-slate-500 mt-1.5">
              Ingresa tus credenciales para acceder a CORMA MES
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Usuario
              </label>
              <select
                value={selectedName}
                onChange={e => setSelectedName(e.target.value)}
                className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm font-medium text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-slate-900 transition cursor-pointer"
              >
                {userOptions.map((name, index) => (
                  <option key={index} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Contraseña
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Ingresa tu contraseña"
                  className="w-full border border-gray-300 rounded-xl pl-4 pr-12 py-3 text-sm text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-slate-900 transition"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(prev => !prev)}
                  aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  title={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 p-1 rounded-lg transition cursor-pointer"
                >
                  {showPassword ? (
                    /* Ojo abierto (contraseña visible) */
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="w-5 h-5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                      />
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                      />
                    </svg>
                  ) : (
                    /* Ojo cerrado / tachado (contraseña oculta) */
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="w-5 h-5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
                      />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {errorMsg && (
              <div className="text-red-700 text-xs font-bold bg-red-50 border border-red-200 px-4 py-3 rounded-xl">
                {errorMsg}
              </div>
            )}

            <button
              type="submit"
              className="w-full bg-slate-900 hover:bg-slate-800 active:scale-[0.99] text-white font-bold text-sm py-3.5 rounded-xl mt-2 transition shadow-sm cursor-pointer"
            >
              Iniciar Sesión
            </button>
          </form>
        </div>
      </div>

      {/* COLUMNA DERECHA: PANEL OSCURO A PANTALLA COMPLETA */}
      <div className="bg-slate-900 text-white px-8 py-12 sm:px-14 flex flex-col items-center justify-between text-center border-t md:border-t-0 md:border-l border-slate-800">
        <div className="w-full flex justify-end">
          <span className="text-xs font-bold tracking-widest uppercase text-orange-500">
            Sistema MES
          </span>
        </div>

        <div className="flex flex-col items-center my-10">
          <img
            src={cormaLogo}
            alt="Logo CORMA"
            className="w-44 h-auto object-contain mb-6"
          />
          <h2 className="text-2xl font-black tracking-tight text-white uppercase">
            Control de Planta
          </h2>
          <p className="text-sm text-slate-400 mt-2.5 max-w-xs leading-relaxed">
            Producción, inventario de herramientas, eficiencia de operadores y recursos humanos.
          </p>
        </div>

        <p className="text-xs text-slate-500 font-medium">
          Mecanizados Metálicos Industriales CORMA S.A. de C.V.
        </p>
      </div>

    </div>
  );
}

export default App;