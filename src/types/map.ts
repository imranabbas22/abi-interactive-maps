export interface MapCategory {
  id: string;
  listId: number;
  name: string;
  color: string;
  symbol: string;
  symbolColor: string;
  icon: string;
}

export interface MapMarker {
  categoryId: string;
  position: [number, number];
  popup: {
    title: string;
    description: string;
    link?: {
      url: string;
      label: string;
    };
  };
  id: string;
  level?: string; // floor/level this marker belongs to
}

export interface MapData {
  mapImage: string;
  mapName: string;
  mapBounds: number[][];
  coordinateOrder?: string;
  origin?: string;
  categories: MapCategory[];
  markers: MapMarker[];
  levels?: string[]; // available floors/levels for this map
}

export interface MapListItem {
  id: string;
  mapName: string;
}
