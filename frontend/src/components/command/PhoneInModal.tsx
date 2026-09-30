/**
 * Phone-in modal — operator manually logs a report received by phone.
 * Uses React Hook Form + Zod for validation.
 */
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { X, Loader2, Phone } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { api } from '@/api/client';
import { useAppStore } from '@/store';

const schema = z.object({
  lat: z.number({ required_error: 'Required' }).min(-90).max(90),
  lng: z.number({ required_error: 'Required' }).min(-180).max(180),
  label: z.string().min(3, 'Location description required'),
  type: z.enum(['flooded_home', 'stranded_vehicle', 'medical', 'trapped_person', 'road_blocked', 'other']),
  peopleAffected: z.number().int().min(1, 'Must be at least 1'),
  language: z.enum(['en', 'kn', 'hi']),
  note: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

interface Props { onClose: () => void }

export function PhoneInModal({ onClose }: Props) {
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const setIncident = useAppStore((s) => s.setIncident);

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      lat: 12.922,
      lng: 77.625,
      type: 'flooded_home',
      peopleAffected: 1,
      language: 'en',
    },
  });

  async function onSubmit(data: FormData) {
    setLoading(true);
    try {
      const incident = await api.phoneIn.submit({
        location: { lat: data.lat, lng: data.lng, label: data.label },
        type: data.type,
        peopleAffected: data.peopleAffected,
        language: data.language,
        note: data.note,
      });
      setIncident(incident);
      setSuccess(true);
      setTimeout(onClose, 1500);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to submit');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity" onClick={onClose} aria-label="Close" />
      <div className="relative w-full max-w-lg rounded-xl bg-white border border-slate-200 shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <Phone className="w-4 h-4 text-blue-600" />
            <h2 className="font-semibold text-slate-900 text-sm">Log Emergency Incident</h2>
          </div>
          <button onClick={onClose} className="p-1 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {success ? (
          <div className="p-8 text-center">
            <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto mb-3 text-lg font-bold">
              ✓
            </div>
            <p className="font-semibold text-slate-900">Incident logged successfully</p>
            <p className="text-xs text-slate-500 mt-1">Dispatched to emergency response queue</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} className="p-5 space-y-4">
            {/* Location */}
            <div className="grid grid-cols-2 gap-3">
              <Field label="Latitude" error={errors.lat?.message}>
                <input {...register('lat', { valueAsNumber: true })} type="number" step="0.001"
                  className="gov-input" />
              </Field>
              <Field label="Longitude" error={errors.lng?.message}>
                <input {...register('lng', { valueAsNumber: true })} type="number" step="0.001"
                  className="gov-input" />
              </Field>
            </div>

            <Field label="Location Description" error={errors.label?.message}>
              <input {...register('label')} placeholder="e.g. Lakeside colony, 2nd cross"
                className="gov-input w-full" />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Incident Type" error={errors.type?.message}>
                <select {...register('type')} className="gov-input w-full">
                  <option value="flooded_home">Flooded Home</option>
                  <option value="stranded_vehicle">Stranded Vehicle</option>
                  <option value="medical">Medical Emergency</option>
                  <option value="trapped_person">Trapped Person</option>
                  <option value="road_blocked">Road Blocked</option>
                  <option value="other">Other</option>
                </select>
              </Field>

              <Field label="Language" error={errors.language?.message}>
                <select {...register('language')} className="gov-input w-full">
                  <option value="en">English</option>
                  <option value="kn">Kannada</option>
                  <option value="hi">Hindi</option>
                </select>
              </Field>
            </div>

            <Field label="People Affected" error={errors.peopleAffected?.message}>
              <input {...register('peopleAffected', { valueAsNumber: true })}
                type="number" min={1} className="gov-input w-full" />
            </Field>

            <Field label="Notes (optional)" error={errors.note?.message}>
              <textarea {...register('note')} rows={2} placeholder="Caller's description…"
                className="gov-input w-full resize-none" />
            </Field>

            <div className="flex gap-2 justify-end pt-2 border-t border-slate-100">
              <button type="button" onClick={onClose}
                className="px-4 py-2 rounded-lg text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors">
                Cancel
              </button>
              <button type="submit" disabled={loading}
                className="px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white shadow-sm transition-colors disabled:opacity-50">
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                Log Incident
              </button>
            </div>
          </form>
        )}
      </div>

      <style>{`
        .gov-input {
          background: #FFFFFF;
          border: 1px solid #CBD5E1;
          border-radius: 6px;
          color: #0F172A;
          padding: 7px 10px;
          font-size: 13px;
          outline: none;
          transition: border-color 0.15s ease;
        }
        .gov-input:focus {
          border-color: #2563EB;
          box-shadow: 0 0 0 1px #2563EB;
        }
      `}</style>
    </div>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium mb-1 text-slate-700">{label}</label>
      {children}
      {error && <p className="mt-1 text-xs text-rose-600 font-medium">{error}</p>}
    </div>
  );
}
