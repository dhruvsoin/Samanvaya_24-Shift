import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Shield, Radio, Users, AlertTriangle, Loader2, LifeBuoy } from 'lucide-react';
import { api } from '@/api/client';
import { useAuthStore } from '@/store/auth';

// ── Validation schemas (Zod tells us exactly what fields are required) ──
const operatorSchema = z.object({
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
});

const crewSchema = z.object({
  unitCode: z.string().min(1, 'Unit code is required').trim(),
  pin: z.string().optional().default('1111'),
});

type OperatorForm = z.infer<typeof operatorSchema>;
type CrewForm = z.infer<typeof crewSchema>;

type Tab = 'operator' | 'crew' | 'guest';

export function LoginPage() {
  const navigate = useNavigate();
  const login = useAuthStore((s) => s.login);
  const [tab, setTab] = useState<Tab>('operator');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const opForm = useForm<OperatorForm>({ resolver: zodResolver(operatorSchema) });
  const crewForm = useForm<CrewForm>({
    resolver: zodResolver(crewSchema),
    defaultValues: { unitCode: 'AMB-01', pin: '1111' },
  });

  async function handleOperatorLogin(data: OperatorForm) {
    setError(null);
    setLoading(true);
    try {
      const res = await api.auth.login(data);
      login(res.token, res.role, res.displayName, res.unitId);
      navigate('/command');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  async function handleCrewLogin(data: CrewForm) {
    setError(null);
    setLoading(true);
    try {
      const unitCode = (data.unitCode || 'AMB-01').trim().toUpperCase();
      const pin = data.pin?.trim() || '1111';
      const res = await api.auth.crewLogin({ unitCode, pin });
      login(res.token, res.role, res.displayName, res.unitId);
      navigate('/crew');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  async function handleDemoLogin() {
    setError(null);
    setLoading(true);
    try {
      const res = await api.auth.demo();
      login(res.token, res.role, res.displayName, res.unitId);
      navigate('/command');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Demo login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden"
      style={{ background: 'hsl(222, 47%, 6%)' }}>
      {/* Background grid pattern */}
      <div className="absolute inset-0 opacity-5"
        style={{
          backgroundImage: 'linear-gradient(hsl(217,91%,60%) 1px, transparent 1px), linear-gradient(90deg, hsl(217,91%,60%) 1px, transparent 1px)',
          backgroundSize: '40px 40px'
        }} />

      {/* Glow effects */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-96 h-96 rounded-full opacity-10"
        style={{ background: 'hsl(217,91%,60%)', filter: 'blur(80px)' }} />

      <div className="relative z-10 w-full max-w-md px-4">
        {/* Logo / Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4"
            style={{ background: 'hsl(217,91%,60%,0.15)', border: '1px solid hsl(217,91%,60%,0.3)' }}>
            <Radio className="w-8 h-8" style={{ color: 'hsl(217,91%,60%)' }} />
          </div>
          <h1 className="text-3xl font-bold text-white tracking-tight">SAMANVAYA</h1>
          <p className="mt-1 text-sm" style={{ color: 'hsl(215,20%,55%)' }}>
            Flood Emergency Response Operations
          </p>
        </div>

        {/* SOS Emergency Callout */}
        <div className="mb-4 p-3.5 rounded-2xl bg-gradient-to-r from-rose-950/90 via-slate-900 to-amber-950/60 border border-rose-500/50 flex items-center justify-between shadow-xl">
          <div className="flex items-center gap-2.5">
            <span className="p-2 rounded-xl bg-rose-600 text-white animate-pulse">
              <LifeBuoy className="w-5 h-5" />
            </span>
            <div>
              <p className="text-xs font-black text-white">Trapped in Floodwaters? Need Help?</p>
              <p className="text-[11px] text-rose-300">Submit a direct citizen rescue request</p>
            </div>
          </div>
          <Link
            to="/sos"
            className="px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-black shadow-lg shadow-rose-900/50 transition active:scale-95 shrink-0 flex items-center gap-1"
          >
            <span>SEND SOS →</span>
          </Link>
        </div>

        {/* Card */}
        <div className="rounded-2xl p-6"
          style={{ background: 'hsl(222,47%,9%)', border: '1px solid hsl(217,33%,18%)' }}>

          {/* Tabs */}
          <div className="flex rounded-lg p-1 mb-6"
            style={{ background: 'hsl(222,47%,6%)' }}>
            {([
              { id: 'operator', label: 'EOC Command', icon: Shield },
              { id: 'crew', label: 'Field Crew', icon: Users },
              { id: 'guest', label: 'Observer', icon: Radio },
            ] as { id: Tab; label: string; icon: React.ElementType }[]).map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => { setTab(id); setError(null); }}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md text-sm font-medium transition-all"
                style={{
                  background: tab === id ? 'hsl(222,47%,14%)' : 'transparent',
                  color: tab === id ? 'white' : 'hsl(215,20%,55%)',
                  border: tab === id ? '1px solid hsl(217,33%,18%)' : '1px solid transparent',
                }}
              >
                <Icon className="w-3.5 h-3.5" />
                {label}
              </button>
            ))}
          </div>

          {/* Error message */}
          {error && (
            <div className="flex items-center gap-2 p-3 rounded-lg mb-4 text-sm"
              style={{ background: 'hsl(0,84%,60%,0.1)', border: '1px solid hsl(0,84%,60%,0.2)', color: 'hsl(0,84%,70%)' }}>
              <AlertTriangle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}

          {/* ── OPERATOR TAB ── */}
          {tab === 'operator' && (
            <form onSubmit={opForm.handleSubmit(handleOperatorLogin)} className="space-y-4">
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'hsl(215,20%,55%)' }}>
                  Username
                </label>
                <input
                  {...opForm.register('username')}
                  placeholder="operator"
                  autoComplete="username"
                  className="w-full px-3 py-2.5 rounded-lg text-sm text-white outline-none transition-all"
                  style={{
                    background: 'hsl(222,47%,12%)',
                    border: `1px solid ${opForm.formState.errors.username ? 'hsl(0,84%,60%)' : 'hsl(217,33%,18%)'}`,
                  }}
                />
                {opForm.formState.errors.username && (
                  <p className="mt-1 text-xs" style={{ color: 'hsl(0,84%,60%)' }}>
                    {opForm.formState.errors.username.message}
                  </p>
                )}
              </div>
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'hsl(215,20%,55%)' }}>
                  Password
                </label>
                <input
                  {...opForm.register('password')}
                  type="password"
                  placeholder="••••••••"
                  autoComplete="current-password"
                  className="w-full px-3 py-2.5 rounded-lg text-sm text-white outline-none"
                  style={{
                    background: 'hsl(222,47%,12%)',
                    border: `1px solid ${opForm.formState.errors.password ? 'hsl(0,84%,60%)' : 'hsl(217,33%,18%)'}`,
                  }}
                />
                {opForm.formState.errors.password && (
                  <p className="mt-1 text-xs" style={{ color: 'hsl(0,84%,60%)' }}>
                    {opForm.formState.errors.password.message}
                  </p>
                )}
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 rounded-lg font-semibold text-sm flex items-center justify-center gap-2 transition-opacity disabled:opacity-50"
                style={{ background: 'hsl(217,91%,60%)', color: 'hsl(222,47%,6%)' }}
              >
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                Sign in as Operator
              </button>
              <p className="text-center text-xs" style={{ color: 'hsl(215,20%,40%)' }}>
                Demo: username <span className="text-white font-mono">operator</span> / password <span className="text-white font-mono">demo1234</span>
              </p>
            </form>
          )}

          {/* ── CREW TAB ── */}
          {tab === 'crew' && (
            <form onSubmit={crewForm.handleSubmit(handleCrewLogin)} className="space-y-4">
              {/* Quick Presets */}
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'hsl(215,20%,55%)' }}>
                  One-Tap Quick Login Presets:
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { code: 'AMB-01', label: '🚑 AMB-01 (Ambulance 1)' },
                    { code: 'BOAT-01', label: '⛵ BOAT-01 (Rescue Boat)' },
                    { code: 'RES-01', label: '🚒 RES-01 (Rescue Squad)' },
                    { code: 'PUMP-01', label: '💧 PUMP-01 (Water Pump)' },
                  ].map((preset) => (
                    <button
                      key={preset.code}
                      type="button"
                      onClick={() => {
                        crewForm.setValue('unitCode', preset.code);
                        crewForm.setValue('pin', '1111');
                        handleCrewLogin({ unitCode: preset.code, pin: '1111' });
                      }}
                      className="px-2.5 py-2 rounded-lg text-xs font-semibold text-left border transition-all hover:border-emerald-500/50 hover:bg-emerald-500/10 active:scale-95"
                      style={{
                        background: 'hsl(222,47%,11%)',
                        borderColor: crewForm.watch('unitCode') === preset.code ? 'hsl(142,71%,45%)' : 'hsl(217,33%,20%)',
                        color: crewForm.watch('unitCode') === preset.code ? 'hsl(142,71%,55%)' : 'hsl(210,40%,90%)',
                      }}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'hsl(215,20%,55%)' }}>
                  Unit Code
                </label>
                <input
                  {...crewForm.register('unitCode')}
                  placeholder="e.g. AMB-01, BOAT-01"
                  className="w-full px-3 py-2.5 rounded-lg text-sm text-white outline-none font-mono uppercase"
                  style={{
                    background: 'hsl(222,47%,12%)',
                    border: `1px solid ${crewForm.formState.errors.unitCode ? 'hsl(0,84%,60%)' : 'hsl(217,33%,18%)'}`,
                  }}
                />
                {crewForm.formState.errors.unitCode && (
                  <p className="mt-1 text-xs" style={{ color: 'hsl(0,84%,60%)' }}>
                    {crewForm.formState.errors.unitCode.message}
                  </p>
                )}
              </div>
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'hsl(215,20%,55%)' }}>
                  PIN
                </label>
                <input
                  {...crewForm.register('pin')}
                  type="password"
                  maxLength={4}
                  placeholder="1111"
                  className="w-full px-3 py-2.5 rounded-lg text-sm text-white outline-none font-mono tracking-widest"
                  style={{
                    background: 'hsl(222,47%,12%)',
                    border: `1px solid ${crewForm.formState.errors.pin ? 'hsl(0,84%,60%)' : 'hsl(217,33%,18%)'}`,
                  }}
                />
                {crewForm.formState.errors.pin && (
                  <p className="mt-1 text-xs" style={{ color: 'hsl(0,84%,60%)' }}>
                    {crewForm.formState.errors.pin.message}
                  </p>
                )}
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 rounded-lg font-semibold text-sm flex items-center justify-center gap-2 transition-opacity disabled:opacity-50"
                style={{ background: 'hsl(142,71%,45%)', color: 'hsl(222,47%,6%)' }}
              >
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                Access Crew Dashboard
              </button>
              <p className="text-center text-xs" style={{ color: 'hsl(215,20%,40%)' }}>
                PIN for all units: <span className="text-white font-mono">1111</span> (pre-filled by default)
              </p>
            </form>
          )}

          {/* ── OBSERVER / REVIEWER TAB ── */}
          {tab === 'guest' && (
            <div className="space-y-4">
              <div className="p-4 rounded-lg text-sm" style={{ background: 'hsl(217,91%,60%,0.08)', border: '1px solid hsl(217,91%,60%,0.15)' }}>
                <p className="font-medium text-white mb-2">🔭 Observer / Reviewer Console</p>
                <p style={{ color: 'hsl(215,20%,65%)' }}>
                  Log in as a <strong className="text-white">read-only Observer</strong>.
                  Inspect the live Command Center, active maps, resource allocations, and after-action logs without administrative credentials.
                </p>
              </div>
              <button
                onClick={handleDemoLogin}
                disabled={loading}
                className="w-full py-2.5 rounded-lg font-semibold text-sm flex items-center justify-center gap-2 transition-opacity disabled:opacity-50"
                style={{ background: 'hsl(217,91%,60%)', color: 'hsl(222,47%,6%)' }}
              >
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                Enter Observer Console
              </button>
            </div>
          )}
        </div>

        <p className="text-center mt-6 text-xs" style={{ color: 'hsl(215,20%,35%)' }}>
          Samanvaya · Flood Emergency Response System · Autonomous Coordination
        </p>
      </div>
    </div>
  );
}
