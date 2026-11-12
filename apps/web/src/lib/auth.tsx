"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  apiGetMe,
  apiSignIn,
  apiSignOut,
  apiSignUp,
  type UserProfile,
} from "./api";
import { isDemoActive } from "./demo-store";
import { startBackendKeepAlive, warmUpBackend } from "./backend-warmup";
import {
  clearAuthHint,
  hasAuthHint,
  readCachedUser,
  setAuthHint,
  writeCachedUser,
} from "./session-cache";

export type LoginResult =
  | { status: "ok" }
  | { status: "pending_mfa"; sessionId: string };

interface AuthContextType {
  user: UserProfile | null;
  loading: boolean;
  /**
   * `true` cuando el probe de sesión (`/users/me`) ya terminó, con o sin
   * usuario. Sirve para que las áreas protegidas no redirijan mientras el
   * backend todavía está despertando.
   */
  sessionChecked: boolean;
  login: (email: string, pass: string) => Promise<LoginResult>;
  register: (
    email: string,
    pass: string,
    name?: string,
  ) => Promise<{ requiresEmailVerification: boolean; emailSent: boolean }>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionChecked, setSessionChecked] = useState(false);
  const startedRef = useRef(false);

  /**
   * Consulta el perfil real. Devuelve `null` si no hay sesión.
   * Cachea el resultado para hidratar la próxima carga sin red.
   */
  const loadUser = useCallback(async (): Promise<UserProfile | null> => {
    // Las cookies httpOnly no son legibles desde JS, así que la única forma
    // de saber si hay sesión es pedir /users/me. Si falla con 401, el
    // apiFetch intentará refrescar; si tampoco funciona, no hay sesión.
    try {
      const me = await apiGetMe();
      setUser(me);
      if (isDemoActive()) {
        // La sesión demo vive sólo en el navegador: no debe dejar cache ni
        // cookie testigo de una sesión real inexistente.
        return me;
      }
      writeCachedUser(me);
      // Sesión confirmada por el backend: aseguramos el testigo legible para
      // que las próximas cargas no dependan de esta llamada (cubre sesiones
      // creadas antes de existir la cookie).
      setAuthHint();
      return me;
    } catch (err) {
      console.warn("[Auth] Sin sesión o expirada:", err);
      const status = (err as { status?: number })?.status;
      // Sólo descartamos la sesión cacheada si el backend dijo explícitamente
      // que no hay sesión. Un timeout, un 500 o un cold start no debe
      // desconectar al usuario: se mantiene el perfil cacheado.
      if (status === 401 || status === 403) {
        setUser(null);
        writeCachedUser(null);
        clearAuthHint();
      }
      return null;
    } finally {
      setLoading(false);
      setSessionChecked(true);
    }
  }, []);

  const refreshUser = useCallback(async () => {
    await loadUser();
  }, [loadUser]);

  // Renovación proactiva de sesión cada 45 min mientras haya usuario activo
  useEffect(() => {
    if (!user || isDemoActive()) return;
    const id = window.setInterval(() => {
      void loadUser();
    }, 45 * 60 * 1000);
    return () => window.clearInterval(id);
  }, [user, loadUser]);

  useEffect(() => {
    // StrictMode (dev) monta el efecto dos veces: el trabajo debe ser único.
    if (startedRef.current) return;
    startedRef.current = true;

    // 1) Resolución SIN red, para no bloquear la UI durante el cold start de
    //    Render. Con cookie testigo hidratamos el último perfil cacheado; sin
    //    cookie pintamos el formulario de login de inmediato.
    const demo = isDemoActive();
    if (demo) {
      // En modo demo `/users/me` está interceptado en el navegador: resuelve
      // al instante y no hay cold start que esperar.
      setLoading(false);
    } else if (hasAuthHint()) {
      const cached = readCachedUser();
      if (cached) {
        setUser(cached);
        setLoading(false);
      }
    } else {
      setLoading(false);
    }

    // 2) Adelantamos el arranque del backend mientras el usuario interactúa y
    //    lo mantenemos despierto mientras la pestaña siga abierta.
    if (!demo) {
      // `force`: el script inline del layout ya hizo un intento sin
      // reintentos, así que acá arrancamos la ráfaga completa.
      warmUpBackend(true);
      startBackendKeepAlive();
    }

    // 3) Revalidamos la sesión real en background.
    void loadUser();
  }, [loadUser]);

  const login = useCallback(
    async (email: string, pass: string): Promise<LoginResult> => {
      const result = await apiSignIn(email, pass);
      // Si el backend requiere MFA, aún no hay cookies de sesión: no
      // intentamos loadUser (daría 401 y limpiaría estado). El UI se
      // encarga de abrir el modal con el sessionId.
      if ((result as any)?.status === "pending_mfa") {
        return {
          status: "pending_mfa",
          sessionId: (result as any).sessionId,
        };
      }
      const me = await loadUser();
      if (!me) {
        // Entró bien pero no pudimos leer el perfil (cold start / red). Mejor
        // decirlo que dejar el formulario mudo como si no hubiera pasado nada.
        throw new Error(
          "Iniciaste sesión, pero no pudimos cargar tu perfil. Recarga la página.",
        );
      }
      return { status: "ok" };
    },
    [loadUser],
  );

  const register = useCallback(
    async (
      email: string,
      pass: string,
      name?: string,
    ): Promise<{ requiresEmailVerification: boolean; emailSent: boolean }> => {
      const created = await apiSignUp(email, pass, name);
      // Con verificación de email activa el usuario queda sin confirmar: un
      // sign-in inmediato falla con "Email not confirmed" y antes se mostraba
      // como "Credenciales inválidas". No intentamos loguear en ese caso.
      if (created.requiresEmailVerification) {
        return {
          requiresEmailVerification: true,
          emailSent: created.emailSent !== false,
        };
      }
      // Tras registrarse, iniciar sesión automáticamente
      await apiSignIn(email, pass);
      await loadUser();
      return { requiresEmailVerification: false, emailSent: false };
    },
    [loadUser],
  );

  const logout = useCallback(async () => {
    try {
      await apiSignOut();
    } finally {
      // Aunque el backend esté dormido/caído, la sesión local se cierra acá.
      setUser(null);
      writeCachedUser(null);
      clearAuthHint();
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        sessionChecked,
        login,
        register,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
