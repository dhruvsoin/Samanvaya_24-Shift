import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { 
  Shield, Radio, Users, AlertTriangle, Loader2, LifeBuoy, 
  Activity, Flame, Droplets, ArrowRight, Lock, User, 
  MapPin, CheckCircle2, Waves, Zap, Compass 
} from 'lucide-react';
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
    <div className="relative min-h-screen w-full flex items-center justify-center p-4 sm:p-6 lg:p-10 font-sans overflow-x-hidden bg-black text-zinc-100">
      {/* Background Image with layered atmospheric overlay */}
      <div 
        className="absolute inset-0 bg-cover bg-center bg-no-repeat opacity-40 mix-blend-luminosity scale-105 transition-transform duration-1000"
        style={{ backgroundImage: "url('/assets/command_center_bg.jpg')" }}
      />
      
      {/* Ambient gradient lighting and subtle dot grid */}
      <div className="absolute inset-0 bg-gradient-to-tr from-zinc-950 via-zinc-900/90 to-blue-950/80 pointer-events-none" />
      <div className="absolute inset-0 bg-grid-dots opacity-20 pointer-events-none" />
      
      {/* Ambient glowing orbs */}
      <div className="absolute top-1/4 -left-32 w-96 h-96 bg-blue-500/15 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 -right-32 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Main Container */}
      <div className="relative z-10 w-full max-w-5xl grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
        
        {/* Left Hero Column */}
        <div className="lg:col-span-6 space-y-6 text-white text-center lg:text-left">
          {/* Official badge */}
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-500/10 border border-blue-400/20 backdrop-blur-md text-blue-300 text-xs font-medium">
            <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
            <Compass className="w-3.5 h-3.5 text-blue-400" />
            <span>National Emergency Management System · NDMA Level 3</span>
          </div>

          <div className="space-y-3">
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-white leading-tight">
              SAMANVAYA <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-cyan-300">EOC</span>
            </h1>
            <p className="text-sm sm:text-base text-zinc-300 max-w-lg font-normal leading-relaxed">
              AI-assisted flood-response coordination, autonomous multi-agency resource allocation, and real-time citizen rescue operations.
            </p>
          </div>

          {/* Feature Highlights Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 text-left">
            <div className="p-3.5 rounded-xl bg-zinc-900/40 border border-zinc-700/60 backdrop-blur-md space-y-1">
              <div className="flex items-center gap-2 text-cyan-400">
                <Zap className="w-4 h-4" />
                <span className="text-xs font-semibold text-white">Sub-Second Dispatch</span>
              </div>
              <p className="text-[11px] text-zinc-400">Autonomous route recalculation avoiding flooded road sectors.</p>
            </div>

            <div className="p-3.5 rounded-xl bg-zinc-900/40 border border-zinc-700/60 backdrop-blur-md space-y-1">
              <div className="flex items-center gap-2 text-blue-400">
                <Waves className="w-4 h-4" />
                <span className="text-xs font-semibold text-white">Hydrological Sensors</span>
              </div>
              <p className="text-[11px] text-zinc-400">Live Adyar & Cooum floodwater depth predictive modeling.</p>
            </div>
          </div>

          {/* Citizen Rescue Preview Tile */}
          <div className="p-4 rounded-xl bg-gradient-to-r from-rose-950/40 to-zinc-900/60 border border-rose-500/30 backdrop-blur-md flex items-center justify-between shadow-lg">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-rose-500/20 border border-rose-500/30 flex items-center justify-center text-rose-400 shrink-0">
                <LifeBuoy className="w-5 h-5 animate-pulse" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-white uppercase tracking-wider">Citizen Distress Portal</h4>
                <p className="text-[11px] text-rose-300">Trapped in floodwaters or requiring medical evacuation?</p>
              </div>
            </div>
            <Link
              to="/sos"
              className="px-3.5 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-md shadow-rose-900/30 transition-all hover:scale-105 shrink-0"
            >
              <span>SEND SOS</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          {/* Operational live badge */}
          <div className="flex items-center justify-center lg:justify-start gap-4 text-xs text-zinc-400 pt-1">
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              <span>Gateway: Online</span>
            </div>
            <div className="flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-blue-400" />
              <span>Zone 4 (Bengaluru Central)</span>
            </div>
          </div>
        </div>

        {/* Right Glass Card (Login Terminal) */}
        <div className="lg:col-span-6 w-full max-w-md mx-auto">
          <div className="glass-card p-6 sm:p-8 space-y-6 relative overflow-hidden">
            {/* Subtle top accent bar */}
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-600 via-cyan-500 to-indigo-600" />

            {/* Portal Header */}
            <div className="text-center space-y-1">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400 shadow-sm mb-2">
                <Shield className="w-6 h-6" />
              </div>
              <h2 className="text-xl font-bold text-zinc-100">Operations Sign In</h2>
              <p className="text-xs text-zinc-400">
                Authenticate with authorized tactical credentials
              </p>
            </div>

            {/* Segmented Tab Controls */}
            <div className="flex rounded-xl p-1 bg-zinc-900 border border-zinc-800">
              {([
                { id: 'operator', label: 'EOC Command', icon: Shield },
                { id: 'crew', label: 'Field Crew', icon: Users },
                { id: 'guest', label: 'Observer', icon: Radio },
              ] as { id: Tab; label: string; icon: React.ElementType }[]).map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => { setTab(id); setError(null); }}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-all ${
                    tab === id
                      ? 'bg-zinc-800 text-blue-400 shadow-sm border border-zinc-700/80'
                      : 'text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{label}</span>
                </button>
              ))}
            </div>

            {/* Error Banner */}
            {error && (
              <div className="flex items-center gap-2.5 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs">
                <AlertTriangle className="w-4 h-4 shrink-0 text-rose-500" />
                <span>{error}</span>
              </div>
            )}

            {/* OPERATOR TAB */}
            {tab === 'operator' && (
              <form onSubmit={opForm.handleSubmit(handleOperatorLogin)} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                    Operator Call Sign / Username
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 text-zinc-500 absolute left-3 top-2.5" />
                    <input
                      {...opForm.register('username')}
                      placeholder="operator"
                      autoComplete="username"
                      className="w-full pl-9 pr-3 py-2 rounded-xl bg-zinc-900 border border-zinc-700 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 shadow-xs transition-all"
                    />
                  </div>
                  {opForm.formState.errors.username && (
                    <p className="mt-1 text-xs text-rose-400 font-medium">
                      {opForm.formState.errors.username.message}
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                    Security Passkey
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-zinc-500 absolute left-3 top-2.5" />
                    <input
                      {...opForm.register('password')}
                      type="password"
                      placeholder="••••••••"
                      autoComplete="current-password"
                      className="w-full pl-9 pr-3 py-2 rounded-xl bg-zinc-900 border border-zinc-700 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 shadow-xs transition-all"
                    />
                  </div>
                  {opForm.formState.errors.password && (
                    <p className="mt-1 text-xs text-rose-400 font-medium">
                      {opForm.formState.errors.password.message}
                    </p>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2.5 rounded-xl text-sm font-semibold bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 text-white flex items-center justify-center gap-2 shadow-md shadow-blue-900/50 transition-all hover:shadow-lg disabled:opacity-50 cursor-pointer"
                >
                  {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>Sign In as EOC Commander</span>
                </button>

                {/* 1-Click Quick Demo Pill */}
                <div className="pt-1 flex items-center justify-between text-xs text-zinc-400 bg-zinc-900/50 p-2.5 rounded-lg border border-zinc-800">
                  <span>Demo: <code className="font-semibold text-zinc-200">operator</code> / <code className="font-semibold text-zinc-200">demo1234</code></span>
                  <button
                    type="button"
                    onClick={() => {
                      opForm.setValue('username', 'operator');
                      opForm.setValue('password', 'demo1234');
                      handleOperatorLogin({ username: 'operator', password: 'demo1234' });
                    }}
                    className="text-blue-400 font-semibold hover:text-blue-300 text-xs underline cursor-pointer"
                  >
                    Quick Sign-In →
                  </button>
                </div>
              </form>
            )}

            {/* CREW TAB */}
            {tab === 'crew' && (
              <form onSubmit={crewForm.handleSubmit(handleCrewLogin)} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-zinc-300 mb-2">
                    Quick Unit Select:
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
                          className={`p-2.5 rounded-xl text-left border transition-all flex items-center gap-2 text-xs font-medium cursor-pointer ${
                            isSelected
                              ? 'bg-blue-900/30 border-blue-500/50 text-blue-400 font-bold shadow-xs'
                              : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:bg-zinc-800'
                          }`}
                        >
                          <Icon className="w-4 h-4 shrink-0 text-blue-400" />
                          <span className="truncate">{preset.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                    Unit Call Sign
                  </label>
                  <input
                    {...crewForm.register('unitCode')}
                    placeholder="e.g. AMB-01, BOAT-01"
                    className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-700 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 font-mono uppercase shadow-xs transition-all"
                  />
                  {crewForm.formState.errors.unitCode && (
                    <p className="mt-1 text-xs text-rose-400 font-medium">
                      {crewForm.formState.errors.unitCode.message}
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                    Terminal PIN
                  </label>
                  <input
                    {...crewForm.register('pin')}
                    type="password"
                    maxLength={4}
                    placeholder="1111"
                    className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-700 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 font-mono tracking-widest shadow-xs transition-all"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2.5 rounded-xl text-sm font-semibold bg-emerald-600 hover:bg-emerald-500 text-white flex items-center justify-center gap-2 shadow-md shadow-emerald-900/50 transition-all disabled:opacity-50 cursor-pointer"
                >
                  {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>Access Field Terminal</span>
                </button>
                <p className="text-center text-xs text-zinc-500">
                  Default PIN: <code className="bg-zinc-800 text-zinc-300 px-1.5 py-0.5 rounded border border-zinc-700">1111</code>
                </p>
              </form>
            )}

            {/* OBSERVER TAB */}
            {tab === 'guest' && (
              <div className="space-y-4">
                <div className="p-4 rounded-xl bg-zinc-900 border border-zinc-800 text-xs space-y-2 text-zinc-400">
                  <p className="font-bold text-zinc-100 flex items-center gap-2">
                    <Radio className="w-4 h-4 text-blue-400" />
                    Read-Only Telemetry Console
                  </p>
                  <p className="text-xs leading-relaxed text-zinc-400">
                    Observe active disaster dispatches, vehicle GPS tracks, live flood boundary maps, and plan decision audits in real time.
                  </p>
                </div>

                <button
                  onClick={handleDemoLogin}
                  disabled={loading}
                  className="w-full py-2.5 rounded-xl text-sm font-semibold bg-zinc-800 hover:bg-zinc-700 text-zinc-100 flex items-center justify-center gap-2 shadow-md transition-all disabled:opacity-50 cursor-pointer"
                >
                  {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>Enter Observer Console</span>
                </button>
              </div>
            )}

            {/* Security Notice Footer */}
            <div className="text-center text-[11px] text-zinc-500 flex items-center justify-center gap-1.5 pt-2 border-t border-zinc-800/50">
              <Shield className="w-3 h-3 text-zinc-500" />
              <span>TLS 1.3 Encrypted Session · National Disaster Mesh</span>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
