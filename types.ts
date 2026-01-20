export interface RGB {
  r: number;
  g: number;
  b: number;
}

export interface BookmarkSettings {
  baseHeight: number; // mm, e.g., 0.6
  layerHeights: [number, number, number, number]; // mm, e.g., [0.6, 0.8, 1.0, 1.2]
  isTactile: boolean;
  widthMm: number;
  heightMm: number;
}

export interface ProcessingState {
  status: 'idle' | 'processing' | 'generating_stl' | 'zipping' | 'done' | 'error';
  message?: string;
}

// Declaration for the global JSZip library loaded via CDN
declare global {
  interface Window {
    JSZip: any;
  }
}
