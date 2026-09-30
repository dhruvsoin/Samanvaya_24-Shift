import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Shield, Radio, Users, AlertTriangle, Loader2, LifeBuoy, Activity, Flame, Droplets, ArrowRight } from 'lucide-react';
import { api } from '@/api/client';
import { useAuthStore } from '@/store/auth';

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
    <div className="min-h-screen flex items-center justify-center bg-obsidian-canvas text-slate-100 font-sans px-4 py-8">
      <div className="w-full max-w-md space-y-5">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-lg bg-obsidian-well border border-obsidian-border text-sky-400">
            <Radio className="w-6 h-6" />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-white font-mono uppercase">SAMANVAYA</h1>
          <p className="text-xs text-slate-400">
            Emergency Response & Autonomous Tactical Coordination
          </p>
        </div>

        {/* SOS Citizen Banner */}
        <div className="p-3.5 rounded bg-obsidian-well border border-rose-500/30 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400">
              <LifeBuoy className="w-4 h-4" />
            </div>
            <div>
              <p className="text-xs font-semibold text-white">Trapped in Floodwaters?</p>
              <p className="text-[11px] text-slate-400">Citizen emergency assistance portal</p>
            </div>
          </div>
          <Link
            to="/sos"
            className="px-3 py-1.5 rounded bg-rose-600 hover:bg-rose-500 text-white text-xs font-mono font-medium flex items-center gap-1 transition-colors"
          >
            <span>SEND SOS</span>
            <ArrowRight className="w-3 h-3" />
          </Link>
        </div>

        {/* Card */}
        <div className="rounded-lg p-5 bg-obsidian-well border border-obsidian-border space-y-4">
          {/* Tabs */}
          <div className="flex rounded p-1 bg-obsidian-canvas border border-obsidian-border/60">
            {([
              { id: 'operator', label: 'EOC Command', icon: Shield },
              { id: 'crew', label: 'Field Crew', icon: Users },
              { id: 'guest', label: 'Observer', icon: Radio },
            ] as { id: Tab; label: string; icon: React.ElementType }[]).map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => { setTab(id); setError(null); }}
                className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded text-xs font-medium transition-colors ${
                  tab === id
                    ? 'bg-obsidian-surface text-white border border-obsidian-border'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{label}</span>
              </button>
            ))}
          </div>

          {/* Error message */}
          {error && (
            <div className="flex items-center gap-2 p-2.5 rounded bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs">
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{error}</span>
            </div>
          )}

          {/* OPERATOR TAB */}
          {tab === 'operator' && (
            <form onSubmit={opForm.handleSubmit(handleOperatorLogin)} className="space-y-3.5">
              <div>
                <label className="block text-[11px] font-mono uppercase text-slate-400 mb-1">
                  Username
                </label>
                <input
                  {...opForm.register('username')}
                  placeholder="operator"
                  autoComplete="username"
                  className="w-full px-3 py-2 rounded bg-obsidian-surface border border-obsidian-border text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-400"
                />
                {opForm.formState.errors.username && (
                  <p className="mt-1 text-[11px] text-rose-400">
                    {opForm.formState.errors.username.message}
                  </p>
                )}
              </div>
              <div>
                <label className="block text-[11px] font-mono uppercase text-slate-400 mb-1">
                  Password
                </label>
                <input
                  {...opForm.register('password')}
                  type="password"
                  placeholder="••••••••"
                  autoComplete="current-password"
                  className="w-full px-3 py-2 rounded bg-obsidian-surface border border-obsidian-border text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-400"
                />
                {opForm.formState.errors.password && (
                  <p className="mt-1 text-[11px] text-rose-400">
                    {opForm.formState.errors.password.message}
                  </p>
                )}
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 rounded font-mono text-xs font-semibold bg-sky-600 hover:bg-sky-500 text-white flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
              >
                {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Sign In as Operator
              </button>
              <p className="text-center text-[11px] font-mono text-slate-500">
                Default: <span className="text-slate-300">operator</span> / <span className="text-slate-300">demo1234</span>
              </p>
            </form>
          )}

          {/* CREW TAB */}
          {tab === 'crew' && (
            <form onSubmit={crewForm.handleSubmit(handleCrewLogin)} className="space-y-3.5">
              <div>
                <label className="block text-[11px] font-mono uppercase text-slate-400 mb-1.5">
                  Select Unit Profile:
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { code: 'AMB-01', label: 'AMB-01 (Ambulance)', icon: Activity },
                    { code: 'BOAT-01', label: 'BOAT-01 (Rescue Boat)', icon: LifeBuoy },
                    { code: 'RES-01', label: 'RES-01 (Squad 1)', icon: Flame },
                    { code: 'PUMP-01', label: 'PUMP-01 (Water Pump)', icon: Droplets },
                  ].map((preset) => {
                    const Icon = preset.icon;
                    const isSelected = crewForm.watch('unitCode') === preset.code;
                    return (
                      <button
                        key={preset.code}
                        type="button"
                        onClick={() => {
                          crewForm.setValue('unitCode', preset.code);
                          crewForm.setValue('pin', '1111');
                          handleCrewLogin({ unitCode: preset.code, pin: '1111' });
                        }}
                        className={`p-2 rounded text-left border transition-colors flex items-center gap-2 text-xs font-mono ${
                          isSelected
                            ? 'bg-sky-500/10 border-sky-400 text-sky-300'
                            : 'bg-obsidian-surface border-obsidian-border text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        <Icon className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate">{preset.code}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-mono uppercase text-slate-400 mb-1">
                  Unit Code
                </label>
                <input
                  {...crewForm.register('unitCode')}
                  placeholder="e.g. AMB-01, BOAT-01"
                  className="w-full px-3 py-2 rounded bg-obsidian-surface border border-obsidian-border text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-400 font-mono uppercase"
                />
                {crewForm.formState.errors.unitCode && (
                  <p className="mt-1 text-[11px] text-rose-400">
                    {crewForm.formState.errors.unitCode.message}
                  </p>
                )}
              </div>
              <div>
                <label className="block text-[11px] font-mono uppercase text-slate-400 mb-1">
                  Terminal PIN
                </label>
                <input
                  {...crewForm.register('pin')}
                  type="password"
                  maxLength={4}
                  placeholder="1111"
                  className="w-full px-3 py-2 rounded bg-obsidian-surface border border-obsidian-border text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-400 font-mono tracking-widest"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 rounded font-mono text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
              >
                {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Access Crew Terminal
              </button>
              <p className="text-center text-[11px] font-mono text-slate-500">
                PIN: <span className="text-slate-300">1111</span> (auto-filled)
              </p>
            </form>
          )}

          {/* OBSERVER TAB */}
          {tab === 'guest' && (
            <div className="space-y-3.5">
              <div className="p-3 rounded bg-obsidian-surface/60 border border-obsidian-border text-xs space-y-1">
                <p className="font-semibold text-white">Observer Mode</p>
                <p className="text-slate-400 text-[11px] leading-relaxed">
                  Enter the operations room in read-only mode to monitor incident telemetry, real-time map feeds, and plan audits.
                </p>
              </div>
              <button
                onClick={handleDemoLogin}
                disabled={loading}
                className="w-full py-2.5 rounded font-mono text-xs font-semibold bg-obsidian-surface hover:bg-obsidian-border text-slate-200 border border-obsidian-border flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
              >
                {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Enter Observer Console
              </button>
            </div>
          )}
        </div>

        <p className="text-center text-[11px] font-mono text-slate-600">
          Samanvaya Autonomous Emergency Mesh
        </p>
      </div>
    </div>
  );
}
