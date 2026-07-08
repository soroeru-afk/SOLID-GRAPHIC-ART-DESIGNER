import React, { useEffect, useState, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import ImageTracer from 'imagetracerjs';
import { 
  FolderOpen, 
  LayoutGrid, 
  List, 
  ScatterChart, 
  Trash2, 
  Maximize2, 
  Maximize,
  Minimize,
  X, 
  Image as ImageIcon, 
  ArrowUp, 
  ArrowDown, 
  ChevronDown, 
  ChevronLeft,
  ChevronRight,
  Circle, 
  Square, 
  Diamond, 
  RefreshCw,
  Download,
  Upload,
  History,
  Sparkles,
  Dices,
  RotateCcw,
  RefreshCw,
  Zap
} from 'lucide-react';
import { ImageRecord, DatasetRecord, getAllDatasets, createDataset, deleteDataset, getImagesByDataset, storeImages, clearAll, deleteImage, renameDataset, getTotalImageCount, getImageCountByDataset, updateDatasetDate } from './lib/db';
import { Panel, SolidButton } from './components/ui';
import { cn } from './lib/utils';

type TileShape = 'SQUARE' | 'CIRCLE' | 'DIAMOND';
type FormationMode = 'GRID' | 'CONCENTRIC' | 'SPIRAL' | 'MASONRY' | 'CROSS';

interface LoadedImage extends ImageRecord {
  url: string;
}

interface ParamSet {
  tileSize: number;
  gridGap: number;
  flowDirection: number;
  waveFrequency: number;
  depthEffect: number;
  roughness: number;
  colorSimplify: number;
  edgeStrength: number;
  averageColor: boolean;
  contrast: number;
  saturation: number;
}

type ShapeConfigurations = Record<TileShape, {
    activeFormation: FormationMode;
    formations: Record<FormationMode, ParamSet>
}>;

const generateDefaultParamSet = (shape: TileShape, mode: FormationMode): ParamSet => {
    let tileSize = 20;
    let depthEffect = 0.35;
    let roughness = 0;
    
    if (mode === 'CROSS') {
        tileSize = 24; 
        depthEffect = 0.35;
        roughness = 0.1;
    }
    
    return {
        tileSize,
        gridGap: 2,
        flowDirection: 0,
        waveFrequency: 0.2,
        depthEffect,
        roughness,
        colorSimplify: 6,
        edgeStrength: 0.5,
        averageColor: false,
        contrast: 0,
        saturation: 0
    };
};

const buildDefaultFormations = (shape: TileShape) => ({
    GRID: generateDefaultParamSet(shape, 'GRID'),
    CONCENTRIC: generateDefaultParamSet(shape, 'CONCENTRIC'),
    SPIRAL: generateDefaultParamSet(shape, 'SPIRAL'),
    MASONRY: generateDefaultParamSet(shape, 'MASONRY'),
    CROSS: generateDefaultParamSet(shape, 'CROSS'),
});

const DEFAULT_CONFIGS: ShapeConfigurations = {
    SQUARE: { activeFormation: 'GRID', formations: buildDefaultFormations('SQUARE') },
    CIRCLE: { activeFormation: 'GRID', formations: buildDefaultFormations('CIRCLE') },
    DIAMOND: { activeFormation: 'GRID', formations: buildDefaultFormations('DIAMOND') }
};

const PRESETS_KEY = 'solid-tile-vector-presets';

export default function App() {
  const [datasets, setDatasets] = useState<DatasetRecord[]>([]);
  const [datasetCounts, setDatasetCounts] = useState<Record<string, number>>({});
  const [activeDatasetId, setActiveDatasetId] = useState<string | null>(null);
  const [images, setImages] = useState<LoadedImage[]>([]);
  
  // New Design Parameters scoped by TileShape AND FormationMode
  const [activeShape, setActiveShape] = useState<TileShape>('SQUARE');
  const [shapeConfigs, setShapeConfigs] = useState<ShapeConfigurations>(DEFAULT_CONFIGS);

  const currentShapeConfig = shapeConfigs[activeShape];
  const formationMode = currentShapeConfig.activeFormation;
  const currentParams = currentShapeConfig.formations[formationMode];

  const tileSize = currentParams.tileSize;
  const gridGap = currentParams.gridGap;
  const flowDirection = currentParams.flowDirection;
  const waveFrequency = currentParams.waveFrequency;
  const depthEffect = currentParams.depthEffect;
  const roughness = currentParams.roughness;
  const colorSimplify = currentParams.colorSimplify;
  const edgeStrength = currentParams.edgeStrength;
  const averageColor = currentParams.averageColor;
  const contrast = currentParams.contrast;
  const saturation = currentParams.saturation;

  const tileShape = activeShape;

  const updateParam = <K extends keyof ParamSet>(key: K, value: ParamSet[K]) => {
    setShapeConfigs(prev => ({
      ...prev,
      [activeShape]: {
        ...prev[activeShape],
        formations: {
            ...prev[activeShape].formations,
            [formationMode]: {
                ...prev[activeShape].formations[formationMode],
                [key]: value
            }
        }
      }
    }));
  };

  const setFormationMode = (v: FormationMode) => {
      setShapeConfigs(prev => ({
          ...prev,
          [activeShape]: {
              ...prev[activeShape],
              activeFormation: v
          }
      }));
  };
  const setTileSize = (v: number) => updateParam('tileSize', v);
  const setGridGap = (v: number) => updateParam('gridGap', v);
  const setTileShape = (v: TileShape) => setActiveShape(v);
  const setFlowDirection = (v: number) => updateParam('flowDirection', v);
  const setWaveFrequency = (v: number) => updateParam('waveFrequency', v);
  const setDepthEffect = (v: number) => updateParam('depthEffect', v);
  const setContrast = (v: number) => updateParam('contrast', v);
  const setSaturation = (v: number) => updateParam('saturation', v);
  const setRoughness = (v: number) => updateParam('roughness', v);
  const setColorSimplify = (v: number) => updateParam('colorSimplify', v);
  const setEdgeStrength = (v: number) => updateParam('edgeStrength', v);
  const setAverageColor = (v: boolean) => updateParam('averageColor', v);

  const [mortarBrightness, setMortarBrightness] = useState<number>(10); // 0-100 grayscale
  const [isMosaicEnabled, setIsMosaicEnabled] = useState<boolean>(true);
  const [isVectorEnabled, setIsVectorEnabled] = useState<boolean>(false);
  const [viewerBg, setViewerBg] = useState<'black' | 'white-shadow' | 'white-flat'>('white-shadow');

  // Vector Styler Parameters
  const [vectorSteps, setVectorSteps] = useState<number>(7);
  const [vectorSmoothing, setVectorSmoothing] = useState<number>(50);
  const [vectorColorPrecision, setVectorColorPrecision] = useState<number>(3); // 1-10 (quantcycles)
  const [vectorSaturation, setVectorSaturation] = useState<number>(100); // 0-200%
  const [vectorContrast, setVectorContrast] = useState<number>(100); // 0-200%
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [vectorPresets, setVectorPresets] = useState<VectorPreset[]>([]);
  const [newPresetName, setNewPresetName] = useState<string>('');
  const vectorDebounceRef = useRef<NodeJS.Timeout | null>(null);

  // App State
  const [selectedImage, setSelectedImage] = useState<LoadedImage | null>(null);
  const [vectorizedImage, setVectorizedImage] = useState<string | null>(null);
  const [stockedImages, setStockedImages] = useState<LoadedImage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isReadingDirectory, setIsReadingDirectory] = useState(false);
  const [theme, setTheme] = useState<'NAVY' | 'BLACK' | 'LIGHT' | 'PAPER' | 'RED'>('BLACK');
  const [language, setLanguage] = useState<'EN' | 'JP'>('EN');
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      } else {
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        }
      }
    } catch (err) {
      console.error('Error toggling fullscreen:', err);
    }
  };

  const [sidebarTab, setSidebarTab] = useState<'ENGINE' | 'ASSETS'>('ENGINE');
  const [isLeftSidebarOpen, setIsLeftSidebarOpen] = useState(true);
  const [isRightSidebarOpen, setIsRightSidebarOpen] = useState(true);

  // Persistence Key
  const SETTINGS_KEY = 'SOLID_TILE_ART_SETTINGS_V2';

  const [isSettingsLoaded, setIsSettingsLoaded] = useState(false);

  // Load settings from localStorage
  useEffect(() => {
    const saved = localStorage.getItem(SETTINGS_KEY);
    if (saved) {
      applySettings(saved);
    }
    setIsSettingsLoaded(true);
  }, []);

  // Save settings to localStorage
  useEffect(() => {
    if (!isSettingsLoaded) return;
    const settings = {
      shapeConfigs, activeShape,
      theme, mortarBrightness,
      vectorSteps, vectorSmoothing, vectorColorPrecision, vectorSaturation, vectorContrast,
      language
    };
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }, [shapeConfigs, activeShape, theme, mortarBrightness, vectorSteps, vectorSmoothing, vectorColorPrecision, vectorSaturation, vectorContrast, language, isSettingsLoaded]);

  const applySettings = (jsonString: string) => {
    try {
      const s = JSON.parse(jsonString);
      if (s.shapeConfigs) {
        setShapeConfigs(s.shapeConfigs);
        if (s.activeShape) setActiveShape(s.activeShape);
      } else {
        // Migration from previous beta versions. Just load clean defaults.
        setShapeConfigs(DEFAULT_CONFIGS);
        setActiveShape('SQUARE');
      }
      
      if (s.theme) setTheme(s.theme);
      if (s.mortarBrightness !== undefined) setMortarBrightness(s.mortarBrightness);
      if (s.vectorSteps !== undefined) setVectorSteps(s.vectorSteps);
      if (s.vectorSmoothing !== undefined) setVectorSmoothing(s.vectorSmoothing);
      if (s.vectorColorPrecision !== undefined) setVectorColorPrecision(s.vectorColorPrecision);
      if (s.vectorSaturation !== undefined) setVectorSaturation(s.vectorSaturation);
      if (s.vectorContrast !== undefined) setVectorContrast(s.vectorContrast);
      if (s.vectorPresets) setVectorPresets(s.vectorPresets);
      if (s.language) setLanguage(s.language);
    } catch (e) {
      console.error("Failed to parse settings:", e);
    }
  };

  const exportSettings = () => {
    const settings = {
        shapeConfigs, activeShape,
        theme, mortarBrightness,
        vectorSteps, vectorSmoothing, vectorColorPrecision, vectorSaturation, vectorContrast,
        vectorPresets, language
    };
    const blob = new Blob([JSON.stringify(settings, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tile-art-config-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importSettings = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      if (event.target?.result) {
        applySettings(event.target.result as string);
      }
    };
    reader.readAsText(file);
  };
  
  // Refs
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Modals
  const [showClearAllModal, setShowClearAllModal] = useState(false);

  // Apply Theme
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // Load from DB on mount
  useEffect(() => {
    loadDatasets();
  }, []);

  useEffect(() => {
    if (activeDatasetId) {
      loadImagesFromDataset(activeDatasetId);
    } else {
      setImages([]);
      if (!selectedImage && !isLoading) {
        fetchRandomImage();
      }
    }
  }, [activeDatasetId]);

  const loadDatasets = async () => {
    setIsLoading(true);
    try {
      let dsList = await getAllDatasets();
      if (dsList.length === 0) {
        const ds = await createDataset('DEFAULT UNIT');
        dsList = [ds];
      }
      setDatasets(dsList);
      
      const counts: Record<string, number> = {};
      for (const ds of dsList) {
        try {
          counts[ds.id] = await getImageCountByDataset(ds.id);
        } catch (err) {
          counts[ds.id] = 0;
        }
      }
      setDatasetCounts(counts);
      
      if (dsList.length > 0 && !activeDatasetId) {
        setActiveDatasetId(dsList[0].id);
      }
    } catch (e) {
      console.error("Failed to load datasets:", e);
    } finally {
      setIsLoading(false);
    }
  };

  const loadImagesFromDataset = async (datasetId: string) => {
    setIsLoading(true);
    try {
      const dbImages = await getImagesByDataset(datasetId);
      images.forEach(img => URL.revokeObjectURL(img.url));
      
      const loaded = dbImages.map(img => ({
        ...img,
        url: URL.createObjectURL(img.data),
      }));
      setImages(loaded);
      
      if (loaded.length > 0 && !selectedImage) {
        setSelectedImage(loaded[0]);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteImage = async (e: React.MouseEvent, imgId: string) => {
    e.stopPropagation();
    await deleteImage(imgId);
    if (!activeDatasetId) return;
    await loadImagesFromDataset(activeDatasetId);
    await loadDatasets(); // Update counts
    
    setImages(prev => {
      if (selectedImage?.id === imgId) {
        const remaining = prev.filter(img => img.id !== imgId);
        setSelectedImage(remaining.length > 0 ? remaining[0] : null);
      }
      return prev;
    });
  };

  const handleDeleteAllImages = async () => {
    if (!activeDatasetId) return;
    setIsLoading(true);
    for (const img of images) {
      await deleteImage(img.id);
    }
    await loadImagesFromDataset(activeDatasetId);
    await loadDatasets();
    setSelectedImage(null);
    setIsLoading(false);
  };

  const [isFetchingRemote, setIsFetchingRemote] = useState(false);

  const fetchRandomImage = async () => {
    setIsFetchingRemote(true);
    try {
      // Fetch the random image URL and follow redirect to get a STABLE unique URL
      const response = await fetch(`https://picsum.photos/1200/800?t=${Date.now()}`);
      if (!response.ok) throw new Error("Fetch failed");
      
      // response.url is the final destination after redirects (e.g. https://fastly.picsum.photos/id/123/...)
      const stableUrl = response.url;

      const mockImage: LoadedImage = {
        id: `random-${Date.now()}`,
        datasetId: 'random',
        name: `REMOTE_SOURCE_${Math.floor(Math.random() * 1000)}.JPG`,
        type: 'image/jpeg',
        size: 0,
        lastModified: Date.now(),
        data: new Blob(),
        url: stableUrl
      };
      setVectorizedImage(null);
      setSelectedImage(mockImage);
    } catch (err) {
      console.error("Remote fetch failed:", err);
    } finally {
      setIsFetchingRemote(false);
    }
  };

  const handleImageSelect = (img: LoadedImage) => {
    setVectorizedImage(null);
    setSelectedImage(img);
  };

  const handleLocalVectorize = async (overrideImg?: LoadedImage) => {
    const targetImg = overrideImg || selectedImage;
    if (!targetImg) return;
    setIsProcessing(true);

    try {
      const sourceImg = new Image();
      sourceImg.crossOrigin = "anonymous";
      sourceImg.src = targetImg.url;
      await new Promise((resolve, reject) => {
        sourceImg.onload = resolve;
        sourceImg.onerror = reject;
      });

      let width = sourceImg.naturalWidth;
      let height = sourceImg.naturalHeight;

      // REMOVED scaling to fix the user's issue with images being shrunk or cut off
      const procCanvas = document.createElement('canvas');
      procCanvas.width = width;
      procCanvas.height = height;
      const procCtx = procCanvas.getContext('2d');
      if (!procCtx) return;

      // APPLY COLOR ENHANCEMENTS BEFORE TRACING
      procCtx.filter = `saturate(${vectorSaturation}%) contrast(${vectorContrast}%) brightness(105%)`;
      procCtx.drawImage(sourceImg, 0, 0, width, height);

      const smoothingVal = vectorSmoothing / 100;
      const ltresValue = 0.01 + (smoothingVal * 20.0);
      const qtresValue = 0.01 + (smoothingVal * 20.0);

      const options = {
        numberofcolors: vectorSteps,
        ltres: ltresValue,
        qtres: qtresValue,
        pathomit: 16 + (smoothingVal * 64),
        colorsampling: 2,
        colorquantcycles: vectorColorPrecision,
        blurradius: 1 + (smoothingVal * 10),
        viewbox: true
      };

      const imageData = procCtx.getImageData(0, 0, width, height);
      const svgString = ImageTracer.imagedataToSVG(imageData, options);
      
      const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(svgBlob);
      const img = new Image();
      
      img.onload = () => {
        const mainCanvas = document.createElement('canvas');
        mainCanvas.width = width;
        mainCanvas.height = height;
        const mainCtx = mainCanvas.getContext('2d');
        if (mainCtx) {
          mainCtx.imageSmoothingEnabled = false;
          mainCtx.drawImage(img, 0, 0, width, height);
          const vectorizedUrl = mainCanvas.toDataURL('image/png');
          setVectorizedImage(vectorizedUrl);

        }
        URL.revokeObjectURL(url);
        setIsProcessing(false);
      };
      img.src = url;

    } catch (err) {
      console.error("Vectorization failed:", err);
      setIsProcessing(false);
    }
  };

  // Auto-update effect for Vector Styler
  useEffect(() => {
    if (!selectedImage || !isVectorEnabled) return;
    
    if (vectorDebounceRef.current) clearTimeout(vectorDebounceRef.current);
    
    vectorDebounceRef.current = setTimeout(() => {
      handleLocalVectorize();
    }, 500); // Faster responsive feel

    return () => {
      if (vectorDebounceRef.current) clearTimeout(vectorDebounceRef.current);
    };
  }, [vectorSteps, vectorSmoothing, vectorColorPrecision, vectorSaturation, vectorContrast, isVectorEnabled, selectedImage]);

  // Use Vector Types
  interface VectorPreset {
    id: string;
    name: string;
    steps: number;
    precision: number;
    saturation: number;
    contrast: number;
    smoothing: number;
  }

  // Load presets from localStorage
  useEffect(() => {
    const saved = localStorage.getItem(PRESETS_KEY);
    if (saved) {
      try {
        setVectorPresets(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to load presets", e);
      }
    }
  }, []);

  // Save presets to localStorage
  useEffect(() => {
    if (vectorPresets.length > 0) {
      localStorage.setItem(PRESETS_KEY, JSON.stringify(vectorPresets));
    }
  }, [vectorPresets]);

  const saveVectorPreset = () => {
    if (!newPresetName.trim()) return;
    const preset: VectorPreset = {
      id: Date.now().toString(),
      name: newPresetName.trim(),
      steps: vectorSteps,
      precision: vectorColorPrecision,
      saturation: vectorSaturation,
      contrast: vectorContrast,
      smoothing: vectorSmoothing
    };
    setVectorPresets(prev => [...prev, preset]);
    setNewPresetName('');
  };

  const applyVectorPreset = (p: VectorPreset) => {
    setVectorSteps(p.steps);
    setVectorColorPrecision(p.precision);
    setVectorSaturation(p.saturation);
    setVectorContrast(p.contrast);
    setVectorSmoothing(p.smoothing);
  };

  const deleteVectorPreset = (id: string) => {
    setVectorPresets(prev => prev.filter(p => p.id !== id));
  };

  const saveVectorizedAsAsset = async () => {
    if (!vectorizedImage || !activeDatasetId) return;
    
    setIsLoading(true);
    try {
      const response = await fetch(vectorizedImage);
      const blob = await response.blob();
      
      const record: ImageRecord = {
        id: `vec-${Date.now()}`,
        datasetId: activeDatasetId,
        name: `VECTORIZED_${Date.now()}.PNG`,
        type: 'image/png',
        size: blob.size,
        lastModified: Date.now(),
        data: blob
      };

      await storeImages([record]);
      await loadImagesFromDataset(activeDatasetId);
      await loadDatasets(); // Update counts
      alert("VECTORIZED IMAGE SAVED TO ASSETS!");
    } catch (err) {
      console.error("Failed to save asset:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const viewerRef = useRef<HTMLDivElement>(null);

  // --- TILE ART ENGINE ---
  
  const getPixelColor = (pixels: Uint8ClampedArray, w: number, h: number, x: number, y: number, step: number) => {
    let r, g, b, a;
    if (averageColor) {
      let totalR = 0, totalG = 0, totalB = 0, totalA = 0;
      let count = 0;
      const scanSize = Math.max(1, Math.floor(step));
      for (let cy = 0; cy < scanSize && y + cy < h; cy++) {
        for (let cx = 0; cx < scanSize && x + cx < w; cx++) {
          const idx = (Math.floor(y + cy) * w + Math.floor(x + cx)) * 4;
          totalR += pixels[idx];
          totalG += pixels[idx + 1];
          totalB += pixels[idx + 2];
          totalA += pixels[idx + 3];
          count++;
        }
      }
      r = Math.round(totalR / count);
      g = Math.round(totalG / count);
      b = Math.round(totalB / count);
      a = (totalA / count) / 255;
    } else {
      const safeX = Math.min(w - 1, Math.max(0, Math.floor(x + step / 2)));
      const safeY = Math.min(h - 1, Math.max(0, Math.floor(y + step / 2)));
      const idx = (safeY * w + safeX) * 4;
      r = pixels[idx];
      g = pixels[idx + 1];
      b = pixels[idx + 2];
      a = pixels[idx + 3] / 255;
    }
    
    // Apply contrast
    if (contrast !== 0) {
      const factor = (259 * (contrast + 255)) / (255 * (259 - contrast));
      r = Math.min(255, Math.max(0, factor * (r - 128) + 128));
      g = Math.min(255, Math.max(0, factor * (g - 128) + 128));
      b = Math.min(255, Math.max(0, factor * (b - 128) + 128));
    }
    
    // Apply saturation
    if (saturation !== 0) {
      const factor = 1 + saturation / 100;
      const gray = 0.2989 * r + 0.5870 * g + 0.1140 * b;
      r = Math.min(255, Math.max(0, gray + factor * (r - gray)));
      g = Math.min(255, Math.max(0, gray + factor * (g - gray)));
      b = Math.min(255, Math.max(0, gray + factor * (b - gray)));
    }
    
    return { r, g, b, a };
  };

  const renderTileArt = () => {
    try {
      const canvas = canvasRef.current;
      const imgSource = imageRef.current;
      if (!canvas || !imgSource || !imgSource.complete || imgSource.naturalWidth === 0) return;

      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;

      const width = imgSource.naturalWidth;
      const height = imgSource.naturalHeight;
      canvas.width = width;
      canvas.height = height;

      if (!isMosaicEnabled) {
        ctx.drawImage(imgSource, 0, 0);
        return;
      }

      const offCanvas = document.createElement('canvas');
      offCanvas.width = width;
      offCanvas.height = height;
      const offCtx = offCanvas.getContext('2d');
      if (!offCtx) return;
      offCtx.drawImage(imgSource, 0, 0);
      const imgData = offCtx.getImageData(0, 0, width, height);
      const pixels = imgData.data;

      // Fill Mortar Background
      const mb = Math.round((mortarBrightness / 100) * 255);
      ctx.fillStyle = `rgb(${mb}, ${mb}, ${mb})`;
      ctx.fillRect(0, 0, width, height);
      
      const step = Math.max(4, tileSize);
      if (step - gridGap <= 1) return;

      if (formationMode === 'GRID') {
        renderGrid(ctx, pixels, width, height, step, depthEffect, roughness);
      } else if (formationMode === 'CONCENTRIC') {
        renderConcentric(ctx, pixels, width, height, step, depthEffect, roughness);
      } else if (formationMode === 'SPIRAL') {
        renderSpiral(ctx, pixels, width, height, step, depthEffect, roughness);
      } else if (formationMode === 'MASONRY') {
        renderMasonry(ctx, pixels, width, height, step, depthEffect, roughness);
      } else if (formationMode === 'CROSS') {
        renderCross(ctx, pixels, width, height, step, depthEffect, roughness);
      }
    } catch (err) {
      console.error("Rendering failed:", err);
    }
  };

  // Deterministic random based on position
  const getJitter = (x: number, y: number, seed: number) => {
    const val = Math.sin(x * 12.9898 + y * 78.233 + seed * 43.123) * 43758.5453;
    return (val - Math.floor(val)) - 0.5;
  };

  const renderGrid = (ctx: CanvasRenderingContext2D, pixels: Uint8ClampedArray, w: number, h: number, step: number, depth: number, rough: number) => {
    const offsetX = (w % step) / 2;
    const offsetY = (h % step) / 2;

    if (tileShape === 'DIAMOND') {
      const vStep = step / 2;
      let rowIndex = 0;
      for (let y = offsetY - step; y <= h + step * 2; y += vStep) {
        const rowOffsetX = (rowIndex % 2 === 1) ? step / 2 : 0;
        for (let x = offsetX - step; x <= w + step * 2; x += step) {
          const cx = x + rowOffsetX;
          const cy = y;
          if (cx < -step || cx > w + step || cy < -step || cy > h + step) continue;

          const color = getPixelColor(pixels, w, h, cx - step/2, cy - step/2, step);
          const jitterAmount = step * 0.15 * rough;
          const jX = cx + getJitter(cx, cy, 100) * jitterAmount;
          const jY = cy + getJitter(cx, cy, 200) * jitterAmount;
          const randRot = getJitter(cx, cy, 300) * Math.PI * 0.4 * rough;
          
          drawPhysicalTile(ctx, jX, jY, step - gridGap, color, randRot, depth, rough);
        }
        rowIndex++;
      }
      return;
    }

    let rowIndex = 0;
    for (let y = offsetY - step; y <= h + step; y += step) {
      let colIndex = 0;
      for (let x = offsetX - step; x <= w + step; x += step) {
        const cx = x + step/2;
        const cy = y + step/2;
        if (cx < -step || cx > w + step || cy < -step || cy > h + step) {
          colIndex++;
          continue;
        }
        const color = getPixelColor(pixels, w, h, x, y, step);
        const jitterAmount = step * 0.15 * rough;
        const jX = cx + getJitter(cx, cy, 100) * jitterAmount;
        const jY = cy + getJitter(cx, cy, 200) * jitterAmount;
        const randRot = getJitter(cx, cy, 300) * Math.PI * 0.4 * rough;
        
        const flip = (rowIndex + colIndex) % 2 === 1;
        drawPhysicalTile(ctx, jX, jY, step - gridGap, color, randRot, depth, rough, flip);
        colIndex++;
      }
      rowIndex++;
    }
  };

  const renderConcentric = (ctx: CanvasRenderingContext2D, pixels: Uint8ClampedArray, w: number, h: number, step: number, depth: number, rough: number) => {
    const centerX = w / 2;
    const centerY = h / 2;
    const maxRadius = Math.sqrt(centerX * centerX + centerY * centerY) + step * 2;
    
    let ringIndex = 0;
    for (let radius = 0; radius < maxRadius; radius += step) {
      const circumference = 2 * Math.PI * radius;
      const tilesInRing = Math.max(1, Math.floor(circumference / step));
      for (let i = 0; i < tilesInRing; i++) {
        const angle = (i / tilesInRing) * Math.PI * 2;
        const x = centerX + Math.cos(angle) * radius;
        const y = centerY + Math.sin(angle) * radius;

        if (x < -step || x >= w + step || y < -step || y >= h + step) continue;

        const color = getPixelColor(pixels, w, h, x, y, step);
        
        const jitterAmount = step * 0.15 * rough;
        const jX = x + getJitter(x, y, 100) * jitterAmount;
        const jY = y + getJitter(x, y, 200) * jitterAmount;
        const randRot = getJitter(x, y, 300) * Math.PI * 0.4 * rough;
        
        const flip = (ringIndex + i) % 2 === 1;
        drawPhysicalTile(ctx, jX, jY, step - gridGap, color, angle + randRot, depth, rough, flip);
      }
      ringIndex++;
    }
  };

  const renderSpiral = (ctx: CanvasRenderingContext2D, pixels: Uint8ClampedArray, w: number, h: number, step: number, depth: number, rough: number) => {
    const centerX = w / 2;
    const centerY = h / 2;
    const maxRadius = Math.sqrt(centerX * centerX + centerY * centerY) * 1.5;
    
    let r = step * 0.3;
    let theta = 0;
    
    let i = 0;
    while (r < maxRadius) {
      const sizeScale = 0.3 + 2.5 * Math.pow(r / maxRadius, 1.2);
      const currentStep = step * sizeScale;
      
      const x = centerX + Math.cos(theta) * r;
      const y = centerY + Math.sin(theta) * r;
      
      if (x >= -currentStep && x <= w + currentStep && y >= -currentStep && y <= h + currentStep) {
        const color = getPixelColor(pixels, w, h, x, y, currentStep);
        const tangentAngle = theta + Math.PI / 2;
        
        const jitterAmount = currentStep * 0.15 * rough;
        const jX = x + getJitter(x, y, 100) * jitterAmount;
        const jY = y + getJitter(x, y, 200) * jitterAmount;
        const randRot = getJitter(x, y, 300) * Math.PI * 0.4 * rough;
        
        const flip = i % 2 === 1;
        drawPhysicalTile(ctx, jX, jY, currentStep - gridGap, color, tangentAngle + randRot, depth, rough, flip);
      }
      
      const dTheta = Math.min(Math.PI / 1.5, currentStep / r);
      theta += dTheta;
      
      r += (currentStep / (2 * Math.PI)) * dTheta;
      i++;
    }
  };

  const renderCross = (ctx: CanvasRenderingContext2D, pixels: Uint8ClampedArray, w: number, h: number, step: number, depth: number, rough: number) => {
    // Herringbone (Woven Cross) pattern
    const u = step;
    const gap = gridGap;

    const cx = w / 2;
    const cy = h / 2;
    
    // Max radius from center to cover corner to corner
    const maxR = Math.sqrt(w*w + h*h) / 2 + u * 4;
    const limit = Math.ceil(maxR / u) + 2;

    // 45 degrees offset so it looks like a diagonal woven pattern by default
    const angle = flowDirection * Math.PI * 2 + Math.PI / 4; 
    
    const drawHerringboneTile = (ox: number, oy: number, tw: number, th: number) => {
        // ox, oy are the centers in the unrotated grid
        const dx = ox - cx;
        const dy = oy - cy;
        const rx = dx * Math.cos(angle) - dy * Math.sin(angle) + cx;
        const ry = dx * Math.sin(angle) + dy * Math.cos(angle) + cy;

        if (rx < -tw * 2 || rx > w + tw * 2 || ry < -th * 2 || ry > h + th * 2) return;

        const color = getPixelColor(pixels, w, h, rx, ry, u);
        if (color.a < 0.1) return;
        
        const currentW = tw - gap;
        const currentH = th - gap;
        if (currentW <= 0 || currentH <= 0) return;

        // Jitter
        const jAmount = u * 0.15 * rough;
        const jX = rx + getJitter(rx, ry, 100) * jAmount;
        const jY = ry + getJitter(rx, ry, 200) * jAmount;
        const tileRot = angle + getJitter(rx, ry, 300) * Math.PI * 0.1 * rough;

        ctx.save();
        ctx.translate(jX, jY);
        ctx.rotate(tileRot);
        
        const sizeBase = Math.max(currentW, currentH);
        const wobbleIntensity = Math.min(currentW, currentH) * 0.25 * rough;
        const bezelSize = Math.max(1, Math.min(currentW, currentH) * 0.12) * depthEffect;

        // 1. External Shadow
        if (depth > 0) {
            ctx.shadowColor = 'rgba(0,0,0,0.45)';
            ctx.shadowBlur = 4 * depth;
            ctx.shadowOffsetX = 1.5 * depth;
            ctx.shadowOffsetY = 1.5 * depth;
        }

        const getPoint = (px: number, py: number, seed: number) => {
            if (rough === 0) return { x: px, y: py };
            return {
                x: px + getJitter(jX + px, jY + py, seed) * wobbleIntensity,
                y: py + getJitter(jX + px, jY + py, seed + 1) * wobbleIntensity
            };
        };

        const drawRectPath = (context: CanvasRenderingContext2D, dx: number, dy: number) => {
            const hw = Math.max(0.1, currentW / 2 - dx);
            const hh = Math.max(0.1, currentH / 2 - dy);
            context.beginPath();
            
            if (tileShape === 'CIRCLE') {
                const segments = 16;
                for (let i = 0; i < segments; i++) {
                    const ang = (i / segments) * Math.PI * 2;
                    const p = getPoint(Math.cos(ang) * hw, Math.sin(ang) * hh, i);
                    if (i === 0) context.moveTo(p.x, p.y); else context.lineTo(p.x, p.y);
                }
            } else if (tileShape === 'DIAMOND') {
                const p1 = getPoint(0, -hh, 0);
                const p2 = getPoint(hw, 0, 1);
                const p3 = getPoint(0, hh, 2);
                const p4 = getPoint(-hw, 0, 3);
                context.moveTo(p1.x, p1.y); context.lineTo(p2.x, p2.y); context.lineTo(p3.x, p3.y); context.lineTo(p4.x, p4.y);
            } else {
                const p1 = getPoint(-hw, -hh, 0); // top-left
                const p2 = getPoint(hw, -hh, 1);  // top-right
                const p3 = getPoint(hw, hh, 2);   // bot-right
                const p4 = getPoint(-hw, hh, 3);  // bot-left
                context.moveTo(p1.x, p1.y); context.lineTo(p2.x, p2.y); context.lineTo(p3.x, p3.y); context.lineTo(p4.x, p4.y);
            }
            context.closePath();
        };

        // 2. Base Fill
        drawRectPath(ctx, 0, 0);
        ctx.fillStyle = `rgb(${color.r}, ${color.g}, ${color.b})`;
        ctx.fill();

        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;

        if (depthEffect > 0) {
            // 3. Ceramic Bevel (Lighting from top-left)
            ctx.save();
            ctx.beginPath();
            drawRectPath(ctx, 0, 0);
            ctx.clip();
            
            // Highlight Edge
            ctx.strokeStyle = `rgba(255, 255, 255, ${0.8 * depthEffect})`;
            ctx.lineWidth = bezelSize * 2;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.beginPath();
            drawRectPath(ctx, bezelSize * 0.5, bezelSize * 0.5);
            ctx.stroke();

            // Inner Deepness Shadow
            ctx.strokeStyle = `rgba(0, 0, 0, ${0.7 * depthEffect})`;
            ctx.lineWidth = bezelSize;
            ctx.save();
            ctx.translate(bezelSize * 0.6, bezelSize * 0.6);
            ctx.beginPath();
            drawRectPath(ctx, bezelSize * 0.5, bezelSize * 0.5);
            ctx.stroke();
            ctx.restore();
            
            ctx.restore();

            // 4. Glaze / Gloss (Radial focus)
            const specGrad = ctx.createRadialGradient(-currentW/2, -currentH/2, 0, -currentW/2, -currentH/2, Math.min(currentW, currentH) * 1.8);
            specGrad.addColorStop(0, `rgba(255, 255, 255, ${0.6 * depthEffect})`);
            specGrad.addColorStop(0.35, `rgba(255, 255, 255, ${0.05 * depthEffect})`);
            specGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
            
            ctx.save();
            ctx.beginPath();
            drawRectPath(ctx, bezelSize, bezelSize); 
            ctx.clip();
            ctx.fillStyle = specGrad;
            ctx.fill();
            ctx.restore();

            // 5. Final Polished Rim
            ctx.strokeStyle = `rgba(255, 255, 255, ${0.4 * depthEffect})`;
            ctx.lineWidth = 0.5;
            ctx.beginPath();
            drawRectPath(ctx, 0, 0);
            ctx.stroke();
        }
        
        ctx.restore();
    };

    for (let m = -limit; m <= limit; m++) {
        for (let n = -limit; n <= limit; n++) {
            // V-tile: width 1u, height 2u
            const vx = cx + (n - 2*m + 0.5) * u;
            const vy = cy + (n + 2*m + 1.0) * u;
            drawHerringboneTile(vx, vy, u, 2*u);

            // H-tile: width 2u, height 1u
            const hx = cx + (n - 2*m + 2.0) * u;
            const hy = cy + (n + 2*m + 0.5) * u;
            drawHerringboneTile(hx, hy, 2*u, u);
        }
    }
  };

  const renderMasonry = (ctx: CanvasRenderingContext2D, pixels: Uint8ClampedArray, w: number, h: number, step: number, depth: number, rough: number) => {
    const offsetX = (w % step) / 2;
    const offsetY = (h % step) / 2;

    if (tileShape === 'DIAMOND') {
      const L = step / Math.SQRT2; 
      const maxRadius = Math.max(w, h) + step * 2;
      const bound = Math.ceil(maxRadius / L);
      
      const cx_center = w / 2;
      const cy_center = h / 2;

      for (let m = -bound; m <= bound; m++) {
        const rowOffset = (Math.abs(m) % 2 === 1) ? L / 2 : 0;
        for (let n = -bound; n <= bound; n++) {
          const unX = n * L + rowOffset;
          const unY = m * L;
          
          const rx = cx_center + (unX - unY) * Math.SQRT1_2;
          const ry = cy_center + (unX + unY) * Math.SQRT1_2;
          
          if (rx < -step || rx > w + step || ry < -step || ry > h + step) continue;

          const color = getPixelColor(pixels, w, h, rx - step/2, ry - step/2, step);
          const jAmt = step * 0.15 * rough;
          const jX = rx + getJitter(rx, ry, 100) * jAmt;
          const jY = ry + getJitter(rx, ry, 200) * jAmt;
          const randRot = getJitter(rx, ry, 300) * Math.PI * 0.4 * rough;
          
          const flip = Math.abs(m + n) % 2 === 1;
          drawPhysicalTile(ctx, jX, jY, step - gridGap, color, randRot, depth, rough, flip);
        }
      }
      return;
    }

    let rowIndex = 0;
    for (let y = offsetY - step; y <= h + step; y += step) {
      const isOddRow = rowIndex % 2 === 1;
      const rowOffsetX = isOddRow ? step / 2 : 0;
      const startX = offsetX - step - (isOddRow ? step : 0);
      
      let colIndex = 0;
      for (let x = startX; x <= w + step * 2; x += step) {
        const cx = x + step/2 + rowOffsetX;
        const cy = y + step/2;
        
        if (cx < -step || cx >= w + step || cy < -step || cy >= h + step) {
          colIndex++;
          continue;
        }

        const color = getPixelColor(pixels, w, h, x + rowOffsetX, y, step);
        const jitterAmount = step * 0.15 * rough;
        const jX = cx + getJitter(cx, cy, 100) * jitterAmount;
        const jY = cy + getJitter(cx, cy, 200) * jitterAmount;
        const randRot = getJitter(cx, cy, 300) * Math.PI * 0.4 * rough;
        
        const flip = (rowIndex + colIndex) % 2 === 1;
        drawPhysicalTile(ctx, jX, jY, step - gridGap, color, randRot, depth, rough, flip);
        colIndex++;
      }
      rowIndex++;
    }
  };

  const drawPhysicalTile = (ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: {r:number, g:number, b:number, a:number}, rotation: number, depth: number, rough: number, flipTriangle: boolean = false) => {
    const { r, g, b, a } = color;
    if (a < 0.1) return;

    ctx.save();
    let finalY = y;
    ctx.translate(x, finalY);
    
    let finalRotation = rotation;
    ctx.rotate(finalRotation);

    const half = size / 2;
    const wobbleIntensity = size * 0.25 * rough;
    const bezelSize = Math.max(1, size * 0.12) * depthEffect;
    
    // 1. External Shadow (Ambient occlusion / thickness)
    if (depth > 0) {
      ctx.shadowColor = 'rgba(0,0,0,0.45)';
      ctx.shadowBlur = 4 * depth;
      ctx.shadowOffsetX = 1.5 * depth;
      ctx.shadowOffsetY = 1.5 * depth;
    }

    // --- HANDMADE PATH GENERATION ---
    const getPoint = (px: number, py: number, seed: number) => {
      if (rough === 0) return { x: px, y: py };
      return {
        x: px + getJitter(x + px, y + py, seed) * wobbleIntensity,
        y: py + getJitter(x + px, y + py, seed + 1) * wobbleIntensity
      };
    };

    const drawWobblyPath = (context: CanvasRenderingContext2D, s: number) => {
      const h = s / 2;
      context.beginPath();
      if (tileShape === 'SQUARE') {
        const p1 = getPoint(-h, -h, 0);
        const p2 = getPoint(h, -h, 1);
        const p3 = getPoint(h, h, 2);
        const p4 = getPoint(-h, h, 3);
        context.moveTo(p1.x, p1.y);
        context.lineTo(p2.x, p2.y);
        context.lineTo(p3.x, p3.y);
        context.lineTo(p4.x, p4.y);
      } else if (tileShape === 'DIAMOND') {
        const p1 = getPoint(0, -h, 0);
        const p2 = getPoint(h, 0, 1);
        const p3 = getPoint(0, h, 2);
        const p4 = getPoint(-h, 0, 3);
        context.moveTo(p1.x, p1.y);
        context.lineTo(p2.x, p2.y);
        context.lineTo(p3.x, p3.y);
        context.lineTo(p4.x, p4.y);
      } else if (tileShape === 'CIRCLE') {
        const segments = 16;
        for (let i = 0; i < segments; i++) {
          const ang = (i / segments) * Math.PI * 2;
          const p = getPoint(Math.cos(ang) * h, Math.sin(ang) * h, i);
          if (i === 0) context.moveTo(p.x, p.y); else context.lineTo(p.x, p.y);
        }
      }
      context.closePath();
    };

    // 2. Base Ceramic Fill
    drawWobblyPath(ctx, size);
    ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
    ctx.fill();

    // Reset shadow for internal lighting
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;

    if (depthEffect > 0) {
      // 3. Ceramic Bevel (Lighting from top-left)
      ctx.save();
      ctx.beginPath();
      drawWobblyPath(ctx, size);
      ctx.clip();
      
      // Highlight Edge
      ctx.strokeStyle = `rgba(255, 255, 255, ${0.75 * depthEffect})`;
      ctx.lineWidth = bezelSize * 2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      drawWobblyPath(ctx, size - bezelSize * 0.5);
      ctx.stroke();

      // Inner Deepness Shadow
      ctx.strokeStyle = `rgba(0, 0, 0, ${0.6 * depthEffect})`;
      ctx.lineWidth = bezelSize;
      ctx.save();
      ctx.translate(bezelSize * 0.65, bezelSize * 0.65);
      ctx.beginPath();
      drawWobblyPath(ctx, size - bezelSize * 0.5);
      ctx.stroke();
      ctx.restore();
      
      ctx.restore();

      // 4. Glaze / Gloss (Radial focus)
      const specSize = size * 1.2;
      const specGrad = ctx.createRadialGradient(-half, -half, 0, -half, -half, specSize);
      specGrad.addColorStop(0, `rgba(255, 255, 255, ${0.5 * depthEffect})`);
      specGrad.addColorStop(0.4, `rgba(255, 255, 255, ${0.08 * depthEffect})`);
      specGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
      
      ctx.save();
      ctx.beginPath();
      drawWobblyPath(ctx, size - bezelSize); 
      ctx.clip();
      ctx.fillStyle = specGrad;
      ctx.fill();
      ctx.restore();

      // 5. Final Polished Rim
      ctx.strokeStyle = `rgba(255, 255, 255, ${0.3 * depthEffect})`;
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      drawWobblyPath(ctx, size);
      ctx.stroke();
    }

    ctx.restore();
  };


  useEffect(() => {
    const timer = setTimeout(() => {
      renderTileArt();
    }, 100);
    return () => clearTimeout(timer);
  }, [tileSize, gridGap, tileShape, formationMode, flowDirection, waveFrequency, depthEffect, roughness, colorSimplify, edgeStrength, averageColor, contrast, saturation, mortarBrightness, isMosaicEnabled, isVectorEnabled, selectedImage, vectorizedImage]);

  // --- VIEWER NAVIGATION ---
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = -e.deltaY;
    const scaleFactor = 1.1;
    setZoom(prev => {
      const newZoom = delta > 0 ? prev * scaleFactor : prev / scaleFactor;
      return Math.min(Math.max(0.1, newZoom), 10);
    });
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 2) { // Right click
      setIsPanning(true);
      e.preventDefault();
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isPanning) {
      setPan(prev => ({
        x: prev.x + e.movementX,
        y: prev.y + e.movementY
      }));
    }
  };

  const handleMouseUp = () => {
    setIsPanning(false);
  };

  const resetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };


  const drawHexagon = (ctx: CanvasRenderingContext2D, x: number, y: number, r: number) => {
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI / 3) * i - Math.PI / 6;
      const px = x + r * Math.cos(angle);
      const py = y + r * Math.sin(angle);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
  };

  // Dataset Actions
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const files: File[] = [];
    for (let i = 0; i < e.target.files.length; i++) {
        const file = e.target.files.item(i);
        if (file && file.type.startsWith('image/')) files.push(file);
    }
    
    if (files.length === 0) return;
    
    let targetDatasetId = activeDatasetId;
    if (!targetDatasetId) {
      try {
        const newDs = await createDataset("DEFAULT DATABANK");
        setActiveDatasetId(newDs.id);
        setDatasets(prev => [newDs, ...prev]);
        targetDatasetId = newDs.id;
      } catch (err) {
        console.error("Failed to create default dataset", err);
      }
    }

    if (!targetDatasetId) return;

    // 即座にUIへ反映するための処理
    const newLoadedImages: LoadedImage[] = [];
    const dbRecords: ImageRecord[] = [];

    for (const f of files) {
      const id = `${targetDatasetId}-${f.name}-${f.lastModified}-${f.size}`;
      const url = URL.createObjectURL(f);
      
      newLoadedImages.push({
        id,
        datasetId: targetDatasetId,
        name: f.name,
        type: f.type,
        size: f.size,
        lastModified: f.lastModified,
        data: f,
        url: url
      });

      dbRecords.push({
        id,
        datasetId: targetDatasetId,
        name: f.name,
        type: f.type,
        size: f.size,
        lastModified: f.lastModified,
        data: f
      });
    }

    // まずUI（canvasおよびサイドバー）に即時反映させる
    setSelectedImage(newLoadedImages[0]);
    setImages(prev => {
      // 既に同じIDの画像がある場合は除外して追加
      const prevFiltered = prev.filter(p => !newLoadedImages.find(n => n.id === p.id));
      return [...newLoadedImages, ...prevFiltered];
    });

    // 裏でDBに保存する
    setIsReadingDirectory(true);
    try {
      await storeImages(dbRecords);
      await loadDatasets(); // datasetCountsの更新など
      setVectorizedImage(null);
    } catch (err) {
      console.error('Error saving uploaded files to DB:', err);
    } finally {
      setIsReadingDirectory(false);
    }
    
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const confirmClearAll = async () => {
    await clearAll();
    await loadDatasets();
    setImages([]);
    setSelectedImage(null);
    setShowClearAllModal(false);
  };

  const downloadCanvas = async () => {
    // If mosaic is not enabled, we export the original image or the vectorized result
    if (!isMosaicEnabled) {
      const exportUrl = isVectorEnabled ? (vectorizedImage || selectedImage?.url) : selectedImage?.url;
      if (!exportUrl) return;

      // For remote images (like Picsum), direct link click might navigate instead of download.
      // We fetch the blob to force the browser to treat it as a download.
      if (exportUrl.startsWith('http') && !exportUrl.includes('data:')) {
        try {
          const response = await fetch(exportUrl);
          const blob = await response.blob();
          const blobUrl = URL.createObjectURL(blob);
          
          const link = document.createElement('a');
          link.href = blobUrl;
          const baseName = selectedImage?.name?.split('.')[0] || (isVectorEnabled ? 'VECTOR' : 'SOURCE');
          link.download = isVectorEnabled && vectorizedImage ? `${baseName}_VECTOR_${Date.now()}.PNG` : `${baseName}_SOURCE_${Date.now()}.PNG`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          
          // Clean up
          setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
          return;
        } catch (e) {
          console.error("Blob download failed, falling back to direct link:", e);
        }
      }

      const link = document.createElement('a');
      const baseName = selectedImage?.name?.split('.')[0] || (isVectorEnabled ? 'VECTOR' : 'SOURCE');
      link.download = isVectorEnabled && vectorizedImage ? `${baseName}_VECTOR_${Date.now()}.PNG` : `${baseName}_SOURCE_${Date.now()}.PNG`;
      link.href = exportUrl;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      return;
    }

    if (!canvasRef.current) return;
    
    // Ensure the last settings are rendered before export
    renderTileArt();

    const link = document.createElement('a');
    const baseName = selectedImage?.name?.split('.')[0] || 'TILE_ART';
    link.download = `${baseName}_CERAMIC_${Date.now()}.PNG`;
    try {
      link.href = canvasRef.current.toDataURL('image/png');
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (e) {
      console.error("Export failed. Likely CORS issues with remote images:", e);
      alert("Failed to export image. If using a remote sample, the service may be blocking direct access. Try uploading your own image.");
    }
  };

  const t = (en: string, jp: string) => language === 'JP' ? jp : en;

  return (
    <div className="h-screen w-screen flex flex-col p-4 gap-4 box-border overflow-hidden select-none bg-root-bg text-text-primary transition-colors">
      
      {/* Top Header */}
      <header className="flex justify-between items-center shrink-0 h-10 border-b border-panel-border pb-4">
        <div className="flex items-start gap-2">
          <div className="w-[34px] h-[34px] flex flex-wrap gap-[2px] p-[4px] shrink-0 opacity-90 border-2 border-text-muted/50 rounded-[1px]">
            <div className="bg-accent w-[calc(50%-1px)] h-[calc(50%-1px)]" />
            <div className="bg-accent w-[calc(50%-1px)] h-[calc(50%-1px)]" />
            <div className="bg-accent w-[calc(50%-1px)] h-[calc(50%-1px)]" />
            <div className="bg-accent w-[calc(50%-1px)] h-[calc(50%-1px)]" />
          </div>
          <div className="flex flex-col items-start gap-[5px]">
            <h1 className="font-sans font-black tracking-[0.14em] text-[18px] text-white uppercase drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)] leading-none mt-[1px]">
              SOLID GRAPHIC ART DESIGNER
            </h1>
            <span className="font-mono text-text-muted text-[10px] tracking-[0.2em] hidden sm:inline-block leading-none pl-0.5">{t('— Image to Vector & Mosaic Art Converter —', '— 画像をベクター化・モザイクアート化 —')}</span>
          </div>
        </div>
        
        <div className="flex items-center gap-8 h-full">
          <div className="flex items-center gap-3 h-full">
            <span className="text-[10px] uppercase font-mono tracking-widest text-text-muted">{t('THEME:', 'テーマ:')}</span>
            <div className="flex gap-2 h-full py-1">
              <SolidButton active={theme === 'NAVY'} onClick={() => setTheme('NAVY')} className="px-3 py-0 text-[10px]">NAVY</SolidButton>
              <SolidButton active={theme === 'BLACK'} onClick={() => setTheme('BLACK')} className="px-3 py-0 text-[10px]">BLACK</SolidButton>
              <SolidButton active={theme === 'RED'} onClick={() => setTheme('RED')} className="px-3 py-0 text-[10px]">RED</SolidButton>
              <SolidButton active={theme === 'LIGHT'} onClick={() => setTheme('LIGHT')} className="px-3 py-0 text-[10px]">LIGHT</SolidButton>
              <SolidButton active={theme === 'PAPER'} onClick={() => setTheme('PAPER')} className="px-3 py-0 text-[10px]">PAPER</SolidButton>
            </div>
            <div className="flex gap-0 ml-4 border border-panel-border h-full rounded-sm overflow-hidden">
              <button 
                 onClick={() => setLanguage('EN')} 
                 className={cn("px-3 text-[10px] uppercase font-bold font-mono transition-colors border-r border-panel-border", language === 'EN' ? "bg-accent/30 text-accent" : "bg-panel-bg text-text-muted hover:bg-panel-border")}
              >EN</button>
              <button 
                 onClick={() => setLanguage('JP')} 
                 className={cn("px-3 text-[10px] uppercase font-bold font-mono transition-colors", language === 'JP' ? "bg-[#c8cfdf] text-[#1a1b26]" : "bg-panel-bg text-text-muted hover:bg-panel-border")}
              >JP</button>
            </div>
            <button 
              onClick={toggleFullscreen}
              className="flex items-center justify-center ml-2 w-7 h-7 border border-panel-border rounded-sm bg-panel-bg text-text-muted hover:bg-panel-border hover:text-text-primary transition-colors"
            >
              {isFullscreen ? <Minimize size={13} /> : <Maximize size={13} />}
            </button>
          </div>
          <span className="text-xs font-mono text-text-muted">ENGINE v5.0.0</span>
        </div>
      </header>

      <div className="flex flex-1 gap-4 min-h-0">
        
        {/* Left Sidebar */}
        <aside className={cn("flex flex-col gap-4 shrink-0 overflow-visible relative transition-[width] duration-300 ease-in-out z-40", isLeftSidebarOpen ? "w-[300px]" : "w-0")}>
          <div className={cn("flex flex-col gap-4 w-[300px] h-full transition-opacity duration-300 overflow-hidden", isLeftSidebarOpen ? "opacity-100" : "opacity-0 pointer-events-none")}>
          {/* Sidebar Tabs - Fixed at top with toggles */}
          <div className="flex flex-col gap-2 shrink-0 pr-3">
            <div className="flex gap-1 bg-panel-bg p-1 border border-panel-border shrink-0 shadow-md">
              <div 
                onClick={() => setSidebarTab('ENGINE')}
                className={cn(
                  "flex-1 p-2 flex items-center justify-between transition-all border cursor-pointer",
                  sidebarTab === 'ENGINE' 
                    ? "bg-panel-border border-panel-border shadow-sm" 
                    : "border-transparent"
                )}
              >
                <div className="flex items-center gap-1.5">
                  <span className={cn(
                    "text-[10px] font-mono tracking-widest uppercase",
                    sidebarTab === 'ENGINE' ? "text-text-primary" : "text-text-muted"
                  )}>
                    {t('MOSAIC', 'モザイク')}
                  </span>
                </div>
                <div 
                  onClick={(e) => { e.stopPropagation(); setIsMosaicEnabled(!isMosaicEnabled); }}
                  className={cn(
                    "relative w-14 h-5 rounded-full p-1 cursor-pointer transition-colors flex items-center",
                    isMosaicEnabled ? (theme === 'BLACK' ? "bg-text-secondary" : "bg-accent") : (theme === 'LIGHT' || theme === 'PAPER' ? "bg-black/10 shadow-inner" : "bg-black/40 shadow-inner")
                  )}
                >
                  <span className={cn(
                    "absolute left-2.5 text-[9px] font-sans font-bold tracking-wider transition-opacity",
                    isMosaicEnabled ? "opacity-100" : "opacity-0",
                    theme === 'BLACK' ? "text-black" : "text-white"
                  )}>
                    ON
                  </span>
                  <span className={cn(
                    "absolute right-2 text-[9px] font-sans font-bold tracking-wider transition-opacity",
                    isMosaicEnabled ? "opacity-0" : "opacity-100",
                    theme === 'LIGHT' || theme === 'PAPER' ? "text-text-primary" : "text-text-secondary"
                  )}>
                    OFF
                  </span>
                  <div className={cn(
                    "w-3 h-3 rounded-full shadow-sm z-10 transition-transform transform",
                    isMosaicEnabled ? cn("translate-x-9", theme === 'BLACK' ? "bg-black" : "bg-white") : cn("translate-x-0", theme === 'LIGHT' || theme === 'PAPER' ? "bg-text-primary" : "bg-text-secondary")
                  )} />
                </div>
              </div>
              
              <div 
                onClick={() => setSidebarTab('ASSETS')}
                className={cn(
                  "flex-1 p-2 flex items-center justify-between transition-all border cursor-pointer",
                  sidebarTab === 'ASSETS' 
                    ? "bg-panel-border border-panel-border shadow-sm" 
                    : "border-transparent"
                )}
              >
                <div className="flex items-center gap-1.5">
                  <span className={cn(
                    "text-[10px] font-mono tracking-widest uppercase",
                    sidebarTab === 'ASSETS' ? "text-text-primary" : "text-text-muted"
                  )}>
                    {t('VECTOR', 'ベクター')}
                  </span>
                </div>
                <div 
                  onClick={(e) => { e.stopPropagation(); setIsVectorEnabled(!isVectorEnabled); }}
                  className={cn(
                    "relative w-14 h-5 rounded-full p-1 cursor-pointer transition-colors flex items-center",
                    isVectorEnabled ? (theme === 'BLACK' ? "bg-text-secondary" : "bg-accent") : (theme === 'LIGHT' || theme === 'PAPER' ? "bg-black/10 shadow-inner" : "bg-black/40 shadow-inner")
                  )}
                >
                  <span className={cn(
                    "absolute left-2.5 text-[9px] font-sans font-bold tracking-wider transition-opacity",
                    isVectorEnabled ? "opacity-100" : "opacity-0",
                    theme === 'BLACK' ? "text-black" : "text-white"
                  )}>
                    ON
                  </span>
                  <span className={cn(
                    "absolute right-2 text-[9px] font-sans font-bold tracking-wider transition-opacity",
                    isVectorEnabled ? "opacity-0" : "opacity-100",
                    theme === 'LIGHT' || theme === 'PAPER' ? "text-text-primary" : "text-text-secondary"
                  )}>
                    OFF
                  </span>
                  <div className={cn(
                    "w-3 h-3 rounded-full shadow-sm z-10 transition-transform transform",
                    isVectorEnabled ? cn("translate-x-9", theme === 'BLACK' ? "bg-black" : "bg-white") : cn("translate-x-0", theme === 'LIGHT' || theme === 'PAPER' ? "bg-text-primary" : "bg-text-secondary")
                  )} />
                </div>
              </div>
            </div>
          </div>

          <div 
            className="flex-1 flex flex-col gap-4 overflow-y-scroll overflow-x-hidden pr-1 pb-4" 
          >
            {sidebarTab === 'ENGINE' ? (
              <>

                <Panel title={t("RENDER PARAMETERS", "描画パラメータ")} className="shrink-0 h-auto">
                  <div className={cn("flex flex-col gap-6 transition-opacity duration-300", !isMosaicEnabled ? "opacity-30 pointer-events-none" : "opacity-100")}>
                    {/* Shape Selection */}
                    <div>
                      <div className="text-[10px] uppercase text-text-muted mb-3 tracking-widest font-mono">{t('TILE SHAPE', 'タイル形状')}</div>
                      <div className="grid grid-cols-3 gap-2">
                        <SolidButton 
                          active={activeShape === 'SQUARE'} 
                          onClick={() => setTileShape('SQUARE')} 
                          className="flex flex-col gap-1 h-14"
                        >
                          <Square size={14} /><span className="text-[8px]">SQUARE</span>
                        </SolidButton>

                        <SolidButton 
                          active={activeShape === 'CIRCLE'} 
                          onClick={() => setTileShape('CIRCLE')} 
                          className="flex flex-col gap-1 h-14"
                        >
                          <Circle size={14} /><span className="text-[8px]">CIRCLE</span>
                        </SolidButton>

                        <SolidButton 
                          active={activeShape === 'DIAMOND'} 
                          onClick={() => setTileShape('DIAMOND')} 
                          className="flex flex-col gap-1 h-14"
                        >
                          <Diamond size={14} /><span className="text-[8px]">DIAMOND</span>
                        </SolidButton>
                      </div>
                    </div>

                    {/* Formation Pattern */}
                    <div className="transition-opacity duration-300 opacity-100">
                      <div className="text-[10px] uppercase text-text-muted mb-3 tracking-widest font-mono">{t('FORMATION PATTERN', '配列モード')}</div>
                      <div className="grid grid-cols-5 gap-1">
                        <SolidButton active={formationMode === 'GRID'} onClick={() => setFormationMode('GRID')} className="text-[7px] h-9">GRID</SolidButton>
                        <SolidButton active={formationMode === 'CONCENTRIC'} onClick={() => setFormationMode('CONCENTRIC')} className="text-[7px] h-9">CENTER</SolidButton>
                        <SolidButton active={formationMode === 'SPIRAL'} onClick={() => setFormationMode('SPIRAL')} className="text-[7px] h-9">SPIRAL</SolidButton>
                        <SolidButton active={formationMode === 'MASONRY'} onClick={() => setFormationMode('MASONRY')} className="text-[7px] h-9">MASONRY</SolidButton>
                        <SolidButton active={formationMode === 'CROSS'} onClick={() => setFormationMode('CROSS')} className="text-[7px] h-9">CROSS</SolidButton>
                      </div>
                    </div>

                    {/* Resolution slider */}
                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-[10px] font-mono text-text-muted uppercase tracking-widest">{t('TILE SIZE', 'タイルサイズ')}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-mono text-accent w-10 text-right">{tileSize} PX</span>
                          <button onClick={() => setTileSize(formationMode === 'CROSS' ? 24 : 20)} className="text-text-muted hover:text-accent transition-colors">
                            <RotateCcw size={12} />
                          </button>
                        </div>
                      </div>
                      <input type="range" min="8" max="80" step="1" value={tileSize} onChange={e => setTileSize(Number(e.target.value))} />
                    </div>

                    {/* Grid gap slider */}
                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-[10px] font-mono text-text-muted uppercase tracking-widest">{t('JOINTS (GAP)', '目地 (ギャップ)')}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-mono text-accent w-10 text-right">{gridGap} PX</span>
                          <button onClick={() => setGridGap(2)} className="text-text-muted hover:text-accent transition-colors">
                            <RotateCcw size={12} />
                          </button>
                        </div>
                      </div>
                      <input type="range" min="0" max="12" step="0.5" value={gridGap} onChange={e => setGridGap(Number(e.target.value))} />
                    </div>

                    {/* Handmade Roughness */}
                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-[10px] font-mono text-text-muted uppercase tracking-widest">{t('HANDMADE ROUGHNESS', '手作り感 (粗さ)')}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-mono text-accent w-10 text-right">{(roughness * 100).toFixed(0)} %</span>
                          <button onClick={() => setRoughness(formationMode === 'CROSS' ? 0.1 : 0)} className="text-text-muted hover:text-accent transition-colors">
                            <RotateCcw size={12} />
                          </button>
                        </div>
                      </div>
                      <input type="range" min="0" max="1" step="0.05" value={roughness} onChange={e => setRoughness(Number(e.target.value))} />
                    </div>

                    {/* Stream Params */}
                    {formationMode === 'STREAM' && (
                      <>
                        <div>
                          <div className="flex justify-between items-center mb-1">
                            <span className="text-[10px] font-mono text-text-muted uppercase tracking-widest">FLOW DIRECTION</span>
                          </div>
                          <input type="range" min="0" max="1" step="0.01" value={flowDirection} onChange={e => setFlowDirection(Number(e.target.value))} />
                        </div>
                        <div>
                          <div className="flex justify-between items-center mb-1">
                            <span className="text-[10px] font-mono text-text-muted uppercase tracking-widest">WAVE FREQUENCY</span>
                          </div>
                          <input type="range" min="0" max="1" step="0.05" value={waveFrequency} onChange={e => setWaveFrequency(Number(e.target.value))} />
                        </div>
                      </>
                    )}

                    {/* 3D Depth */}
                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-[10px] font-mono text-text-muted uppercase tracking-widest">3D CERAMIC DEPTH</span>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-mono text-accent w-8 text-right">{(depthEffect * 100).toFixed(0)} %</span>
                          <button onClick={() => setDepthEffect(0.35)} className="text-text-muted hover:text-accent transition-colors">
                            <RotateCcw size={12} />
                          </button>
                        </div>
                      </div>
                      <input type="range" min="0" max="1" step="0.05" value={depthEffect} onChange={e => setDepthEffect(Number(e.target.value))} />
                    </div>

                    {/* Contrast */}
                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-[10px] font-mono text-text-muted uppercase tracking-widest">{t('CONTRAST', 'コントラスト')}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-mono text-accent w-8 text-right">{contrast > 0 ? '+' : ''}{contrast}</span>
                          <button onClick={() => setContrast(0)} className="text-text-muted hover:text-accent transition-colors">
                            <RotateCcw size={12} />
                          </button>
                        </div>
                      </div>
                      <input type="range" min="-100" max="100" step="1" value={contrast} onChange={e => setContrast(Number(e.target.value))} />
                    </div>

                    {/* Saturation */}
                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-[10px] font-mono text-text-muted uppercase tracking-widest">{t('SATURATION', '彩度')}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-mono text-accent w-8 text-right">{saturation > 0 ? '+' : ''}{saturation}</span>
                          <button onClick={() => setSaturation(0)} className="text-text-muted hover:text-accent transition-colors">
                            <RotateCcw size={12} />
                          </button>
                        </div>
                      </div>
                      <input type="range" min="-100" max="100" step="1" value={saturation} onChange={e => setSaturation(Number(e.target.value))} />
                    </div>

                    <div className="flex flex-col gap-3 border-t border-panel-border pt-4">
                      <span className="text-[10px] font-mono text-text-muted uppercase tracking-widest">TILE SAMPLING CORE</span>
                      <div className="flex gap-2">
                        <SolidButton active={!averageColor} onClick={() => setAverageColor(false)} className="flex-1 py-1.5 text-[9px]">
                          FAST SCAN
                        </SolidButton>
                        <SolidButton active={averageColor} onClick={() => setAverageColor(true)} className="flex-1 py-1.5 text-[9px]">
                          AVG QUALITY
                        </SolidButton>
                      </div>
                    </div>

                  </div>
                </Panel>

                <Panel title={t("SYSTEM SETTINGS", "システム設定")} className="shrink-0 h-auto">
                  <div className={cn("flex flex-col gap-4 transition-opacity duration-300", !isMosaicEnabled ? "opacity-30 pointer-events-none" : "opacity-100")}>

                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-[10px] font-mono text-text-muted uppercase tracking-widest">{t('MORTAR BRIGHTNESS', '目地の明るさ')}</span>
                        <span className="text-[10px] font-mono text-accent">{mortarBrightness} %</span>
                      </div>
                      <input 
                        type="range" 
                        min="0" max="100" step="1"
                        value={mortarBrightness} 
                        onChange={e => setMortarBrightness(Number(e.target.value))}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2 mt-2">
                      <label className="px-3 py-2 bg-panel-border border border-panel-border text-text-primary text-[8px] uppercase tracking-widest hover:border-text-muted transition-all cursor-pointer flex items-center justify-center gap-1">
                        <Upload size={12} /> IMPORT
                        <input type="file" accept=".json" onChange={importSettings} className="hidden" />
                      </label>
                      <button 
                        onClick={exportSettings}
                        className="px-3 py-2 bg-accent/10 border border-accent/20 text-accent text-[8px] uppercase tracking-widest hover:bg-accent hover:text-white transition-all flex items-center justify-center gap-1"
                      >
                        <Download size={12} /> EXPORT
                      </button>
                    </div>
                  </div>
                </Panel>

                <SolidButton onClick={() => setShowClearAllModal(true)} className="text-red-500 text-[9px] w-full border-red-500/10 py-3 mt-auto">
                  <Trash2 size={12} className="mr-2" /> {t('WIPE SYSTEM CACHE', 'システムキャッシュ削除')}
                </SolidButton>
              </>
            ) : (
              <>
                <Panel title={t("VECTOR STYLER", "ベクタースタイラー")} className="h-full flex flex-col overflow-hidden" contentClassName="flex flex-col p-4 gap-4 h-full">
                  {/* Vector Styler Controls */}
                  <div className={cn("shrink-0 flex flex-col gap-3 transition-opacity duration-300", !isVectorEnabled ? "opacity-30 pointer-events-none" : "opacity-100")}>
                    <div className="flex justify-between items-center text-[10px] font-mono text-text-muted uppercase tracking-widest border-b border-panel-border pb-1">
                      <span>{t('VECTOR PARAMETERS', 'ベクター パラメータ')}</span>
                      <Sparkles size={12} className="text-accent" />
                    </div>
                  
                  <div className="flex flex-col gap-3">
                    
                    {/* Preset Section */}
                    {vectorPresets.length > 0 && (
                      <div className="flex flex-col gap-1 border-b border-panel-border pb-2">
                        <div className="text-[7px] text-text-muted uppercase tracking-widest mb-1">{t('SAVED STYLE PRESETS', '保存されたスタイルプリセット')}</div>
                        <div className="flex flex-wrap gap-1">
                          {vectorPresets.map(p => (
                            <div key={p.id} className="group relative">
                              <button 
                                onClick={() => applyVectorPreset(p)}
                                className="text-[8px] bg-panel-border hover:bg-accent hover:text-white px-2 py-0.5 rounded-sm transition-colors border border-transparent font-mono"
                              >
                                {p.name}
                              </button>
                              <button 
                                onClick={(e) => { e.stopPropagation(); deleteVectorPreset(p.id); }}
                                className="absolute -top-1 -right-1 hidden group-hover:flex w-2.5 h-2.5 bg-red-500 rounded-full items-center justify-center shadow-lg"
                              >
                                <X size={6} className="text-white" />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="flex flex-col gap-6 pt-4">

                      <div className="flex flex-col gap-3">
                        <div className="flex justify-between text-[10px] text-text-muted uppercase tracking-widest font-bold">
                          <span>{t('COLOR STEPS (3-16)', '色数 (3〜16)')}</span>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-accent w-6 text-right">{vectorSteps}</span>
                            <button onClick={() => setVectorSteps(7)} className="text-text-muted hover:text-accent transition-colors">
                              <RotateCcw size={12} />
                            </button>
                          </div>
                        </div>
                        <input 
                          type="range" min="3" max="16" step="1"
                          value={vectorSteps}
                          onChange={(e) => setVectorSteps(Number(e.target.value))}
                          className="w-full h-2 bg-panel-border rounded-lg appearance-none cursor-pointer accent-accent hover:bg-panel-border/80 transition-colors"
                        />
                      </div>

                      <div className="flex flex-col gap-3">
                        <div className="flex justify-between text-[10px] text-text-muted uppercase tracking-widest font-bold">
                          <span>{t('COLOR PRECISION', '色の精度')}</span>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-accent w-6 text-right">{vectorColorPrecision}</span>
                            <button onClick={() => setVectorColorPrecision(3)} className="text-text-muted hover:text-accent transition-colors">
                              <RotateCcw size={12} />
                            </button>
                          </div>
                        </div>
                        <input 
                          type="range" min="1" max="10" step="1"
                          value={vectorColorPrecision}
                          onChange={(e) => setVectorColorPrecision(Number(e.target.value))}
                          className="w-full h-2 bg-panel-border rounded-lg appearance-none cursor-pointer accent-accent hover:bg-panel-border/80 transition-colors"
                        />
                      </div>

                      <div className="flex flex-col gap-3">
                        <div className="flex justify-between text-[10px] text-text-muted uppercase tracking-widest font-bold">
                          <span>{t('SATURATION', '彩度')}</span>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-accent w-8 text-right">{vectorSaturation}%</span>
                            <button onClick={() => setVectorSaturation(100)} className="text-text-muted hover:text-accent transition-colors">
                              <RotateCcw size={12} />
                            </button>
                          </div>
                        </div>
                        <input 
                          type="range" min="0" max="250" step="1"
                          value={vectorSaturation}
                          onChange={(e) => setVectorSaturation(Number(e.target.value))}
                          className="w-full h-2 bg-panel-border rounded-lg appearance-none cursor-pointer accent-accent hover:bg-panel-border/80 transition-colors"
                        />
                      </div>
                      
                      <div className="flex flex-col gap-3">
                        <div className="flex justify-between text-[10px] text-text-muted uppercase tracking-widest font-bold">
                          <span>{t('CONTRAST', 'コントラスト')}</span>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-accent w-8 text-right">{vectorContrast}%</span>
                            <button onClick={() => setVectorContrast(100)} className="text-text-muted hover:text-accent transition-colors">
                              <RotateCcw size={12} />
                            </button>
                          </div>
                        </div>
                        <input 
                          type="range" min="50" max="200" step="1"
                          value={vectorContrast}
                          onChange={(e) => setVectorContrast(Number(e.target.value))}
                          className="w-full h-2 bg-panel-border rounded-lg appearance-none cursor-pointer accent-accent hover:bg-panel-border/80 transition-colors"
                        />
                      </div>

                      <div className="flex flex-col gap-3">
                        <div className="flex justify-between text-[10px] text-text-muted uppercase tracking-widest font-bold">
                          <span>{t('DETAIL SMOOTHING', '滑らかさ (スムージング)')}</span>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-accent w-8 text-right">{vectorSmoothing}%</span>
                            <button onClick={() => setVectorSmoothing(50)} className="text-text-muted hover:text-accent transition-colors">
                              <RotateCcw size={12} />
                            </button>
                          </div>
                        </div>
                        <input 
                          type="range" min="0" max="98" step="1"
                          value={vectorSmoothing}
                          onChange={(e) => setVectorSmoothing(Number(e.target.value))}
                          className="w-full h-2 bg-panel-border rounded-lg appearance-none cursor-pointer accent-accent hover:bg-panel-border/80 transition-colors"
                        />
                      </div>
                    </div>

                    <div className="flex flex-col gap-2 border-t border-panel-border mt-1 pt-3">
                      
                      <div className="flex items-center gap-1">
                        <input 
                          type="text"
                          placeholder="PRESET NAME..."
                          value={newPresetName}
                          onChange={e => setNewPresetName(e.target.value.toUpperCase())}
                          className="flex-1 bg-panel-bg border border-panel-border text-[9px] px-2 py-1 uppercase font-mono text-text-primary focus:border-accent outline-none"
                        />
                        <button 
                          onClick={saveVectorPreset}
                          disabled={!newPresetName.trim()}
                          className="bg-panel-border hover:bg-accent text-text-primary hover:text-white px-2 py-1 text-[8px] font-mono border border-panel-border transition-all disabled:opacity-30 uppercase"
                        >
                          SAVE STYLE
                        </button>
                      </div>

                      <div className="flex items-center gap-2 justify-center py-2 bg-accent/5 border border-accent/20 rounded">
                        <div className={cn("w-1.5 h-1.5 rounded-full", isProcessing ? "bg-accent animate-pulse" : "bg-panel-border")} />
                        <span className="text-[8px] text-text-muted uppercase tracking-widest font-mono">
                          {isProcessing ? "VECTORIZING..." : "READY / AUTO-UPDATE ON"}
                        </span>
                      </div>
                      
                      {vectorizedImage && (
                        <div className="flex flex-col gap-1">
                          <SolidButton 
                            onClick={saveVectorizedAsAsset}
                            className="w-full justify-center bg-panel-border/30 text-text-primary border-panel-border hover:bg-panel-border hover:border-text-muted/50 transition-all font-bold py-2 text-[9px] shadow-sm"
                          >
                            <Download size={10} className="mr-2" /> SAVE AS NEW ASSET
                          </SolidButton>
                        </div>
                      )}
                    </div>
                  </div>
                  </div>
                </Panel>
              </>
            )}
          </div>
          </div>

          {/* Left Sidebar Toggle */}
          <div className="absolute -right-4 top-1/2 -translate-y-1/2 w-4 h-24 flex items-center justify-start group cursor-pointer z-50" onClick={() => setIsLeftSidebarOpen(!isLeftSidebarOpen)}>
            <div className="w-1.5 h-16 bg-panel-border/30 group-hover:bg-panel-border group-hover:w-4 rounded-r flex items-center justify-center transition-all duration-300 border border-l-0 border-panel-border/20 group-hover:border-panel-border shadow-sm text-transparent group-hover:text-text-muted overflow-hidden">
              <ChevronLeft size={12} strokeWidth={3} className={cn("shrink-0 transition-transform duration-300", !isLeftSidebarOpen && "rotate-180")} />
            </div>
          </div>
        </aside>

        {/* Main Viewport: DATA BANKS */}
        <Panel 
          title="DATA BANKS (MOSAIC RENDERER)" 
          headerRight={
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => setViewerBg(v => v === 'black' ? 'white-shadow' : v === 'white-shadow' ? 'white-flat' : 'black')}
                  className="flex items-center justify-center gap-2 transition-all px-3 py-1.5 rounded-sm border border-text-muted/30 bg-panel-border/50 text-text-primary hover:bg-panel-border hover:border-text-muted/50 font-bold text-[9px] uppercase tracking-widest min-w-[120px] shadow-sm"
                  title="Toggle Viewer Background"
                >
                  <Square size={10} className={viewerBg !== 'black' ? "text-white drop-shadow-md" : "text-black drop-shadow-[0_0_1px_rgba(255,255,255,0.8)]"} fill="currentColor" />
                  <span className="truncate">BG: {viewerBg === 'white-shadow' ? 'WHT (SHD)' : viewerBg === 'white-flat' ? 'WHT (FLT)' : 'BLACK'}</span>
                </button>
                <button 
                  onClick={resetView} 
                  className="flex items-center justify-center gap-2 transition-all px-3 py-1.5 rounded-sm border border-text-muted/30 bg-panel-border/50 text-text-primary hover:bg-panel-border hover:border-text-muted/50 font-bold text-[9px] uppercase tracking-widest min-w-[100px] shadow-sm"
                >
                  <Maximize2 size={12} /> <span>{t('RESET VIEW', 'ビューリセット')}</span>
                </button>
              </div>

              <div className="h-4 w-px bg-panel-border hidden md:block" />

              <div className="flex items-center gap-4">
                <SolidButton 
                  onClick={downloadCanvas} 
                  className="px-4 py-1.5 flex items-center justify-center gap-2 border-text-muted/30 font-bold tracking-widest text-[9px] min-w-[120px]"
                >
                  <Download size={12} /> 
                  <span>
                    {(!isMosaicEnabled && !isVectorEnabled) 
                      ? (vectorizedImage ? t('EXPORT VECTOR', 'ベクター画像出力') : t('EXPORT SOURCE', '元の画像出力')) 
                      : t('EXPORT CERAMIC', 'モザイクアート出力')}
                  </span>
                </SolidButton>
                <span className="text-text-muted text-[9px] font-mono whitespace-nowrap">OS_STATUS: {isLoading || isReadingDirectory ? t('RENDERING', 'レンダリング中') : t('ONLINE', '活動中')}</span>
              </div>
            </div>
          }
          className="flex-1 relative overflow-hidden"
          contentClassName={cn("p-0 overflow-hidden relative flex items-center justify-center transition-colors duration-300", viewerBg !== 'black' ? "bg-[#f5f5f5]" : "bg-[#02050a]")}
        >
          {viewerBg === 'black' && <div className="absolute inset-0 bg-checkerboard opacity-2 pointer-events-none" />}
          
          <div 
            ref={viewerRef}
            className="relative w-full h-full flex items-center justify-center cursor-grab active:cursor-grabbing overflow-hidden p-8"
            onWheel={handleWheel}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onContextMenu={(e) => e.preventDefault()}
          >
            <motion.div 
              animate={{ 
                scale: zoom,
                x: pan.x,
                y: pan.y
              }}
              transition={{ type: 'spring', damping: 25, stiffness: 200, mass: 0.5 }}
              className="absolute inset-8 flex items-center justify-center origin-center pointer-events-none"
            >
              <div className={cn("relative inline-flex pointer-events-auto max-w-full max-h-full transition-[filter] duration-300", viewerBg === 'white-shadow' ? "drop-shadow-[16px_24px_32px_rgba(0,0,0,0.55)]" : "drop-shadow-none")}>
                <img 
                  src={selectedImage?.url} 
                  className={cn("relative z-10 object-contain max-w-full max-h-full", (!isVectorEnabled && !isMosaicEnabled) ? "block" : "hidden")}
                  style={{ 
                    aspectRatio: canvasRef.current && canvasRef.current.width ? `${canvasRef.current.width} / ${canvasRef.current.height}` : 'auto'
                  }}
                  alt="Source"
                  crossOrigin="anonymous"
                />
                
                <img 
                  src={vectorizedImage || selectedImage?.url} 
                  className={cn("relative z-10 object-contain max-w-full max-h-full", (isVectorEnabled && !isMosaicEnabled) ? "block" : "hidden")}
                  style={{ 
                    aspectRatio: canvasRef.current && canvasRef.current.width ? `${canvasRef.current.width} / ${canvasRef.current.height}` : 'auto'
                  }}
                  alt="Vectorized"
                  crossOrigin="anonymous"
                />
                
                <canvas 
                  ref={canvasRef} 
                  className={cn("relative z-10 object-contain max-w-full max-h-full", isMosaicEnabled ? "block" : "hidden")}
                  style={{ imageRendering: 'pixelated' }}
                />
              </div>
            </motion.div>
          </div>

          <AnimatePresence>
            {(isLoading || isReadingDirectory) && (
              <motion.div 
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="absolute inset-0 bg-root-bg/40 backdrop-blur-[4px] flex items-center justify-center z-50"
              >
                <div className="flex flex-col items-center gap-4">
                  <RefreshCw className="animate-spin text-accent" size={40} />
                  <span className="text-[11px] font-mono tracking-[0.4em] text-accent uppercase">Generating Ceramic Matrix...</span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <img 
            ref={imageRef} 
            src={isVectorEnabled ? (vectorizedImage || selectedImage?.url) : selectedImage?.url} 
            className="hidden" 
            crossOrigin="anonymous"
            onLoad={() => renderTileArt()}
          />
        </Panel>

        {/* Right Sidebar: IMAGE SOURCES */}
        <aside className={cn("flex flex-col gap-4 shrink-0 overflow-visible relative transition-[width] duration-300 ease-in-out z-40", isRightSidebarOpen ? "w-[280px]" : "w-0")}>
          <div className={cn("flex flex-col gap-4 w-[280px] h-full transition-opacity duration-300 overflow-hidden", isRightSidebarOpen ? "opacity-100" : "opacity-0 pointer-events-none")}>
          <Panel title={t("IMAGE DATABANKS", "画像データバンク")} className="h-full flex flex-col overflow-hidden" contentClassName="flex flex-col p-4 overflow-hidden gap-4 h-full">
            
            <div className="flex gap-2 shrink-0">
              <SolidButton 
                onClick={fetchRandomImage} 
                disabled={isFetchingRemote}
                className={cn(
                  "flex-1 justify-center border-emerald-500/30 transition-all",
                  isFetchingRemote ? "text-emerald-500/50 animate-pulse" : "text-emerald-500"
                )}
                title="Generate New Random Base"
              >
                <RefreshCw size={14} className={cn("mr-2", isFetchingRemote && "animate-spin")} /> 
                {isFetchingRemote ? t('FETCHING...', '取得中...') : t('RE-FETCH', 'ランダム取得')}
              </SolidButton>
              <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" multiple />
              <SolidButton onClick={() => fileInputRef.current?.click()} className="px-4 border-accent/30 text-accent">
                <FolderOpen size={16} />
              </SolidButton>
            </div>

            <SolidButton 
              onClick={() => {
                if (!selectedImage || !selectedImage.id.startsWith('random-') || stockedImages.find(i => i.id === selectedImage?.id) || stockedImages.length >= 5) return;
                setStockedImages(prev => [selectedImage, ...prev].slice(0, 5));
              }}
              disabled={!selectedImage || !selectedImage.id.startsWith('random-') || Boolean(stockedImages.find(i => i.id === selectedImage?.id)) || stockedImages.length >= 5}
              className={cn(
                "shrink-0 justify-center py-1.5 transition-all text-[10px] h-[34px]",
                (!selectedImage || !selectedImage.id.startsWith('random-')) 
                  ? "border-panel-border/30 text-text-muted opacity-50 cursor-not-allowed"
                  : stockedImages.find(i => i.id === selectedImage.id) 
                  ? "border-emerald-500/50 text-emerald-500 opacity-80 cursor-default" 
                  : stockedImages.length >= 5 
                    ? "border-red-500/50 text-red-500 cursor-not-allowed"
                    : "border-accent text-accent hover:bg-accent/10"
              )}
            >
              <Sparkles size={12} className="mr-2 shrink-0" />
              {(!selectedImage || !selectedImage.id.startsWith('random-'))
                ? t('GENERATED IMAGES ONLY', '生成画像のみ対象')
                : stockedImages.find(i => i.id === selectedImage.id) 
                ? t('ALREADY STOCKED', 'ストック済み')
                : stockedImages.length >= 5 
                  ? t('STORAGE FULL (MAX 5)', '上限 (MAX5)')
                  : t('STOCK THIS IMAGE', 'この画像をストック')}
            </SolidButton>

            {/* STOCKED GENERATIONS */}
            {stockedImages.length > 0 && (
              <div className="shrink-0 flex flex-col gap-2 pb-0">
                <div className="flex justify-between items-center text-[9px] font-mono text-text-muted uppercase tracking-widest px-1">
                  <div className="flex items-center gap-1 text-accent">
                    <Sparkles size={10} />
                    <span>{t('STOCKED GENERATIONS', 'ストックされた画像')}</span>
                  </div>
                </div>
                <div className="flex gap-2 overflow-x-auto scrollbar-hide py-1 px-1">
                  {stockedImages.map((sImg) => (
                    <div 
                      key={sImg.id}
                      onClick={() => handleImageSelect(sImg)}
                      className={cn(
                        "w-12 h-12 shrink-0 border cursor-pointer transition-all overflow-hidden bg-black relative group",
                        selectedImage?.id === sImg.id ? "border-accent shadow-[0_0_10px_rgba(234,179,8,0.2)]" : "border-panel-border hover:border-accent/50"
                      )}
                    >
                      <img src={sImg.url} className={cn("w-full h-full object-cover transition-opacity", selectedImage?.id === sImg.id ? "opacity-100" : "opacity-60 group-hover:opacity-100")} title={sImg.name} />
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setStockedImages(prev => prev.filter(img => img.id !== sImg.id));
                        }}
                        className="absolute top-0 right-0 bg-red-500/80 hover:bg-red-500 text-white p-0.5 rounded-bl opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X size={8} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex-1 overflow-y-auto scrollbar-hide flex flex-col gap-1 border-t border-panel-border pt-4 mt-2">
              <div className="flex justify-between items-center px-1 mb-2">
                <div className="text-[9px] font-mono text-text-muted uppercase tracking-widest">LOCAL ASSETS</div>
                {images.length > 0 && (
                  <button 
                    onClick={handleDeleteAllImages}
                    className="text-[8px] font-mono text-text-muted hover:text-red-400 transition-colors flex items-center gap-1 uppercase"
                  >
                    <Trash2 size={8} /> CLEAR ALL
                  </button>
                )}
              </div>
              {images.map(img => (
                <div 
                  key={img.id} 
                  onClick={() => handleImageSelect(img)}
                  className={cn(
                    "flex items-center gap-3 p-2 cursor-pointer border transition-all truncate group",
                    selectedImage?.id === img.id ? "bg-accent/10 border-accent/50 text-accent" : "border-transparent text-text-secondary hover:bg-panel-border"
                  )}
                >
                  <img src={img.url} className="w-12 h-12 object-cover border border-panel-border shrink-0" />
                  <div className="flex flex-col gap-0.5 min-w-0 pr-6 relative w-full">
                    <span className="text-[10px] font-mono truncate uppercase">{img.name}</span>
                    <span className="text-[8px] font-mono text-text-muted">{(img.size / 1024).toFixed(1)} KB</span>
                    <button 
                      onClick={(e) => handleDeleteImage(e, img.id)}
                      className="absolute right-0 top-1/2 -translate-y-1/2 text-text-muted hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                      title="DELETE ASSET"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              ))}
            {images.length === 0 && <div className="text-[10px] text-text-muted text-center py-20 font-mono flex flex-col items-center gap-4">
              <ImageIcon size={32} className="opacity-20" />
              <span>DRAIN STATUS: EMPTY</span>
            </div>}
          </div>
        </Panel>
        </div>

        {/* Right Sidebar Toggle */}
        <div className="absolute -left-4 top-1/2 -translate-y-1/2 w-4 h-24 flex items-center justify-end group cursor-pointer z-50" onClick={() => setIsRightSidebarOpen(!isRightSidebarOpen)}>
          <div className="w-1.5 h-16 bg-panel-border/30 group-hover:bg-panel-border group-hover:w-4 rounded-l flex items-center justify-center transition-all duration-300 border border-r-0 border-panel-border/20 group-hover:border-panel-border shadow-sm text-transparent group-hover:text-text-muted overflow-hidden">
            <ChevronRight size={12} strokeWidth={3} className={cn("shrink-0 transition-transform duration-300", !isRightSidebarOpen && "rotate-180")} />
          </div>
        </div>
      </aside>

      </div>

      <AnimatePresence>
        {showClearAllModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] bg-root-bg/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-panel-bg border border-red-500/50 p-6 font-mono max-w-sm">
               <h2 className="text-red-500 mb-4 flex items-center gap-2 font-bold uppercase tracking-widest"><Trash2 size={20} /> ERASURE_PROCEDURE</h2>
               <p className="text-[10px] text-text-secondary mb-8 leading-relaxed uppercase">CAUTION: THIS WILL PURGE ALL VOLATILE DATA BANKS AND CACHED BLOCKS. DO YOU PROCEED?</p>
               <div className="flex justify-end gap-3">
                 <SolidButton onClick={() => setShowClearAllModal(false)} className="border-transparent shadow-none">ABORT</SolidButton>
                 <button onClick={confirmClearAll} className="px-4 py-2 bg-red-500/10 border border-red-500 text-red-500 text-[10px] font-bold">EXECUTE PURGE</button>
               </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <footer className="flex justify-between text-[8px] font-mono text-text-muted uppercase tracking-[0.2em] shrink-0 border-t border-panel-border pt-2 mt-2">
        <span>[ STATUS: {isLoading ? 'SYNCING...' : 'SYNC_OK'} ]</span>
        <span>{selectedImage ? `${selectedImage.name} | ${selectedImage.type} | SOURCE_SYNCED` : 'WAITING_FOR_DATA'}</span>
        <span>SCAN_LATENCY: 4.2ms</span>
      </footer>

    </div>
  );
}

