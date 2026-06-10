"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import dynamic from "next/dynamic";
import { MapData, MapListItem, MapMarker } from "@/types/map";

const MapView = dynamic(() => import("@/components/MapView"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-screen bg-gray-950 text-gray-400">
      Loading map...
    </div>
  ),
});

interface CustomMarker extends MapMarker {
  _temp?: boolean;
}

interface SavedPolygon {
  id: string;
  points: [number, number][];
  label: string;
  category: string;
  level: string;
}

// Default levels per map
const MAP_LEVELS: Record<string, string[]> = {
  airport: ["Ground", "1F", "B1"],
  armory: ["B1", "1F", "2F"],
  "tv-station": ["1F", "2F"],
  farm: ["Ground"],
  valley: ["Ground"],
  northridge: ["Ground"],
};

export default function Home() {
  const [maps, setMaps] = useState<MapListItem[]>([]);
  const [selectedMap, setSelectedMap] = useState<string>("farm");
  const [mapData, setMapData] = useState<MapData | null>(null);
  const [activeCategories, setActiveCategories] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  // Search
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<MapMarker[]>([]);
  const [selectedMarkerId, setSelectedMarkerId] = useState<string | null>(null);
  const [showSearchResults, setShowSearchResults] = useState(false);

  // Edit mode
  const [editMode, setEditMode] = useState(false);
  const [polygonMode, setPolygonMode] = useState(false);
  const [customMarkers, setCustomMarkers] = useState<CustomMarker[]>([]);
  const [polygonPoints, setPolygonPoints] = useState<[number, number][]>([]);
  const [savedPolygons, setSavedPolygons] = useState<SavedPolygon[]>([]);

  // Current level
  const [currentLevel, setCurrentLevel] = useState("Ground");
  const levels = MAP_LEVELS[selectedMap] || ["Ground"];

  // Marker form
  const [showMarkerForm, setShowMarkerForm] = useState(false);
  const [pendingPosition, setPendingPosition] = useState<[number, number] | null>(null);
  const [newMarkerTitle, setNewMarkerTitle] = useState("");
  const [newMarkerDesc, setNewMarkerDesc] = useState("");
  const [newMarkerCategory, setNewMarkerCategory] = useState("");
  const [newMarkerLevel, setNewMarkerLevel] = useState("Ground");
  const [editingMarkerId, setEditingMarkerId] = useState<string | null>(null);

  // Polygon form
  const [showPolygonForm, setShowPolygonForm] = useState(false);
  const [newPolygonLabel, setNewPolygonLabel] = useState("");
  const [newPolygonCategory, setNewPolygonCategory] = useState("");
  const [newPolygonLevel, setNewPolygonLevel] = useState("Ground");

  const nextMarkerId = useRef(10000);
  const nextPolyId = useRef(500);

  const allMarkers = useCallback(() => {
    if (!mapData) return [];
    return [...mapData.markers, ...customMarkers];
  }, [mapData, customMarkers]);

  // Available levels from built markers
  const usedLevels = useCallback(() => {
    const levelSet = new Set<string>();
    allMarkers().forEach((m) => { if (m.level) levelSet.add(m.level); });
    savedPolygons.forEach((p) => levelSet.add(p.level));
    levels.forEach((l) => levelSet.add(l));
    return Array.from(levelSet);
  }, [allMarkers, savedPolygons, levels]);

  // Fetch maps
  useEffect(() => {
    fetch("/api/maps")
      .then((r) => r.json())
      .then((data: MapListItem[]) => {
        setMaps(data);
        if (data.length > 0 && !data.find((m) => m.id === selectedMap)) {
          setSelectedMap(data[0].id);
        }
      })
      .catch(console.error);
  }, []);

  // Fetch map data
  useEffect(() => {
    if (!selectedMap) return;
    setLoading(true);
    setSearchQuery(""); setSearchResults([]); setShowSearchResults(false);
    setCustomMarkers([]); setPolygonPoints([]);
    setEditMode(false); setPolygonMode(false);
    setCurrentLevel(MAP_LEVELS[selectedMap]?.[0] || "Ground");

    fetch(`/api/coordinates/${selectedMap}`)
      .then((r) => r.json())
      .then((data: MapData) => {
        setMapData(data);
        setActiveCategories(new Set(data.categories.map((c) => c.id)));
        setLoading(false);
      })
      .catch((err) => { console.error(err); setLoading(false); });
  }, [selectedMap]);

  const toggleCategory = useCallback((catId: string) => {
    setActiveCategories((prev) => {
      const next = new Set(prev);
      if (next.has(catId)) next.delete(catId); else next.add(catId);
      return next;
    });
  }, []);

  const toggleAll = useCallback((on: boolean) => {
    if (mapData) {
      setActiveCategories(on ? new Set(mapData.categories.map((c) => c.id)) : new Set());
    }
  }, [mapData]);

  // Search
  const handleSearchChange = useCallback((query: string) => {
    setSearchQuery(query);
    if (!mapData || !query.trim()) { setSearchResults([]); setShowSearchResults(false); return; }
    const q = query.toLowerCase();
    const results = allMarkers().filter((m) => {
      const title = m.popup?.title?.toLowerCase() || "";
      const desc = m.popup?.description?.toLowerCase() || "";
      return title.includes(q) || desc.includes(q);
    });
    results.sort((a, b) => {
      const aT = (a.popup?.title || "").toLowerCase();
      const bT = (b.popup?.title || "").toLowerCase();
      return (aT.startsWith(q) ? 0 : 1) - (bT.startsWith(q) ? 0 : 1) || aT.length - bT.length;
    });
    setSearchResults(results.slice(0, 50));
    setShowSearchResults(results.length > 0);
  }, [allMarkers]);

  const handleSelectSearchResult = useCallback((marker: MapMarker) => {
    setSelectedMarkerId(marker.id);
    setShowSearchResults(false);
    setSearchQuery(marker.popup?.title || "");
  }, []);

  const categoryNameMap = useCallback((catId: string): string =>
    mapData?.categories.find((c) => c.id === catId)?.name || "", [mapData]);

  // === EDITOR HANDLERS ===

  // Click on map (not marker) to add new
  const handleMapClick = useCallback((x: number, y: number) => {
    if (polygonMode) return;
    setPendingPosition([x, y]);
    setNewMarkerTitle("");
    setNewMarkerDesc("");
    setNewMarkerCategory(mapData?.categories[0]?.id || "");
    setNewMarkerLevel(currentLevel);
    setEditingMarkerId(null);
    setShowMarkerForm(true);
  }, [polygonMode, mapData, currentLevel]);

  // Click on existing marker to edit
  const handleMarkerEdit = useCallback((markerId: string) => {
    const all = allMarkers();
    const marker = all.find((m) => m.id === markerId);
    if (!marker) return;
    setPendingPosition(marker.position);
    setNewMarkerTitle(marker.popup?.title || "");
    setNewMarkerDesc(marker.popup?.description || "");
    setNewMarkerCategory(marker.categoryId);
    setNewMarkerLevel(marker.level || currentLevel);
    setEditingMarkerId(markerId);
    setShowMarkerForm(true);
  }, [allMarkers, currentLevel]);

  // Move marker (drag)
  const handleMarkerMove = useCallback((markerId: string, newX: number, newY: number) => {
    setCustomMarkers((prev) =>
      prev.map((m) =>
        m.id === markerId ? { ...m, position: [newX, newY] as [number, number] } : m
      )
    );
  }, []);

  // Save marker (new or edit)
  const handleSaveMarker = useCallback(() => {
    if (!pendingPosition || !newMarkerTitle.trim()) return;

    if (editingMarkerId) {
      // Edit existing custom marker
      setCustomMarkers((prev) =>
        prev.map((m) =>
          m.id === editingMarkerId
            ? {
                ...m,
                categoryId: newMarkerCategory,
                position: pendingPosition,
                popup: { title: newMarkerTitle.trim(), description: newMarkerDesc.trim() },
                level: newMarkerLevel,
              }
            : m
        )
      );
    } else {
      // New marker
      const id = String(nextMarkerId.current++);
      setCustomMarkers((prev) => [
        ...prev,
        {
          id,
          categoryId: newMarkerCategory,
          position: pendingPosition,
          popup: { title: newMarkerTitle.trim(), description: newMarkerDesc.trim() },
          level: newMarkerLevel,
          _temp: true,
        },
      ]);
    }

    setShowMarkerForm(false);
    setPendingPosition(null);
    setEditingMarkerId(null);
    setNewMarkerTitle(""); setNewMarkerDesc("");
  }, [pendingPosition, newMarkerTitle, newMarkerDesc, newMarkerCategory, newMarkerLevel, editingMarkerId]);

  // Delete marker
  const handleDeleteMarker = useCallback(() => {
    if (!editingMarkerId) return;
    setCustomMarkers((prev) => prev.filter((m) => m.id !== editingMarkerId));
    setShowMarkerForm(false);
    setPendingPosition(null);
    setEditingMarkerId(null);
  }, [editingMarkerId]);

  // Polygon point
  const handlePolygonPoint = useCallback((x: number, y: number) => {
    setPolygonPoints((prev) => [...prev, [x, y]]);
  }, []);

  const handleCompletePolygon = useCallback(() => {
    if (polygonPoints.length < 3) return;
    setShowPolygonForm(true);
  }, [polygonPoints]);

  const handleSavePolygon = useCallback(() => {
    setSavedPolygons((prev) => [
      ...prev,
      {
        id: String(nextPolyId.current++),
        points: [...polygonPoints],
        label: newPolygonLabel.trim(),
        category: newPolygonCategory || mapData?.categories[0]?.id || "",
        level: newPolygonLevel,
      },
    ]);
    setPolygonPoints([]);
    setShowPolygonForm(false);
    setNewPolygonLabel(""); setNewPolygonCategory(""); setNewPolygonLevel(currentLevel);
  }, [polygonPoints, newPolygonLabel, newPolygonCategory, newPolygonLevel, mapData, currentLevel]);

  const handleUndoLastPoint = useCallback(() => {
    setPolygonPoints((prev) => prev.slice(0, -1));
  }, []);

  const handleCancelPolygon = useCallback(() => {
    setPolygonPoints([]);
  }, []);

  const handleDeletePolygon = useCallback((id: string) => {
    setSavedPolygons((prev) => prev.filter((p) => p.id !== id));
  }, []);

  // Export
  const handleExport = useCallback(() => {
    const exportData = {
      markers: customMarkers.map(({ _temp, ...m }) => m),
      polygons: savedPolygons,
      map: selectedMap,
      exportedAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${selectedMap}-custom-data.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [customMarkers, savedPolygons, selectedMap]);

  // Import
  const fileInputRef = useRef<HTMLInputElement>(null);
  const handleImport = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileSelected = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string);
        if (data.markers) {
          setCustomMarkers((prev) => [...prev, ...data.markers.map((m: any) => ({ ...m, _temp: true }))]);
        }
        if (data.polygons) {
          setSavedPolygons((prev) => [...prev, ...data.polygons]);
        }
      } catch (err) {
        console.error("Import failed", err);
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  }, []);

  // Visible markers for current level
  const visibleMarkers = allMarkers().filter((m) => !m.level || m.level === currentLevel);
  const visiblePolygons = savedPolygons.filter((p) => !p.level || p.level === currentLevel);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-950">
        <div className="text-gray-400 text-lg">Loading map data...</div>
      </div>
    );
  }

  if (!mapData) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-950">
        <div className="text-red-400 text-lg">
          {selectedMap === "airport" ? "Airport — add markers with the editor!" : "Failed to load map data."}
        </div>
      </div>
    );
  }

  const solidCategories = mapData.categories.filter((c) => !c.icon && c.symbol);
  const iconCategories = mapData.categories.filter((c) => c.icon);

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside className="w-72 bg-gray-900 border-r border-gray-800 flex flex-col flex-shrink-0 overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-gray-800">
          <h1 className="text-lg font-bold text-white">ABI Maps</h1>
          <p className="text-xs text-gray-500 mt-1">Arena Breakout Infinite</p>
        </div>

        {/* Map Selector */}
        <div className="p-3 border-b border-gray-800">
          <label className="text-xs text-gray-400 uppercase tracking-wider mb-2 block">Select Map</label>
          <select value={selectedMap} onChange={(e) => setSelectedMap(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500">
            {maps.map((m) => (<option key={m.id} value={m.id}>{m.mapName}</option>))}
          </select>
        </div>

        {/* Search */}
        <div className="p-3 border-b border-gray-800 relative">
          <label className="text-xs text-gray-400 uppercase tracking-wider mb-2 block">Search Markers</label>
          <div className="relative">
            <svg className="absolute left-2.5 top-2.5 w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input type="text" value={searchQuery} onChange={(e) => handleSearchChange(e.target.value)}
              onFocus={() => { if (searchResults.length > 0) setShowSearchResults(true); }}
              onBlur={() => setTimeout(() => setShowSearchResults(false), 200)}
              placeholder="Search markers..."
              className="w-full bg-gray-800 border border-gray-700 rounded-lg pl-8 pr-3 py-2 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          {showSearchResults && searchResults.length > 0 && (
            <div className="absolute left-3 right-3 top-full mt-1 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-50 max-h-60 overflow-y-auto">
              {searchResults.map((marker) => (
                <button key={marker.id} onMouseDown={(e) => { e.preventDefault(); handleSelectSearchResult(marker); }}
                  className="w-full text-left px-3 py-2 hover:bg-gray-700 text-sm flex items-center gap-2 border-b border-gray-700 last:border-0">
                  <span className="w-2 h-2 rounded-full flex-shrink-0 bg-blue-500" />
                  <span className="text-gray-200 truncate flex-1">{marker.popup?.title || "Unknown"}</span>
                  <span className="text-xs text-gray-500 flex-shrink-0">{categoryNameMap(marker.categoryId)}</span>
                </button>
              ))}
              <div className="px-3 py-1.5 text-xs text-gray-500 border-t border-gray-700 text-center">
                {searchResults.length} result{searchResults.length !== 1 ? "s" : ""}
              </div>
            </div>
          )}
        </div>

        {/* Editor Tools */}
        <div className="p-3 border-b border-gray-800">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-gray-400 uppercase tracking-wider">Editor</span>
            {editMode && <span className="text-xs px-1.5 py-0.5 rounded bg-green-700 text-green-200">ACTIVE</span>}
          </div>
          <div className="flex gap-1">
            <button onClick={() => { setEditMode(!editMode); if (!editMode) { setPolygonMode(false); } }}
              className={`flex-1 text-xs px-2 py-1.5 rounded ${editMode ? "bg-green-600 text-white" : "bg-gray-800 text-gray-300 hover:bg-gray-700"}`}>
              {editMode ? "Exit Edit" : "Edit Mode"}
            </button>
          </div>
          {editMode && (
            <div className="mt-2 space-y-1">
              <button onClick={() => { setPolygonMode(!polygonMode); if (!polygonMode) setShowMarkerForm(false); }}
                className={`w-full text-xs px-2 py-1.5 rounded ${polygonMode ? "bg-yellow-600 text-white" : "bg-gray-800 text-gray-300 hover:bg-gray-700"}`}>
                {polygonMode ? "Draw Polygon (ON)" : "Draw Polygon"}
              </button>
              {polygonMode && (
                <div className="flex gap-1 mt-1">
                  <button onClick={handleCompletePolygon} disabled={polygonPoints.length < 3}
                    className="flex-1 text-xs px-2 py-1 rounded bg-blue-600 text-white disabled:opacity-30">Finish ({polygonPoints.length}pts)</button>
                  <button onClick={handleUndoLastPoint} disabled={polygonPoints.length === 0}
                    className="text-xs px-2 py-1 rounded bg-gray-700 text-gray-300 disabled:opacity-30">Undo</button>
                  <button onClick={handleCancelPolygon} className="text-xs px-2 py-1 rounded bg-red-800 text-red-200">Cancel</button>
                </div>
              )}
              <div className="mt-2 text-xs text-gray-500 space-y-0.5">
                <p>Custom markers: {customMarkers.length}</p>
                <p>Polygons: {savedPolygons.length}</p>
              </div>
              <div className="flex gap-1 mt-1">
                <button onClick={handleExport}
                  className="flex-1 text-xs px-2 py-1 rounded bg-blue-700 text-blue-200 hover:bg-blue-600">Export</button>
                <button onClick={handleImport}
                  className="flex-1 text-xs px-2 py-1 rounded bg-gray-700 text-gray-300 hover:bg-gray-600">Import</button>
              </div>
              <input ref={fileInputRef} type="file" accept=".json" onChange={handleFileSelected} className="hidden" />
            </div>
          )}
        </div>

        {/* Category Filters */}
        <div className="flex-1 overflow-y-auto p-3">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-gray-400 uppercase tracking-wider">
              Categories ({activeCategories.size}/{mapData.categories.length})
            </span>
            <div className="flex gap-1">
              <button onClick={() => toggleAll(true)} className="text-xs px-2 py-0.5 rounded bg-gray-800 text-gray-300 hover:bg-gray-700">All</button>
              <button onClick={() => toggleAll(false)} className="text-xs px-2 py-0.5 rounded bg-gray-800 text-gray-300 hover:bg-gray-700">None</button>
            </div>
          </div>
          <div className="space-y-0.5">
            {iconCategories.map((cat) => {
              const iconFile = cat.icon.replace("File:", "");
              return (
                <label key={cat.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-800 cursor-pointer text-sm">
                  <input type="checkbox" checked={activeCategories.has(cat.id)} onChange={() => toggleCategory(cat.id)} className="rounded bg-gray-700 border-gray-600" />
                  <img src={`/icons/${iconFile}`} alt={cat.name} className="w-5 h-5 object-contain" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                  <span className="text-gray-300 text-xs truncate flex-1">{cat.name}</span>
                  <span className="text-xs text-gray-600">{visibleMarkers.filter((m) => m.categoryId === cat.id).length}</span>
                </label>
              );
            })}
            {solidCategories.length > 0 && (
              <><div className="border-t border-gray-800 my-2" />{solidCategories.map((cat) => (
                <label key={cat.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-800 cursor-pointer text-sm">
                  <input type="checkbox" checked={activeCategories.has(cat.id)} onChange={() => toggleCategory(cat.id)} className="rounded bg-gray-700 border-gray-600" />
                  <span className="w-4 h-4 rounded-full flex-shrink-0" style={{ backgroundColor: cat.color }} />
                  <span className="text-gray-300 text-xs truncate flex-1">{cat.name}</span>
                </label>
              ))}</>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-gray-800 text-xs text-gray-600">
          <p>Markers: {visibleMarkers.length} on {currentLevel}</p>
          <p>Polygons: {visiblePolygons.length}</p>
        </div>
      </aside>

      {/* Map Area */}
      <main className="flex-1 relative">
        {/* Level Selector — top-left corner */}
        <div className="absolute top-3 left-3 z-[1000] flex items-center gap-1.5">
          <div className="bg-gray-900/90 backdrop-blur rounded-lg border border-gray-700 p-1 flex gap-1">
            {levels.map((level) => (
              <button
                key={level}
                onClick={() => setCurrentLevel(level)}
                className={`text-xs px-2.5 py-1 rounded-md font-medium transition-colors ${
                  currentLevel === level
                    ? "bg-blue-600 text-white"
                    : "text-gray-400 hover:text-gray-200 hover:bg-gray-800"
                }`}
              >
                {level}
              </button>
            ))}
          </div>
        </div>

        {/* Edit mode badge */}
        {editMode && (
          <div className="absolute top-3 right-3 z-[1000] bg-green-900/90 backdrop-blur px-3 py-1.5 rounded-lg border border-green-700">
            <span className="text-xs text-green-300 font-medium">
              {polygonMode
                ? `Drawing polygon (${polygonPoints.length} pts)`
                : "Click map to add · Drag markers to move"}
            </span>
          </div>
        )}

        {/* Marker form (new/edit) */}
        {showMarkerForm && pendingPosition && (
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-[1000] bg-gray-900 border border-gray-700 rounded-xl shadow-2xl p-4 w-80">
            <h3 className="text-sm font-medium text-white mb-3">
              {editingMarkerId ? "Edit Marker" : "Add Marker"}
            </h3>
            <div className="space-y-2">
              <div>
                <label className="text-xs text-gray-400 block mb-0.5">Position</label>
                <input type="text" readOnly value={`${pendingPosition[0].toFixed(0)}, ${pendingPosition[1].toFixed(0)}`}
                  className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-xs text-gray-400" />
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="text-xs text-gray-400 block mb-0.5">Category</label>
                  <select value={newMarkerCategory} onChange={(e) => setNewMarkerCategory(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-xs text-gray-200">
                    {mapData.categories.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-400 block mb-0.5">Level</label>
                  <select value={newMarkerLevel} onChange={(e) => setNewMarkerLevel(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-xs text-gray-200">
                    {levels.map((l) => (<option key={l} value={l}>{l}</option>))}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-0.5">Title</label>
                <input type="text" value={newMarkerTitle} onChange={(e) => setNewMarkerTitle(e.target.value)} placeholder="Marker name"
                  className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-xs text-gray-200 placeholder-gray-500" />
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-0.5">Description (optional)</label>
                <textarea value={newMarkerDesc} onChange={(e) => setNewMarkerDesc(e.target.value)} placeholder="Details..."
                  className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-xs text-gray-200 placeholder-gray-500 resize-none" rows={2} />
              </div>
              <div className="flex gap-2 pt-1">
                <button onClick={handleSaveMarker} disabled={!newMarkerTitle.trim()}
                  className="flex-1 text-xs px-3 py-1.5 rounded bg-blue-600 text-white disabled:opacity-30">
                  {editingMarkerId ? "Update" : "Save"}
                </button>
                {editingMarkerId && (
                  <button onClick={handleDeleteMarker}
                    className="text-xs px-3 py-1.5 rounded bg-red-700 text-red-200">Delete</button>
                )}
                <button onClick={() => { setShowMarkerForm(false); setPendingPosition(null); setEditingMarkerId(null); }}
                  className="text-xs px-3 py-1.5 rounded bg-gray-700 text-gray-300">Cancel</button>
              </div>
            </div>
          </div>
        )}

        {/* Polygon form */}
        {showPolygonForm && (
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-[1000] bg-gray-900 border border-gray-700 rounded-xl shadow-2xl p-4 w-80">
            <h3 className="text-sm font-medium text-white mb-3">Save Polygon</h3>
            <div className="space-y-2">
              <div>
                <label className="text-xs text-gray-400 block mb-0.5">Label</label>
                <input type="text" value={newPolygonLabel} onChange={(e) => setNewPolygonLabel(e.target.value)} placeholder="Zone/Room name"
                  className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-xs text-gray-200 placeholder-gray-500" />
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="text-xs text-gray-400 block mb-0.5">Category</label>
                  <select value={newPolygonCategory} onChange={(e) => setNewPolygonCategory(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-xs text-gray-200">
                    {mapData.categories.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-400 block mb-0.5">Level</label>
                  <select value={newPolygonLevel} onChange={(e) => setNewPolygonLevel(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-xs text-gray-200">
                    {levels.map((l) => (<option key={l} value={l}>{l}</option>))}
                  </select>
                </div>
              </div>
              <p className="text-xs text-gray-500">{polygonPoints.length} vertices</p>
              <div className="flex gap-2 pt-1">
                <button onClick={handleSavePolygon} className="flex-1 text-xs px-3 py-1.5 rounded bg-blue-600 text-white">Save</button>
                <button onClick={() => setShowPolygonForm(false)} className="text-xs px-3 py-1.5 rounded bg-gray-700 text-gray-300">Cancel</button>
              </div>
            </div>
          </div>
        )}

        {/* Saved polygons display */}
        {visiblePolygons.length > 0 && (() => {
          const b = mapData.mapBounds;
          const w = b[1][0];
          const h = b[1][1];
          return (
            <svg className="absolute inset-0 z-[500] pointer-events-none" width="100%" height="100%" style={{ clipPath: "inset(0)" }}>
              {visiblePolygons.map((poly) => {
                const pts = poly.points.map(([x, y]) => `${(x / w) * 100}% ${(y / h) * 100}%`).join(", ");
                return (
                  <polygon key={poly.id} points={pts}
                    fill="rgba(59, 130, 246, 0.15)" stroke="#3b82f6" strokeWidth="2" strokeDasharray="4,3"
                    className="pointer-events-auto">
                    <title>{poly.label || poly.id}</title>
                  </polygon>
                );
              })}
            </svg>
          );
        })()}

        {/* Polygon delete buttons */}
        {editMode && visiblePolygons.length > 0 && (
          <div className="absolute bottom-3 right-3 z-[1000] space-y-1">
            {visiblePolygons.map((poly) => (
              <button key={poly.id} onClick={() => handleDeletePolygon(poly.id)}
                className="block text-xs px-2 py-1 rounded bg-red-800/80 text-red-200 hover:bg-red-700 border border-red-700">
                Delete: {poly.label || `Polygon ${poly.id}`}
              </button>
            ))}
          </div>
        )}

        <MapView
          mapData={{ ...mapData, markers: allMarkers() }}
          activeCategories={activeCategories}
          focusMarkerId={selectedMarkerId}
          onFocusDone={() => setSelectedMarkerId(null)}
          editMode={editMode}
          polygonMode={polygonMode}
          onMapClick={handleMapClick}
          onPolygonPoint={handlePolygonPoint}
          onMarkerEdit={handleMarkerEdit}
          onMarkerMove={handleMarkerMove}
          polygonPoints={polygonPoints}
          currentLevel={currentLevel}
        />
      </main>
    </div>
  );
}
