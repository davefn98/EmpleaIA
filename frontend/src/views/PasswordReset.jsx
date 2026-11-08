import { useEffect, useState } from 'react';
import PublicAccessLayout from '../components/layout/PublicAccessLayout';
import { PASSWORD_RESET_PATH } from '../utils/supabaseClient';

export default function PasswordReset({ auth, theme, onToggleTheme }) {
  const [status, setStatus] = useState('checking');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;

    async function checkLink() {
      try {
        const { data, error: sessionError } = await auth.getSession();
        if (active) setStatus(!sessionError && data.session ? 'ready' : 'invalid');
      } catch {
        if (active) setStatus('invalid');
      } finally {
        if (active) window.history.replaceState(window.history.state, '', PASSWORD_RESET_PATH);
      }
    }

    void checkLink();
    return () => { active = false; };
  }, [auth]);

  async function handleReset(event) {
    event.preventDefault();
    if (status !== 'ready' || saving) return;

    if (password !== confirmation) {
      setError('Las contraseñas no coinciden. Escríbelas de nuevo.');
      return;
    }

    setError('');
    setSaving(true);
    try {
      const { error: updateError } = await auth.updateUser({ password });
      if (updateError) throw updateError;
      setPassword('');
      setConfirmation('');
      setStatus('success');
      void auth.signOut({ scope: 'local' }).catch(() => {});
    } catch (updateError) {
      if (updateError.status === 401 || updateError.code === 'session_not_found' || updateError.name === 'AuthSessionMissingError') {
        setStatus('invalid');
      } else if (updateError.code === 'weak_password') {
        setError('Elige una contraseña más segura. Prueba combinar letras, números y símbolos.');
      } else if (updateError.code === 'same_password') {
        setError('Elige una contraseña diferente de la anterior.');
      } else {
        setError('No pudimos guardar la contraseña. Vuelve a intentarlo.');
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <PublicAccessLayout theme={theme} onToggleTheme={onToggleTheme}>
      <div className="access-form-copy">
        <h2 id="access-form-title">Cambiar contraseña</h2>
      </div>

      {status === 'checking' && <p role="status" className="mt-3 text-sm text-slate-600">Verificando el enlace…</p>}

      {status === 'invalid' && (
        <p role="alert" className="access-message access-message--error">El enlace venció o ya se usó. Solicita otro para cambiar tu contraseña.</p>
      )}

      {status === 'success' && (
        <p role="status" className="access-message access-message--success">Contraseña actualizada. Ya puedes iniciar sesión con tu nueva contraseña.</p>
      )}

      {status === 'ready' && (
        <form onSubmit={handleReset} className="access-form">
          <label>
            Nueva contraseña
            <input id="reset-password" type="password" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          <label>
            Repite la nueva contraseña
            <input id="confirm-reset-password" type="password" autoComplete="new-password" required value={confirmation} onChange={(e) => setConfirmation(e.target.value)} />
          </label>
          {error && <p role="alert" className="access-message access-message--error">{error}</p>}
          <button type="submit" disabled={saving} className="access-submit">
            {saving ? 'Guardando…' : 'Guardar nueva contraseña'}
          </button>
        </form>
      )}

      <a href={status === 'invalid' ? '/login?recuperar=1' : '/login'} className="access-link access-reset-link">
        {status === 'invalid' ? 'Solicitar otro enlace' : 'Volver a iniciar sesión'}
      </a>
    </PublicAccessLayout>
  );
}
