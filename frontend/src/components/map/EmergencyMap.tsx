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
  light: {
    url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
    subdomains: 'abcd',
    maxZoom: 20,
  },
  dark: {
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
    subdomains: 'abcd',
    maxZoom: 20,
  },
};

// Enterprise Clean Markers
function createIncidentIcon(severity: string | null, peopleAffected: number = 1): L.DivIcon {
  const isCritical = severity === 'critical';
  const colors: Record<string, { main: string; bg: string; border: string }> = {
    critical: { main: '#BE123C', bg: '#FFF1F2', border: '#FDA4AF' },
    high:     { main: '#B45309', bg: '#FFFBEB', border: '#FCD34D' },
    medium:   { main: '#1D4ED8', bg: '#EFF6FF', border: '#93C5FD' },
    low:      { main: '#047857', bg: '#ECFDF5', border: '#6EE7B7' },
  };
  const colorCfg = severity && colors[severity] ? colors[severity] : { main: '#475569', bg: '#F8FAFC', border: '#CBD5E1' };

  return L.divIcon({
    className: '',
    html: `
      <div style="position:relative;display:flex;align-items:center;justify-content:center;width:32px;height:32px;cursor:pointer;">
        ${isCritical ? '<div style="position:absolute;inset:-3px;border-radius:50%;border:2px solid #BE123C;animation:ping 2s cubic-bezier(0,0,0.2,1) infinite;opacity:0.4;"></div>' : ''}
        <div style="
          width:26px;height:26px;border-radius:50%;
          background:#FFFFFF;border:2px solid ${colorCfg.main};
          display:flex;align-items:center;justify-content:center;
          box-shadow:0 2px 8px rgba(15,23,42,0.18);
          position:relative;z-index:2;
        ">
          <div style="width:8px;height:8px;border-radius:50%;background:${colorCfg.main};"></div>
          <div style="
            position:absolute;bottom:-4px;right:-4px;
            background:${colorCfg.bg};border:1px solid ${colorCfg.border};
            color:${colorCfg.main};border-radius:9999px;font-size:9px;font-weight:700;
            padding:0px 4px;font-family:Inter,system-ui,sans-serif;
          ">${peopleAffected}</div>
        </div>
      </div>
    `,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  });
}

function createUnitIcon(unit: Unit): L.DivIcon {
  const statusColors: Record<string, { dot: string; border: string; bg: string }> = {
    available:   { dot: '#059669', border: '#A7F3D0', bg: '#ECFDF5' },
    en_route:    { dot: '#2563EB', border: '#BFDBFE', bg: '#EFF6FF' },
    on_scene:    { dot: '#D97706', border: '#FDE68A', bg: '#FFFBEB' },
    unreachable: { dot: '#E11D48', border: '#FECDD3', bg: '#FFF1F2' },
    offline:     { dot: '#64748B', border: '#E2E8F0', bg: '#F8FAFC' },
    assigned:    { dot: '#4F46E5', border: '#C7D2FE', bg: '#EEF2FF' },
  };
  const color = statusColors[unit.status] ?? { dot: '#64748B', border: '#E2E8F0', bg: '#F8FAFC' };

  return L.divIcon({
    className: '',
    html: `
      <div style="
        display:inline-flex;align-items:center;gap:4px;
        background:#FFFFFF;border:1px solid #CBD5E1;
        padding:2px 6px;border-radius:4px;cursor:pointer;
        box-shadow:0 2px 6px rgba(15,23,42,0.12);white-space:nowrap;
      ">
        <span style="width:6px;height:6px;border-radius:50%;background:${color.dot};display:inline-block;flex-shrink:0;"></span>
        <span style="font-family:Inter,system-ui,sans-serif;font-size:10px;font-weight:600;color:#0F172A;">${unit.unitId}</span>
      </div>
    `,
    iconSize: [60, 22],
    iconAnchor: [30, 11],
  });
}

function createFacilityIcon(type: string): L.DivIcon {
  const labels: Record<string, string> = { shelter: 'SHELTER', hospital: 'HOSPITAL', depot: 'DEPOT' };
  const label = labels[type] ?? 'FACILITY';
  return L.divIcon({
    className: '',
    html: `
      <div style="
        display:inline-flex;align-items:center;gap:3px;
        background:#FFFFFF;border:1px solid #93C5FD;
        padding:2px 5px;border-radius:4px;
        color:#1D4ED8;font-family:Inter,system-ui,sans-serif;font-size:9px;font-weight:600;
        box-shadow:0 2px 4px rgba(15,23,42,0.1);
      ">
        <span style="width:4px;height:4px;border-radius:50%;background:#2563EB;"></span>
        <span>${label}</span>
      </div>
    `,
    iconSize: [60, 20],
    iconAnchor: [30, 10],
  });
}

const ROAD_COLORS: Record<string, string> = {
  open: '#059669',   // Clean Forest Green
  slow: '#D97706',   // Clean Amber
  closed: '#DC2626', // Clean Red
};

interface Props {
  onSelectIncident: (id: string) => void;
}

export function EmergencyMap({ onSelectIncident }: Props) {
  const mapRef = useRef<L.Map | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);

  // Basemap & Layer controls
  const [mapMode, setMapMode] = useState<'dark' | 'light'>('light');
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

    // Custom zoom control in top-left
    L.control.zoom({ position: 'topleft' }).addTo(map);

    // Initial tile layer (CartoDB Positron Light)
    const provider = TILE_PROVIDERS.light;
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
          <div style="font-family:Inter,system-ui,sans-serif;min-width:210px;padding:4px 0;">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
              <span style="font-weight:700;color:#0F172A;font-size:13px;">${incident.incidentId}</span>
              <span style="font-size:10px;font-weight:600;color:#BE123C;background:#FFF1F2;border:1px solid #FECDD3;padding:1px 6px;border-radius:4px;text-transform:uppercase;">
                ${incident.severity ?? 'Assessing'}
              </span>
            </div>
            <p style="color:#1E293B;margin:0 0 4px;font-size:12px;font-weight:500;">${incident.summary || 'Emergency Reported'}</p>
            <p style="color:#64748B;margin:0 0 6px;font-size:11px;">📍 ${incident.location.label || ''}</p>
            <div style="display:flex;align-items:center;gap:12px;margin-top:6px;font-size:11px;color:#2563EB;font-weight:600;border-top:1px solid #F1F5F9;padding-top:4px;">
              <span>👥 ${incident.peopleAffected} People</span>
              <span>Status: ${incident.status}</span>
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
          <div style="font-family:Inter,system-ui,sans-serif;padding:4px 0;">
            <p style="font-weight:700;color:#0F172A;margin:0 0 2px;font-size:13px;">${unit.unitId} · ${unit.name}</p>
            <p style="color:#2563EB;margin:0;font-size:11px;font-weight:600;text-transform:uppercase;">
              STATUS: ${unit.status.replace('_', ' ')}
            </p>
            ${unit.assignedIncidentId ? `<p style="color:#D97706;margin:6px 0 0;font-size:11px;font-weight:500;">→ Assigned to ${unit.assignedIncidentId}</p>` : ''}
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
        const color = ROAD_COLORS[road.status] ?? '#059669';
        const weight = isClosed ? 5 : isSlow ? 4 : 3.5;
        const dashArray = isClosed ? '8,6' : undefined;

        const popup = `
          <div style="font-family:Inter,system-ui,sans-serif;padding:3px 0;">
            <p style="font-weight:700;color:#0F172A;margin:0 0 2px;font-size:12px;">${road.name}</p>
            <p style="color:${color};margin:0;font-size:11px;font-weight:600;text-transform:uppercase;">
              ROAD ${road.status} ${isClosed ? '(Closed to traffic)' : ''}
            </p>
          </div>`;

        if (layers.roads[road.roadId]) {
          layers.roads[road.roadId].setStyle({ color, weight, dashArray, opacity: 0.9 });
          layers.roads[road.roadId].setPopupContent(popup);
        } else {
          const coords = road.geometry.map(([lat, lng]) => [lat, lng] as L.LatLngTuple);
          const line = L.polyline(coords, { color, weight, opacity: 0.9, dashArray })
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
      const color = isDegraded ? '#D97706' : '#2563EB';
      const fillOpacity = isDegraded ? 0.12 : 0.05;
      const popup = `
        <div style="font-family:Inter,system-ui,sans-serif;padding:4px 0;">
          <p style="font-weight:700;color:#0F172A;margin:0 0 2px;font-size:12px;">${zone.name}</p>
          <p style="color:${isDegraded ? '#B45309' : '#047857'};margin:0;font-size:11px;font-weight:600;">
            ${isDegraded ? 'Communications degraded · SMS fallback' : 'Communications normal'}
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
          dashArray: '6,6',
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
        <div style="font-family:Inter,system-ui,sans-serif;padding:4px 0;">
          <p style="font-weight:700;color:#0F172A;margin:0 0 2px;font-size:12px;">${fac.name}</p>
          <p style="color:#64748B;margin:0;font-size:11px;">${fac.type.toUpperCase()} · ${fac.capacity ? `${fac.capacity} Capacity` : 'Active Facility'}</p>
        </div>`;
      layers.facilities[fac.facilityId] = L.marker([fac.location.lat, fac.location.lng], { icon })
        .addTo(map)
        .bindPopup(popup);
    }
  }, [facilitiesById, visibleLayers.facilities]);

  const activeIncidentsCount = Object.values(incidentsById).filter((i) => i.status !== 'closed' && i.status !== 'resolved').length;
  const activeUnitsCount = Object.keys(unitsById).length;

  return (
    <div className="relative h-full w-full overflow-hidden bg-slate-100">
      {/* Map DOM Canvas */}
      <div ref={containerRef} className="absolute inset-0" />

      {/* ── Top-Left Sector HUD Badge ── */}
      <div className="absolute top-3 left-12 z-[1000] hidden sm:flex items-center gap-2.5 px-3 py-1.5 rounded-xl glass-panel text-slate-800 text-xs shadow-md">
        <div className="flex items-center gap-1.5 font-semibold text-slate-900">
          <span className="w-2 h-2 rounded-full bg-blue-600 animate-pulse" />
          <span>Sector 4</span>
        </div>
        <div className="h-3.5 w-px bg-slate-300" />
        <span className="text-[11px] text-slate-500 font-medium">Adyar River Estuary</span>
        <div className="h-3.5 w-px bg-slate-300" />
        <div className="flex items-center gap-1 text-[11px] font-semibold text-rose-600 bg-rose-50 px-2 py-0.5 rounded-md border border-rose-200">
          <span>Surge: +1.4m</span>
        </div>
      </div>

      {/* ── Top Floating Toolbar ── */}
      <div className="absolute top-3 right-3 z-[1000] flex items-center gap-2">
        {/* Recenter View Button */}
        <button
          onClick={handleRecenter}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-700 glass-panel hover:bg-white transition shadow-sm cursor-pointer"
          title="Auto-fit all active emergency incidents and responder units"
        >
          <Crosshair className="w-3.5 h-3.5 text-blue-600" />
          <span>Recenter</span>
        </button>

        {/* Map Mode Toggle */}
        <button
          onClick={() => setMapMode(mapMode === 'dark' ? 'light' : 'dark')}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-700 glass-panel hover:bg-white transition shadow-sm cursor-pointer"
          title={mapMode === 'light' ? 'Switch to Dark Mode map' : 'Switch to Light Mode map'}
        >
          {mapMode === 'light' ? (
            <>
              <Moon className="w-3.5 h-3.5 text-slate-600" />
              <span>Dark Map</span>
            </>
          ) : (
            <>
              <Sun className="w-3.5 h-3.5 text-amber-500" />
              <span>Light Map</span>
            </>
          )}
        </button>

        {/* Layer Visibility Toggles */}
        <div className="flex items-center gap-1 p-1 rounded-xl shadow-sm glass-panel">
          <button
            onClick={() => setVisibleLayers((p) => ({ ...p, incidents: !p.incidents }))}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition flex items-center gap-1.5 cursor-pointer ${
              visibleLayers.incidents
                ? 'bg-rose-500 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
            title="Toggle Incidents"
          >
            <span className={`w-1.5 h-1.5 rounded-full ${visibleLayers.incidents ? 'bg-white' : 'bg-rose-600'}`} />
            <span>Incidents ({activeIncidentsCount})</span>
          </button>

          <button
            onClick={() => setVisibleLayers((p) => ({ ...p, units: !p.units }))}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition flex items-center gap-1.5 cursor-pointer ${
              visibleLayers.units
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
            title="Toggle Units"
          >
            <span className={`w-1.5 h-1.5 rounded-full ${visibleLayers.units ? 'bg-white' : 'bg-blue-600'}`} />
            <span>Fleet ({activeUnitsCount})</span>
          </button>

          <button
            onClick={() => setVisibleLayers((p) => ({ ...p, roads: !p.roads }))}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition flex items-center gap-1.5 cursor-pointer ${
              visibleLayers.roads
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
            title="Toggle Road Network"
          >
            <span className={`w-1.5 h-1.5 rounded-full ${visibleLayers.roads ? 'bg-white' : 'bg-emerald-600'}`} />
            <span>Roads</span>
          </button>

          <button
            onClick={() => setVisibleLayers((p) => ({ ...p, zones: !p.zones }))}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition flex items-center gap-1.5 cursor-pointer ${
              visibleLayers.zones
                ? 'bg-amber-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
            title="Toggle Hazard Zones"
          >
            <span className={`w-1.5 h-1.5 rounded-full ${visibleLayers.zones ? 'bg-white' : 'bg-amber-600'}`} />
            <span>Zones</span>
          </button>
        </div>
      </div>

      {/* ── Legend (Bottom-Left) ── */}
      <div
        className="absolute bottom-4 left-4 z-[1000] p-3 rounded-xl text-xs shadow-md glass-panel"
        style={{ maxWidth: '220px' }}
      >
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-bold text-slate-800 uppercase tracking-wider">Tactical Legend</span>
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
        </div>

        <div className="space-y-1.5 text-[10px] font-sans">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-600 border border-rose-300 shrink-0 shadow-xs" />
            <span className="text-slate-700 font-medium">Critical / SOS Emergency</span>
          </div>

          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 border border-amber-300 shrink-0 shadow-xs" />
            <span className="text-slate-700 font-medium">High / Advisory Incident</span>
          </div>

          <div className="flex items-center gap-2">
            <span className="px-1.5 py-0.5 rounded bg-blue-100 border border-blue-200 text-blue-800 font-mono text-[9px] font-bold">UNIT</span>
            <span className="text-slate-700 font-medium">Field Responder</span>
          </div>

          <div className="pt-2 border-t border-slate-200/80 space-y-1">
            <div className="flex items-center gap-2">
              <div className="w-4 h-1 rounded-full bg-emerald-500" />
              <span className="text-emerald-700 font-semibold">Road Open</span>
            </div>

            <div className="flex items-center gap-2">
              <div className="w-4 h-1 rounded-full bg-amber-500" />
              <span className="text-amber-700 font-semibold">Road Slow (Flooded)</span>
            </div>

            <div className="flex items-center gap-2">
              <div className="w-4 h-1 rounded-full bg-rose-600" />
              <span className="text-rose-700 font-semibold">Road Impassable</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
