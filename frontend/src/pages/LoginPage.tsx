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
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 text-slate-900 font-sans px-4 py-12">
      <div className="w-full max-w-md space-y-4">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-blue-50 border border-blue-200 text-blue-600 shadow-xs">
            <Shield className="w-6 h-6" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Samanvaya EOC</h1>
          <p className="text-xs text-slate-500">
            Emergency Operations & Autonomous Coordination Platform
          </p>
        </div>

        {/* SOS Citizen Banner */}
        <div className="p-3.5 rounded-xl bg-red-50/80 border border-red-200 flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-red-100 border border-red-200 flex items-center justify-center text-red-600 shrink-0">
              <LifeBuoy className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-semibold text-red-950">Citizen in Distress?</p>
              <p className="text-[11px] text-red-700">Immediate public safety & flood rescue</p>
            </div>
          </div>
          <Link
            to="/sos"
            className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-semibold flex items-center gap-1 shadow-xs transition-colors shrink-0"
          >
            <span>SEND SOS</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {/* Card */}
        <div className="rounded-xl p-6 bg-white border border-slate-200 shadow-xs space-y-5">
          {/* Tabs */}
          <div className="flex rounded-lg p-1 bg-slate-100 border border-slate-200">
            {([
              { id: 'operator', label: 'EOC Command', icon: Shield },
              { id: 'crew', label: 'Field Crew', icon: Users },
              { id: 'guest', label: 'Observer', icon: Radio },
            ] as { id: Tab; label: string; icon: React.ElementType }[]).map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => { setTab(id); setError(null); }}
                className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-medium transition-all ${
                  tab === id
                    ? 'bg-white text-slate-900 font-semibold shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{label}</span>
              </button>
            ))}
          </div>

          {/* Error message */}
          {error && (
            <div className="flex items-center gap-2.5 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs">
              <AlertTriangle className="w-4 h-4 shrink-0 text-red-600" />
              <span>{error}</span>
            </div>
          )}

          {/* OPERATOR TAB */}
          {tab === 'operator' && (
            <form onSubmit={opForm.handleSubmit(handleOperatorLogin)} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Operator Username
                </label>
                <input
                  {...opForm.register('username')}
                  placeholder="operator"
                  autoComplete="username"
                  className="w-full px-3 py-2 rounded-lg bg-white border border-slate-300 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition-colors"
                />
                {opForm.formState.errors.username && (
                  <p className="mt-1 text-xs text-red-600">
                    {opForm.formState.errors.username.message}
                  </p>
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Password
                </label>
                <input
                  {...opForm.register('password')}
                  type="password"
                  placeholder="••••••••"
                  autoComplete="current-password"
                  className="w-full px-3 py-2 rounded-lg bg-white border border-slate-300 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition-colors"
                />
                {opForm.formState.errors.password && (
                  <p className="mt-1 text-xs text-red-600">
                    {opForm.formState.errors.password.message}
                  </p>
                )}
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 rounded-lg text-sm font-semibold bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center gap-2 shadow-xs transition-colors disabled:opacity-50"
              >
                {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Sign In to Command Center
              </button>
              <p className="text-center text-xs text-slate-500">
                Demo access: <code className="bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded border border-slate-200">operator</code> / <code className="bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded border border-slate-200">demo1234</code>
              </p>
            </form>
          )}

          {/* CREW TAB */}
          {tab === 'crew' && (
            <form onSubmit={crewForm.handleSubmit(handleCrewLogin)} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-2">
                  Select Unit Profile
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { code: 'AMB-01', label: 'Ambulance 01', icon: Activity },
                    { code: 'BOAT-01', label: 'Rescue Boat 01', icon: LifeBuoy },
                    { code: 'RES-01', label: 'Rescue Squad 01', icon: Flame },
                    { code: 'PUMP-01', label: 'High-Vol Pump', icon: Droplets },
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
                        className={`p-2.5 rounded-lg text-left border transition-all flex items-center gap-2 text-xs font-medium ${
                          isSelected
                            ? 'bg-blue-50 border-blue-500 text-blue-700 font-semibold shadow-xs'
                            : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <Icon className="w-4 h-4 shrink-0 text-blue-600" />
                        <span className="truncate">{preset.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Unit Call Sign
                </label>
                <input
                  {...crewForm.register('unitCode')}
                  placeholder="e.g. AMB-01, BOAT-01"
                  className="w-full px-3 py-2 rounded-lg bg-white border border-slate-300 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 uppercase font-mono transition-colors"
                />
                {crewForm.formState.errors.unitCode && (
                  <p className="mt-1 text-xs text-red-600">
                    {crewForm.formState.errors.unitCode.message}
                  </p>
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Terminal Security PIN
                </label>
                <input
                  {...crewForm.register('pin')}
                  type="password"
                  maxLength={4}
                  placeholder="1111"
                  className="w-full px-3 py-2 rounded-lg bg-white border border-slate-300 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 font-mono tracking-widest transition-colors"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 rounded-lg text-sm font-semibold bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center gap-2 shadow-xs transition-colors disabled:opacity-50"
              >
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                Connect Field Terminal
              </button>
              <p className="text-center text-xs text-slate-500">
                Default PIN: <code className="bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded border border-slate-200">1111</code>
              </p>
            </form>
          )}

          {/* OBSERVER TAB */}
          {tab === 'guest' && (
            <div className="space-y-4">
              <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 text-xs space-y-1.5 text-slate-600">
                <p className="font-semibold text-slate-900">Read-Only Observer Access</p>
                <p className="text-xs leading-relaxed text-slate-600">
                  Access live incident map telemetry, dispatch event streams, and after-action review summaries in observer mode without operational write permissions.
                </p>
              </div>
              <button
                onClick={handleDemoLogin}
                disabled={loading}
                className="w-full py-2.5 rounded-lg text-sm font-medium bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
              >
                {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Enter Observer Console
              </button>
            </div>
          )}
        </div>

        <p className="text-center text-xs text-slate-400">
          Official Disaster Management Operations Network
        </p>
      </div>
    </div>
  );
}
