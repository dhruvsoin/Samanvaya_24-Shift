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

// Tactical High-Precision Obsidian Markers
function createIncidentIcon(severity: string | null, peopleAffected: number = 1): L.DivIcon {
  const isCritical = severity === 'critical';
  const colors: Record<string, { main: string; bg: string; border: string }> = {
    critical: { main: '#F43F5E', bg: '#0F172A', border: '#FB7185' },
    high:     { main: '#F59E0B', bg: '#0F172A', border: '#FBBF24' },
    medium:   { main: '#38BDF8', bg: '#0F172A', border: '#7DD3FC' },
    low:      { main: '#10B981', bg: '#0F172A', border: '#34D399' },
  };
  const colorCfg = severity && colors[severity] ? colors[severity] : { main: '#94A3B8', bg: '#0F172A', border: '#CBD5E1' };

  return L.divIcon({
    className: '',
    html: `
      <div style="position:relative;display:flex;align-items:center;justify-content:center;width:34px;height:34px;cursor:pointer;">
        ${isCritical ? '<div style="position:absolute;inset:-3px;border-radius:50%;border:1.5px solid #F43F5E;animation:ping 2s cubic-bezier(0,0,0.2,1) infinite;opacity:0.6;"></div>' : ''}
        <div style="
          width:28px;height:28px;border-radius:50%;
          background:${colorCfg.bg};border:1.5px solid ${colorCfg.border};
          display:flex;align-items:center;justify-content:center;
          box-shadow:0 4px 12px rgba(0,0,0,0.65);
          position:relative;z-index:2;
        ">
          <div style="width:8px;height:8px;border-radius:50%;background:${colorCfg.border};"></div>
          <div style="
            position:absolute;bottom:-3px;right:-3px;
            background:#0B0F17;border:1px solid ${colorCfg.border};
            color:#F8FAFC;border-radius:6px;font-size:8px;font-weight:700;
            padding:0px 3px;font-family:'JetBrains Mono',monospace;
          ">${peopleAffected}</div>
        </div>
      </div>
    `,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
  });
}

function createUnitIcon(unit: Unit): L.DivIcon {
  const statusColors: Record<string, { dot: string; border: string }> = {
    available:   { dot: '#34D399', border: 'rgba(52,211,153,0.4)' },
    en_route:    { dot: '#38BDF8', border: 'rgba(56,189,248,0.4)' },
    on_scene:    { dot: '#FBBF24', border: 'rgba(251,191,36,0.4)' },
    unreachable: { dot: '#FB7185', border: 'rgba(251,113,133,0.4)' },
    offline:     { dot: '#64748B', border: 'rgba(100,116,139,0.3)' },
    assigned:    { dot: '#818CF8', border: 'rgba(129,140,248,0.4)' },
  };
  const color = statusColors[unit.status] ?? { dot: '#94A3B8', border: 'rgba(148,163,184,0.3)' };

  return L.divIcon({
    className: '',
    html: `
      <div style="
        display:inline-flex;align-items:center;gap:4px;
        background:#0B0F17;border:1px solid ${color.border};
        padding:2px 5px;border-radius:4px;cursor:pointer;
        box-shadow:0 3px 8px rgba(0,0,0,0.6);white-space:nowrap;
      ">
        <span style="width:6px;height:6px;border-radius:50%;background:${color.dot};display:inline-block;flex-shrink:0;"></span>
        <span style="font-family:'JetBrains Mono',monospace;font-size:10px;font-weight:600;color:#F8FAFC;">${unit.unitId}</span>
      </div>
    `,
    iconSize: [60, 20],
    iconAnchor: [30, 10],
  });
}

function createFacilityIcon(type: string): L.DivIcon {
  const labels: Record<string, string> = { shelter: 'SHELTER', hospital: 'MED-FAC', depot: 'DEPOT' };
  const label = labels[type] ?? 'FAC';
  return L.divIcon({
    className: '',
    html: `
      <div style="
        display:inline-flex;align-items:center;gap:3px;
        background:#0F172A;border:1px solid rgba(56,189,248,0.35);
        padding:1.5px 4.5px;border-radius:3px;
        color:#38BDF8;font-family:'JetBrains Mono',monospace;font-size:9px;font-weight:600;
        box-shadow:0 2px 6px rgba(0,0,0,0.6);
      ">
        <span style="width:4px;height:4px;border-radius:50%;background:#38BDF8;"></span>
        <span>${label}</span>
      </div>
    `,
    iconSize: [50, 18],
    iconAnchor: [25, 9],
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
              <Moon className="w-3.5 h-3.5 text-[#38BDF8]" />
              <span>Dark Matter</span>
            </>
          )}
        </button>

        {/* Layer Visibility Toggles */}
        <div
          className="flex items-center gap-1 p-1 rounded-lg shadow-lg backdrop-blur-md bg-[#0B0F17]/90 border border-[#1E293B]"
        >
          <button
            onClick={() => setVisibleLayers((p) => ({ ...p, incidents: !p.incidents }))}
            className={`px-2 py-1 rounded text-[11px] font-mono font-medium transition flex items-center gap-1.5 ${
              visibleLayers.incidents
                ? 'bg-rose-500/15 text-rose-300 border border-rose-500/30'
                : 'text-slate-500 hover:text-slate-300'
            }`}
            title="Toggle Incidents"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
            <span>Incidents ({activeIncidentsCount})</span>
          </button>

          <button
            onClick={() => setVisibleLayers((p) => ({ ...p, units: !p.units }))}
            className={`px-2 py-1 rounded text-[11px] font-mono font-medium transition flex items-center gap-1.5 ${
              visibleLayers.units
                ? 'bg-[#38BDF8]/15 text-[#38BDF8] border border-[#38BDF8]/30'
                : 'text-slate-500 hover:text-slate-300'
            }`}
            title="Toggle Units"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-[#38BDF8]" />
            <span>Fleet ({activeUnitsCount})</span>
          </button>

          <button
            onClick={() => setVisibleLayers((p) => ({ ...p, roads: !p.roads }))}
            className={`px-2 py-1 rounded text-[11px] font-mono font-medium transition flex items-center gap-1.5 ${
              visibleLayers.roads
                ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                : 'text-slate-500 hover:text-slate-300'
            }`}
            title="Toggle Road Network"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            <span>Roads</span>
          </button>

          <button
            onClick={() => setVisibleLayers((p) => ({ ...p, zones: !p.zones }))}
            className={`px-2 py-1 rounded text-[11px] font-mono font-medium transition flex items-center gap-1.5 ${
              visibleLayers.zones
                ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                : 'text-slate-500 hover:text-slate-300'
            }`}
            title="Toggle Hazard Zones"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
            <span>Zones</span>
          </button>
        </div>
      </div>

      {/* ── High-Contrast Legend (Bottom-Left) ── */}
      <div
        className="absolute bottom-4 left-4 z-[1000] p-2.5 rounded-lg text-xs shadow-2xl backdrop-blur-md transition-all bg-[#0B0F17]/95 border border-[#1E293B]"
        style={{ maxWidth: '210px' }}
      >
        <div className="flex items-center justify-between mb-2">
          <span className="font-mono text-[10px] font-semibold text-slate-300 uppercase tracking-wider">Map Telemetry</span>
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
        </div>

        <div className="space-y-1.5 text-[10px] font-sans">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500 border border-rose-300 shrink-0" />
            <span className="text-slate-200">Critical / SOS Emergency</span>
          </div>

          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 border border-amber-300 shrink-0" />
            <span className="text-slate-300">High / Advisory Incident</span>
          </div>

          <div className="flex items-center gap-2">
            <span className="px-1 py-0.2 rounded bg-slate-800 border border-slate-700 text-slate-300 font-mono text-[9px]">UNIT</span>
            <span className="text-slate-300">Active Field Responder</span>
          </div>

          <div className="pt-1 border-t border-[#1E293B] space-y-1">
            <div className="flex items-center gap-2">
              <div className="w-4 h-0.5 rounded bg-emerald-500" />
              <span className="text-emerald-400 font-mono font-medium">Road Open</span>
            </div>

            <div className="flex items-center gap-2">
              <div className="w-4 h-0.5 rounded bg-amber-500" />
              <span className="text-amber-400 font-mono font-medium">Road Constrained</span>
            </div>

            <div className="flex items-center gap-2">
              <div className="w-4 h-0.5 rounded bg-rose-500" style={{ borderBottom: '1px dashed #fff' }} />
              <span className="text-rose-400 font-mono font-medium">Road Submerged</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
