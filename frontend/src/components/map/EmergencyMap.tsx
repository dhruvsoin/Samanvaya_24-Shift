/**
 * EmergencyMap — High-contrast Tactical Leaflet Map for Operations Command.
 *
 * Features:
 * - CartoDB Dark Matter basemap (tactical dark theme eliminates glare & highlights emergencies)
 * - Optional toggle to Standard Daylight Street map
 * - Neon/high-contrast incident markers with radar pulse on critical items
 * - High-visibility road network (emerald green open, amber slow, neon hazard red closed)
 * - Layer filter controls (Incidents, Units, Roads, Zones, Facilities)
 * - Quick 'Recenter Operations' button to auto-fit all active items
 * - Safe null checks & ResizeObserver for zero-glitch resizing
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useAppStore } from '@/store';
import { SEVERITY_CONFIG, UNIT_TYPE_ICONS } from '@/components/common/StatusBadges';
import {
  Layers,
  Crosshair,
  Moon,
  Sun,
  Eye,
  EyeOff,
  Filter,
  Flame,
  Radio,
  Car,
  AlertTriangle,
  Building,
} from 'lucide-react';
import type { Unit } from '@contracts/types';

// Basemap Tile Providers
const TILE_PROVIDERS = {
  dark: {
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
    subdomains: 'abcd',
    maxZoom: 20,
  },
  light: {
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    subdomains: 'abc',
    maxZoom: 19,
  },
};

// Tactical High-Contrast Markers
function createIncidentIcon(severity: string | null, peopleAffected: number = 1): L.DivIcon {
  const isCritical = severity === 'critical';
  const colors: Record<string, { main: string; bg: string; border: string }> = {
    critical: { main: '#f43f5e', bg: '#881337', border: '#fda4af' },
    high:     { main: '#fb923c', bg: '#7c2d12', border: '#fdba74' },
    medium:   { main: '#facc15', bg: '#713f12', border: '#fef08a' },
    low:      { main: '#34d399', bg: '#064e3b', border: '#a7f3d0' },
  };
  const colorCfg = severity && colors[severity] ? colors[severity] : { main: '#94a3b8', bg: '#1e293b', border: '#cbd5e1' };
  const iconSymbol = severity && SEVERITY_CONFIG[severity as keyof typeof SEVERITY_CONFIG]?.icon || '⚠️';

  return L.divIcon({
    className: '',
    html: `
      <div style="position:relative;display:flex;align-items:center;justify-content:center;width:40px;height:40px;">
        ${isCritical ? '<div class="marker-pulse-critical" style="position:absolute;inset:-4px;border-radius:50%;"></div>' : ''}
        <div style="
          width:36px;height:36px;border-radius:50%;
          background:${colorCfg.bg};border:2.5px solid ${colorCfg.border};
          display:flex;align-items:center;justify-content:center;
          font-size:16px;cursor:pointer;
          box-shadow:0 0 14px ${colorCfg.main}aa, 0 4px 10px rgba(0,0,0,0.8);
          position:relative;z-index:2;
        ">
          ${iconSymbol}
          <div style="
            position:absolute;bottom:-4px;right:-4px;
            background:#0f172a;border:1px solid ${colorCfg.border};
            color:#fff;border-radius:8px;font-size:9px;font-weight:800;
            padding:0.5px 3.5px;font-family:monospace;box-shadow:0 1px 3px rgba(0,0,0,0.7);
          ">👥${peopleAffected}</div>
        </div>
      </div>
    `,
    iconSize: [40, 40],
    iconAnchor: [20, 20],
  });
}

function createUnitIcon(unit: Unit): L.DivIcon {
  const emoji = UNIT_TYPE_ICONS[unit.type] ?? '🚗';
  const statusColors: Record<string, { border: string; glow: string }> = {
    available:   { border: '#34d399', glow: '#10b981' },
    en_route:    { border: '#60a5fa', glow: '#3b82f6' },
    on_scene:    { border: '#fbbf24', glow: '#f59e0b' },
    unreachable: { border: '#f87171', glow: '#ef4444' },
    offline:     { border: '#64748b', glow: '#475569' },
    assigned:    { border: '#a78bfa', glow: '#8b5cf6' },
  };
  const color = statusColors[unit.status] ?? { border: '#94a3b8', glow: '#64748b' };

  return L.divIcon({
    className: '',
    html: `
      <div style="
        position:relative;display:flex;flex-direction:column;align-items:center;
        cursor:pointer;
      ">
        <div style="
          width:34px;height:34px;border-radius:8px;
          background:#0f172a;border:2.5px solid ${color.border};
          display:flex;align-items:center;justify-content:center;
          font-size:16px;box-shadow:0 0 12px ${color.glow}88, 0 4px 8px rgba(0,0,0,0.8);
        ">
          ${emoji}
        </div>
        <div style="
          margin-top:2px;background:#020617;border:1px solid ${color.border};
          color:#f1f5f9;font-size:9px;font-weight:800;font-family:monospace;
          padding:0px 4px;border-radius:4px;white-space:nowrap;
          box-shadow:0 2px 4px rgba(0,0,0,0.8);
        ">
          ${unit.unitId}
        </div>
      </div>
    `,
    iconSize: [36, 48],
    iconAnchor: [18, 24],
  });
}

function createFacilityIcon(type: string): L.DivIcon {
  const icons: Record<string, string> = { shelter: '🏫', hospital: '🏥', depot: '🏭' };
  const icon = icons[type] ?? '🏢';
  return L.divIcon({
    className: '',
    html: `
      <div style="
        width:30px;height:30px;border-radius:6px;
        background:#090d16;border:2px solid #38bdf8;
        display:flex;align-items:center;justify-content:center;
        font-size:14px;box-shadow:0 0 10px rgba(56,189,248,0.5);
      ">${icon}</div>
    `,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  });
}

const ROAD_COLORS: Record<string, string> = {
  open: '#10b981',   // Neon Emerald
  slow: '#f59e0b',   // Bright Amber
  closed: '#ef4444', // Neon Red
};

interface Props {
  onSelectIncident: (id: string) => void;
}

export function EmergencyMap({ onSelectIncident }: Props) {
  const mapRef = useRef<L.Map | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);

  // Basemap & Layer controls
  const [mapMode, setMapMode] = useState<'dark' | 'light'>('dark');
  const [visibleLayers, setVisibleLayers] = useState({
    incidents: true,
    units: true,
    roads: true,
    zones: true,
    facilities: true,
  });

  const layersRef = useRef<{
    incidents: Record<string, L.Marker>;
    units: Record<string, L.Marker>;
    facilities: Record<string, L.Marker>;
    roads: Record<string, L.Polyline>;
    zones: Record<string, L.Polygon>;
  }>({
    incidents: {},
    units: {},
    facilities: {},
    roads: {},
    zones: {},
  });

  const updateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Initialize Map
  useEffect(() => {
    if (!containerRef.current) return;

    if ((containerRef.current as any)._leaflet_id != null) {
      delete (containerRef.current as any)._leaflet_id;
    }

    if (mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [12.925, 77.625],
      zoom: 14,
      zoomControl: false, // We use custom position / styled controls
    });

    // Custom dark zoom control in top-left
    L.control.zoom({ position: 'topleft' }).addTo(map);

    // Initial tile layer (CartoDB Dark Matter)
    const provider = TILE_PROVIDERS.dark;
    const tiles = L.tileLayer(provider.url, {
      attribution: provider.attribution,
      subdomains: provider.subdomains,
      maxZoom: provider.maxZoom,
    }).addTo(map);

    tileLayerRef.current = tiles;
    mapRef.current = map;

    const resizeTimeout = setTimeout(() => {
      map.invalidateSize();
    }, 200);

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined' && containerRef.current) {
      resizeObserver = new ResizeObserver(() => {
        map.invalidateSize();
      });
      resizeObserver.observe(containerRef.current);
    }

    return () => {
      clearTimeout(resizeTimeout);
      if (resizeObserver) resizeObserver.disconnect();
      if (updateTimerRef.current) clearTimeout(updateTimerRef.current);
      map.remove();
      mapRef.current = null;
      layersRef.current = {
        incidents: {},
        units: {},
        facilities: {},
        roads: {},
        zones: {},
      };
    };
  }, []);

  // Update Basemap Tiles when MapMode changes
  useEffect(() => {
    if (!mapRef.current) return;
    const provider = TILE_PROVIDERS[mapMode];
    if (tileLayerRef.current) {
      mapRef.current.removeLayer(tileLayerRef.current);
    }
    const newTiles = L.tileLayer(provider.url, {
      attribution: provider.attribution,
      subdomains: provider.subdomains,
      maxZoom: provider.maxZoom,
    }).addTo(mapRef.current);
    tileLayerRef.current = newTiles;
  }, [mapMode]);

  // Throttled map update helper
  const scheduleUpdate = useCallback((updateFn: () => void) => {
    if (updateTimerRef.current) clearTimeout(updateTimerRef.current);
    updateTimerRef.current = setTimeout(updateFn, 80);
  }, []);

  // Recenter / Fit All Items
  const handleRecenter = useCallback(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;
    const group: L.Layer[] = [];

    Object.values(layersRef.current.incidents).forEach((m) => group.push(m));
    Object.values(layersRef.current.units).forEach((m) => group.push(m));

    if (group.length > 0) {
      const featureGroup = L.featureGroup(group);
      map.flyToBounds(featureGroup.getBounds().pad(0.2), { duration: 1.2 });
    } else {
      map.flyTo([12.925, 77.625], 14, { duration: 1 });
    }
  }, []);

  // 1. Incidents Layer
  const incidentsById = useAppStore((s) => s.incidentsById);
  useEffect(() => {
    scheduleUpdate(() => {
      if (!mapRef.current) return;
      const map = mapRef.current;
      const layers = layersRef.current;

      // Remove inactive or toggled-off incidents
      for (const id of Object.keys(layers.incidents)) {
        const incident = incidentsById[id];
        if (!visibleLayers.incidents || !incident || incident.status === 'closed' || incident.status === 'resolved') {
          layers.incidents[id]?.remove();
          delete layers.incidents[id];
        }
      }

      if (!visibleLayers.incidents) return;

      for (const incident of Object.values(incidentsById)) {
        if (incident.status === 'closed' || incident.status === 'resolved') continue;
        if (!incident.location || incident.location.lat == null || incident.location.lng == null) continue;

        const marker = layers.incidents[incident.incidentId];
        const icon = createIncidentIcon(incident.severity, incident.peopleAffected);
        const popupContent = `
          <div style="font-family:Inter,sans-serif;min-width:200px;padding:4px 0;">
            <div style="display:flex;align-items:center;justify-content:between;margin-bottom:6px;">
              <span style="font-weight:800;color:#f8fafc;font-size:13px;letter-spacing:0.5px;">${incident.incidentId}</span>
              <span style="font-size:10px;font-weight:700;color:#f43f5e;background:#88133744;border:1px solid #f43f5e55;padding:1px 6px;border-radius:4px;text-transform:uppercase;">
                ${incident.severity ?? 'Pending'}
              </span>
            </div>
            <p style="color:#e2e8f0;margin:0 0 4px;font-size:12px;font-weight:600;">${incident.summary || 'Emergency Reported'}</p>
            <p style="color:#94a3b8;margin:0 0 4px;font-size:11px;">📍 ${incident.location.label || ''}</p>
            <div style="display:flex;align-items:center;gap:12px;margin-top:6px;font-size:11px;color:#38bdf8;font-weight:600;">
              <span>👥 ${incident.peopleAffected} People</span>
              <span>⚡ Status: ${incident.status}</span>
            </div>
          </div>`;

        if (marker) {
          marker.setLatLng([incident.location.lat, incident.location.lng]);
          marker.setIcon(icon);
          marker.setPopupContent(popupContent);
        } else {
          const m = L.marker([incident.location.lat, incident.location.lng], { icon })
            .addTo(map)
            .bindPopup(popupContent);
          m.on('click', () => onSelectIncident(incident.incidentId));
          layers.incidents[incident.incidentId] = m;
        }
      }
    });
  }, [incidentsById, visibleLayers.incidents, onSelectIncident, scheduleUpdate]);

  // 2. Units Layer
  const unitsById = useAppStore((s) => s.unitsById);
  useEffect(() => {
    scheduleUpdate(() => {
      if (!mapRef.current) return;
      const map = mapRef.current;
      const layers = layersRef.current;

      for (const id of Object.keys(layers.units)) {
        if (!visibleLayers.units || !unitsById[id]) {
          layers.units[id]?.remove();
          delete layers.units[id];
        }
      }

      if (!visibleLayers.units) return;

      for (const unit of Object.values(unitsById)) {
        if (!unit.location || unit.location.lat == null || unit.location.lng == null) continue;

        const marker = layers.units[unit.unitId];
        const icon = createUnitIcon(unit);
        const popupContent = `
          <div style="font-family:Inter,sans-serif;padding:4px 0;">
            <p style="font-weight:800;color:#f8fafc;margin:0 0 2px;font-size:13px;">${unit.unitId} · ${unit.name}</p>
            <p style="color:#38bdf8;margin:0;font-size:11px;font-weight:700;text-transform:uppercase;">
              STATUS: ${unit.status.replace('_', ' ')}
            </p>
            ${unit.assignedIncidentId ? `<p style="color:#fbbf24;margin:6px 0 0;font-size:11px;font-weight:600;">→ Assigned to ${unit.assignedIncidentId}</p>` : ''}
          </div>`;

        if (marker) {
          marker.setLatLng([unit.location.lat, unit.location.lng]);
          marker.setIcon(icon);
          marker.setPopupContent(popupContent);
        } else {
          const m = L.marker([unit.location.lat, unit.location.lng], { icon })
            .addTo(map)
            .bindPopup(popupContent);
          layers.units[unit.unitId] = m;
        }
      }
    });
  }, [unitsById, visibleLayers.units, scheduleUpdate]);

  // 3. Roads Layer
  const roadsById = useAppStore((s) => s.roadsById);
  useEffect(() => {
    scheduleUpdate(() => {
      if (!mapRef.current) return;
      const map = mapRef.current;
      const layers = layersRef.current;

      for (const id of Object.keys(layers.roads)) {
        if (!visibleLayers.roads || !roadsById[id]) {
          layers.roads[id]?.remove();
          delete layers.roads[id];
        }
      }

      if (!visibleLayers.roads) return;

      for (const road of Object.values(roadsById)) {
        if (!Array.isArray(road.geometry) || road.geometry.length === 0) continue;

        const isClosed = road.status === 'closed';
        const isSlow = road.status === 'slow';
        const color = ROAD_COLORS[road.status] ?? '#10b981';
        const weight = isClosed ? 6 : isSlow ? 5 : 4;
        const dashArray = isClosed ? '10,8' : undefined;

        const popup = `
          <div style="font-family:Inter,sans-serif;padding:3px 0;">
            <p style="font-weight:800;color:#f8fafc;margin:0 0 2px;font-size:12px;">${road.name}</p>
            <p style="color:${color};margin:0;font-size:11px;font-weight:800;text-transform:uppercase;">
              ROAD ${road.status} ${isClosed ? '⛔ NO ENTRY' : ''}
            </p>
          </div>`;

        if (layers.roads[road.roadId]) {
          layers.roads[road.roadId].setStyle({ color, weight, dashArray, opacity: 0.95 });
          layers.roads[road.roadId].setPopupContent(popup);
        } else {
          const coords = road.geometry.map(([lat, lng]) => [lat, lng] as L.LatLngTuple);
          const line = L.polyline(coords, { color, weight, opacity: 0.95, dashArray })
            .addTo(map)
            .bindPopup(popup);
          layers.roads[road.roadId] = line;
        }
      }
    });
  }, [roadsById, visibleLayers.roads, scheduleUpdate]);

  // 4. Hazard Zones Layer
  const zonesById = useAppStore((s) => s.zonesById);
  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;
    const layers = layersRef.current;

    for (const id of Object.keys(layers.zones)) {
      if (!visibleLayers.zones || !zonesById[id]) {
        layers.zones[id]?.remove();
        delete layers.zones[id];
      }
    }

    if (!visibleLayers.zones) return;

    for (const zone of Object.values(zonesById)) {
      if (!Array.isArray(zone.polygon) || zone.polygon.length === 0) continue;

      const isDegraded = zone.commsStatus === 'degraded';
      const color = isDegraded ? '#f59e0b' : '#38bdf8';
      const fillOpacity = isDegraded ? 0.16 : 0.05;
      const popup = `
        <div style="font-family:Inter,sans-serif;padding:4px 0;">
          <p style="font-weight:800;color:#f8fafc;margin:0 0 2px;font-size:12px;">${zone.name}</p>
          <p style="color:${isDegraded ? '#fbbf24' : '#34d399'};margin:0;font-size:11px;font-weight:800;">
            ${isDegraded ? '⚠️ COMMS DEGRADED · SMS MESH ACTIVE' : '✅ COMMS OPERATIONAL'}
          </p>
        </div>`;

      if (layers.zones[zone.zoneId]) {
        layers.zones[zone.zoneId].setStyle({ color, fillColor: color, fillOpacity });
        layers.zones[zone.zoneId].setPopupContent(popup);
      } else {
        const coords = zone.polygon.map(([lat, lng]) => [lat, lng] as L.LatLngTuple);
        const polygon = L.polygon(coords, {
          color,
          fillColor: color,
          fillOpacity,
          weight: 2,
          dashArray: '8,6',
        }).addTo(map).bindPopup(popup);
        layers.zones[zone.zoneId] = polygon;
      }
    }
  }, [zonesById, visibleLayers.zones]);

  // 5. Facilities Layer
  const facilitiesById = useAppStore((s) => s.facilitiesById);
  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;
    const layers = layersRef.current;

    for (const id of Object.keys(layers.facilities)) {
      if (!visibleLayers.facilities || !facilitiesById[id]) {
        layers.facilities[id]?.remove();
        delete layers.facilities[id];
      }
    }

    if (!visibleLayers.facilities) return;

    for (const fac of Object.values(facilitiesById)) {
      if (!fac.location || fac.location.lat == null || fac.location.lng == null) continue;
      if (layers.facilities[fac.facilityId]) continue;

      const icon = createFacilityIcon(fac.type);
      const popup = `
        <div style="font-family:Inter,sans-serif;padding:4px 0;">
          <p style="font-weight:800;color:#f8fafc;margin:0 0 2px;font-size:12px;">${fac.name}</p>
          <p style="color:#94a3b8;margin:0;font-size:11px;">${fac.type.toUpperCase()} · ${fac.capacity ? `${fac.capacity} Capacity` : 'Active Hub'}</p>
        </div>`;
      layers.facilities[fac.facilityId] = L.marker([fac.location.lat, fac.location.lng], { icon })
        .addTo(map)
        .bindPopup(popup);
    }
  }, [facilitiesById, visibleLayers.facilities]);

  const activeIncidentsCount = Object.values(incidentsById).filter((i) => i.status !== 'closed' && i.status !== 'resolved').length;
  const activeUnitsCount = Object.keys(unitsById).length;

  return (
    <div className="relative h-full w-full overflow-hidden bg-slate-950">
      {/* Map DOM Canvas */}
      <div ref={containerRef} className="absolute inset-0" />

      {/* ── Top Floating Tactical HUD & Layer Toolbar ── */}
      <div className="absolute top-3 right-3 z-[1000] flex items-center gap-2">
        {/* Recenter View Button */}
        <button
          onClick={handleRecenter}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-white transition active:scale-95 shadow-lg backdrop-blur-md"
          style={{
            background: 'hsl(222,47%,10%,0.92)',
            border: '1px solid hsl(217,33%,22%)',
          }}
          title="Auto-fit all active emergency incidents and responder units"
        >
          <Crosshair className="w-3.5 h-3.5 text-blue-400" />
          <span>Recenter</span>
        </button>

        {/* Dark / Light Basemap Mode Toggle */}
        <button
          onClick={() => setMapMode(mapMode === 'dark' ? 'light' : 'dark')}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-white transition active:scale-95 shadow-lg backdrop-blur-md"
          style={{
            background: 'hsl(222,47%,10%,0.92)',
            border: '1px solid hsl(217,33%,22%)',
          }}
          title={mapMode === 'dark' ? 'Switch to Standard Daylight map' : 'Switch to Tactical Dark Matter map'}
        >
          {mapMode === 'dark' ? (
            <>
              <Sun className="w-3.5 h-3.5 text-amber-400" />
              <span>Street View</span>
            </>
          ) : (
            <>
              <Moon className="w-3.5 h-3.5 text-blue-400" />
              <span>Dark Tactical</span>
            </>
          )}
        </button>

        {/* Layer Visibility Toggles */}
        <div
          className="flex items-center gap-1 p-1 rounded-xl shadow-lg backdrop-blur-md"
          style={{
            background: 'hsl(222,47%,10%,0.92)',
            border: '1px solid hsl(217,33%,22%)',
          }}
        >
          <button
            onClick={() => setVisibleLayers((p) => ({ ...p, incidents: !p.incidents }))}
            className={`px-2 py-1 rounded-lg text-[11px] font-bold transition flex items-center gap-1 ${
              visibleLayers.incidents
                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                : 'text-slate-500 hover:text-slate-300'
            }`}
            title="Toggle Incidents"
          >
            <Flame className="w-3 h-3 text-rose-400" />
            <span>{activeIncidentsCount}</span>
          </button>

          <button
            onClick={() => setVisibleLayers((p) => ({ ...p, units: !p.units }))}
            className={`px-2 py-1 rounded-lg text-[11px] font-bold transition flex items-center gap-1 ${
              visibleLayers.units
                ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40'
                : 'text-slate-500 hover:text-slate-300'
            }`}
            title="Toggle Units"
          >
            <Car className="w-3 h-3 text-blue-400" />
            <span>{activeUnitsCount}</span>
          </button>

          <button
            onClick={() => setVisibleLayers((p) => ({ ...p, roads: !p.roads }))}
            className={`px-2 py-1 rounded-lg text-[11px] font-bold transition flex items-center gap-1 ${
              visibleLayers.roads
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                : 'text-slate-500 hover:text-slate-300'
            }`}
            title="Toggle Road Network"
          >
            <span>🛣️</span>
          </button>

          <button
            onClick={() => setVisibleLayers((p) => ({ ...p, zones: !p.zones }))}
            className={`px-2 py-1 rounded-lg text-[11px] font-bold transition flex items-center gap-1 ${
              visibleLayers.zones
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                : 'text-slate-500 hover:text-slate-300'
            }`}
            title="Toggle Hazard Zones"
          >
            <AlertTriangle className="w-3 h-3 text-amber-400" />
          </button>
        </div>
      </div>

      {/* ── High-Contrast Legend (Bottom-Left) ── */}
      <div
        className="absolute bottom-4 left-4 z-[1000] p-3 rounded-2xl text-xs shadow-2xl backdrop-blur-md transition-all"
        style={{
          background: 'hsl(222,47%,8%,0.94)',
          border: '1px solid hsl(217,33%,22%)',
          maxWidth: '220px',
        }}
      >
        <p className="font-extrabold text-white text-[11px] uppercase tracking-wider mb-2 flex items-center justify-between">
          <span>TACTICAL MAP INTEL</span>
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
        </p>

        <div className="space-y-1.5 text-[11px]">
          <div className="flex items-center gap-2">
            <span className="w-3.5 h-3.5 rounded-full bg-rose-600 border border-rose-300 shadow-[0_0_8px_#f43f5e] shrink-0" />
            <span className="text-slate-200 font-semibold">Critical SOS Emergency</span>
          </div>

          <div className="flex items-center gap-2">
            <span className="w-3.5 h-3.5 rounded-full bg-amber-500 border border-amber-300 shrink-0" />
            <span className="text-slate-300">High / Medium Incident</span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-base leading-none">🚑⛵</span>
            <span className="text-slate-300">Rescue Units (Ambulance / Boat)</span>
          </div>

          <div className="pt-1 border-t border-slate-800 space-y-1">
            <div className="flex items-center gap-2">
              <div className="w-6 h-1 rounded bg-emerald-500 shadow-[0_0_6px_#10b981]" />
              <span className="text-emerald-400 font-bold text-[10px]">ROAD OPEN (SAFE)</span>
            </div>

            <div className="flex items-center gap-2">
              <div className="w-6 h-1 rounded bg-amber-500" />
              <span className="text-amber-400 font-bold text-[10px]">ROAD SLOW / WATERLOGGED</span>
            </div>

            <div className="flex items-center gap-2">
              <div className="w-6 h-1.5 rounded bg-rose-600 shadow-[0_0_8px_#ef4444]" style={{ border: '1px dashed #fff' }} />
              <span className="text-rose-400 font-bold text-[10px]">ROAD CLOSED (SUBMERGED)</span>
            </div>
          </div>

          <div className="pt-1 border-t border-slate-800 flex items-center gap-2">
            <div className="w-4 h-3 rounded bg-amber-500/20 border border-dashed border-amber-400" />
            <span className="text-amber-300 font-medium text-[10px]">Comms Degraded Sector</span>
          </div>
        </div>
      </div>
    </div>
  );
}
