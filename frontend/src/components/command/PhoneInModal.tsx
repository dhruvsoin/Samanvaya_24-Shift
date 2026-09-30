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
      <button className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} aria-label="Close" />
      <div className="relative w-full max-w-lg rounded-2xl"
        style={{ background: 'hsl(222,47%,8%)', border: '1px solid hsl(217,33%,18%)' }}>

        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b" style={{ borderColor: 'hsl(217,33%,18%)' }}>
          <div className="flex items-center gap-2">
            <Phone className="w-4 h-4" style={{ color: 'hsl(217,91%,60%)' }} />
            <h2 className="font-semibold text-white">Log Phone-In Incident</h2>
          </div>
          <button onClick={onClose} style={{ color: 'hsl(215,20%,50%)' }}>
            <X className="w-4 h-4" />
          </button>
        </div>

        {success ? (
          <div className="p-8 text-center">
            <div className="text-4xl mb-3">✅</div>
            <p className="font-semibold text-white">Incident logged successfully</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} className="p-4 space-y-4">
            {/* Location */}
            <div className="grid grid-cols-2 gap-3">
              <Field label="Latitude" error={errors.lat?.message}>
                <input {...register('lat', { valueAsNumber: true })} type="number" step="0.001"
                  className="input-dark" />
              </Field>
              <Field label="Longitude" error={errors.lng?.message}>
                <input {...register('lng', { valueAsNumber: true })} type="number" step="0.001"
                  className="input-dark" />
              </Field>
            </div>

            <Field label="Location Description" error={errors.label?.message}>
              <input {...register('label')} placeholder="e.g. Lakeside colony, 2nd cross"
                className="input-dark w-full" />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Incident Type" error={errors.type?.message}>
                <select {...register('type')} className="input-dark w-full">
                  <option value="flooded_home">Flooded Home</option>
                  <option value="stranded_vehicle">Stranded Vehicle</option>
                  <option value="medical">Medical Emergency</option>
                  <option value="trapped_person">Trapped Person</option>
                  <option value="road_blocked">Road Blocked</option>
                  <option value="other">Other</option>
                </select>
              </Field>

              <Field label="Language" error={errors.language?.message}>
                <select {...register('language')} className="input-dark w-full">
                  <option value="en">English</option>
                  <option value="kn">Kannada</option>
                  <option value="hi">Hindi</option>
                </select>
              </Field>
            </div>

            <Field label="People Affected" error={errors.peopleAffected?.message}>
              <input {...register('peopleAffected', { valueAsNumber: true })}
                type="number" min={1} className="input-dark w-full" />
            </Field>

            <Field label="Notes (optional)" error={errors.note?.message}>
              <textarea {...register('note')} rows={2} placeholder="Caller's description…"
                className="input-dark w-full resize-none" />
            </Field>

            <div className="flex gap-2 justify-end">
              <button type="button" onClick={onClose}
                className="px-4 py-2 rounded-lg text-sm"
                style={{ background: 'hsl(222,47%,12%)', color: 'hsl(215,20%,60%)', border: '1px solid hsl(217,33%,18%)' }}>
                Cancel
              </button>
              <button type="submit" disabled={loading}
                className="px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 disabled:opacity-50"
                style={{ background: 'hsl(217,91%,60%)', color: 'hsl(222,47%,6%)' }}>
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                Log Incident
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Inline style for form inputs */}
      <style>{`
        .input-dark {
          background: hsl(222,47%,12%);
          border: 1px solid hsl(217,33%,22%);
          border-radius: 8px;
          color: white;
          padding: 8px 12px;
          font-size: 13px;
          outline: none;
        }
        .input-dark:focus {
          border-color: hsl(217,91%,60%,0.6);
        }
      `}</style>
    </div>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium mb-1" style={{ color: 'hsl(215,20%,55%)' }}>{label}</label>
      {children}
      {error && <p className="mt-1 text-xs" style={{ color: 'hsl(0,84%,60%)' }}>{error}</p>}
    </div>
  );
}
