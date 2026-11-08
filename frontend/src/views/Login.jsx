import { useState } from 'react';
import { AlertCircle, ArrowRight, CheckCircle2 } from 'lucide-react';
import PublicAccessLayout from '../components/layout/PublicAccessLayout';
import { mapError } from '../utils/errorMapper';
import { PASSWORD_RESET_PATH, supabase } from '../utils/supabaseClient';

export default function Login({ accountClosed, onLoginSuccess, theme, onToggleTheme }) {
  const [isLogin, setIsLogin] = useState(true);
  const [isRecovering, setIsRecovering] = useState(
    () => new URLSearchParams(window.location.search).get('recuperar') === '1',
  );
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [career, setCareer] = useState('');
  const [targetRole, setTargetRole] = useState('');
  // Aviso dejado por api.js / App.jsx cuando la sesión expiró y se forzó el logout.
  const [error, setError] = useState(() => {
    if (sessionStorage.getItem('empleaia_session_expired')) {
      sessionStorage.removeItem('empleaia_session_expired');
      return 'Tu sesión expiró por inactividad. Inicia sesión nuevamente.';
    }
    return '';
  });
  const [success, setSuccess] = useState(null);
  const [loading, setLoading] = useState(false);
  const notice = success ?? (accountClosed ? 'Tu cuenta de EmpleaIA fue eliminada.' : '');

  const showRecovery = (enabled) => {
    setIsRecovering(enabled);
    setPassword('');
    setError('');
    setSuccess('');
  };

  const handleAuth = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      if (isRecovering) {
        const { error: authError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: new URL(PASSWORD_RESET_PATH, window.location.origin).href,
        });
        if (authError && authError.code !== 'user_not_found') throw authError;
        setSuccess('Si el correo está registrado, recibirás un enlace para cambiar tu contraseña. Revisa también la carpeta de spam.');
      } else if (isLogin) {
        // Flujo de Login
        const { error: authError } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (authError) throw authError;
        onLoginSuccess();
      } else {
        // Flujo de Registro
        if (!firstName.trim() || !lastName.trim() || !career.trim() || !targetRole.trim()) {
          throw new Error('Por favor completa todos los campos para crear tu cuenta y perfil curricular.');
        }

        const { data: authData, error: authError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              first_name: firstName.trim(),
              last_name: lastName.trim(),
              career: career.trim(),
              target_role: targetRole.trim(),
            },
          },
        });
        if (authError) throw authError;

        if (authData?.user && !authData?.session) {
          setSuccess('¡Cuenta creada! Revisa tu correo para confirmarla antes de iniciar sesión.');
        } else {
          setSuccess('¡Registro exitoso! Ya puedes iniciar sesión con tus credenciales.');
        }
        setIsLogin(true);
        setPassword('');
      }
    } catch (err) {
      setError(isRecovering
        ? 'No pudimos enviar el enlace. Espera unos minutos y vuelve a intentarlo.'
        : mapError(err));
    } finally {
      setLoading(false);
    }
  };

  const title = isRecovering ? 'Recupera tu contraseña' : isLogin ? 'Bienvenido a EmpleaIA' : 'Crea tu cuenta';
  const action = isRecovering ? 'Enviar enlace' : isLogin ? 'Iniciar sesión' : 'Crear cuenta';

  const selectMode = (login) => {
    setIsLogin(login);
    showRecovery(false);
  };

  return (
    <PublicAccessLayout theme={theme} onToggleTheme={onToggleTheme}>
      {!isRecovering && (
        <div className="access-mode" role="group" aria-label="Opciones de acceso">
          <button type="button" aria-pressed={isLogin} disabled={loading} onClick={() => selectMode(true)}>
            Iniciar sesión
          </button>
          <button type="button" aria-pressed={!isLogin} disabled={loading} onClick={() => selectMode(false)}>
            Crear cuenta
          </button>
        </div>
      )}

      <div className="access-form-copy">
        <h2 id="access-form-title">{title}</h2>
        <p id="access-form-description">
          {isRecovering ? 'Escribe el correo con el que te registraste.' : isLogin ? 'Ingresa para continuar tu preparación.' : 'Completa tus datos para empezar.'}
        </p>
      </div>

      {error && (
        <div role="alert" className="access-message access-message--error">
          <AlertCircle size={17} aria-hidden="true" />
          {error}
        </div>
      )}
      {notice && (
        <div role="status" className="access-message access-message--success">
          <CheckCircle2 size={17} aria-hidden="true" />
          {notice}
        </div>
      )}

      <form onSubmit={handleAuth} className="access-form" aria-describedby="access-form-description">
        {!isLogin && !isRecovering && (
          <div className="access-form__signup">
            <label>
              Nombres
              <input name="firstName" autoComplete="given-name" required value={firstName} onChange={(event) => setFirstName(event.target.value)} placeholder="Ana" />
            </label>
            <label>
              Apellidos
              <input name="lastName" autoComplete="family-name" required value={lastName} onChange={(event) => setLastName(event.target.value)} placeholder="Pérez" />
            </label>
            <label>
              Carrera técnica
              <input name="career" required value={career} onChange={(event) => setCareer(event.target.value)} placeholder="Desarrollo de Software" />
            </label>
            <label>
              Puesto objetivo
              <input name="targetRole" required value={targetRole} onChange={(event) => setTargetRole(event.target.value)} placeholder="Analista de soporte" />
            </label>
          </div>
        )}

        <label>
          Correo electrónico
          <input id="auth-email" name="email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="nombre@ejemplo.com" />
        </label>

        {!isRecovering && (
          <label>
            Contraseña
            <input id="auth-password" name="password" type="password" autoComplete={isLogin ? 'current-password' : 'new-password'} required value={password} onChange={(event) => setPassword(event.target.value)} placeholder="••••••••" />
          </label>
        )}

        {isLogin && !isRecovering && (
          <button type="button" className="access-link" disabled={loading} onClick={() => showRecovery(true)}>
            ¿Olvidaste tu contraseña?
          </button>
        )}

        <button type="submit" className="access-submit" disabled={loading}>
          {loading ? 'Procesando…' : action}
          {!loading && <ArrowRight size={16} aria-hidden="true" />}
        </button>

        {isRecovering && (
          <button type="button" className="access-link" disabled={loading} onClick={() => selectMode(true)}>
            Volver a iniciar sesión
          </button>
        )}
      </form>
    </PublicAccessLayout>
  );
}
