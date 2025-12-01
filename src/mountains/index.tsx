import { useEffect, useState, useRef } from "react";
import { createRoot } from "react-dom/client";
import { ShimmerText } from "@openai/apps-sdk-ui/components/ShimmerText";
import { Button } from "@openai/apps-sdk-ui/components/Button";
import { ArrowRotateCcw } from "@openai/apps-sdk-ui/components/Icon";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

interface Mountain {
  name: string;
  rank: number | null;
  elevation: number;
  elevation_ft: string;
  mountain_range: string | null;
  county: string | null;
  latitude: number | null;
  longitude: number | null;
  nearby_towns: string | null;
  image_url: string | null;
  mountain_url: string | null;
}

interface ToolOutput {
  mountains: Mountain[];
}

function waitForToolOutput(maxAttempts = 40, interval = 250): Promise<ToolOutput> {
  return new Promise((resolve, reject) => {
    // First, check immediately (data might already be available)
    if ((window as any).openai?.toolOutput) {
      resolve((window as any).openai.toolOutput);
      return;
    }

    let attempts = 0;

    const checkForData = () => {
      attempts++;

      if ((window as any).openai?.toolOutput) {
        resolve((window as any).openai.toolOutput);
        return;
      }

      if (attempts >= maxAttempts) {
        reject(new Error("Tool output not available after waiting"));
        return;
      }

      setTimeout(checkForData, interval);
    };

    // Start polling after initial check
    setTimeout(checkForData, interval);
  });
}

function App() {
  const [mountains, setMountains] = useState<Mountain[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [selectedMountain, setSelectedMountain] = useState<Mountain | null>(null);
  const [displayMode, setDisplayMode] = useState<"inline" | "fullscreen" | "pip">("pip");
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<Map<string, L.Marker>>(new Map());
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const boundsRef = useRef<L.LatLngBounds | null>(null);
  const selectedMountainRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setIsLoading(true);
    waitForToolOutput()
      .then((data) => {
        const validMountains = (data.mountains || []).filter(
          (m) => m.latitude !== null && m.longitude !== null
        );
        setMountains(validMountains);
        setIsLoading(false);
      })
      .catch((error) => {
        console.warn("Tool output not available:", error);
        setMountains([]);
        setIsLoading(false);
      });
  }, []);

  // Initialize map and add markers (only when mountains data changes)
  useEffect(() => {
    if (isLoading || mountains.length === 0 || !mapContainerRef.current) return;

    // Calculate bounds for all mountains first
    const bounds = L.latLngBounds([]);
    const validMountains = mountains.filter((m) => m.latitude !== null && m.longitude !== null);
    
    validMountains.forEach((mountain) => {
      if (mountain.latitude && mountain.longitude) {
        bounds.extend([mountain.latitude, mountain.longitude]);
      }
    });
    boundsRef.current = bounds;

    // Initialize map - fit to show all mountains
    if (!mapRef.current) {
      mapRef.current = L.map(mapContainerRef.current, {
        zoomControl: true,
      });

      const USGS_USTopo = L.tileLayer('https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 20,
        attribution: 'Tiles courtesy of the <a href="https://usgs.gov/">U.S. Geological Survey</a>'
      });
      
      USGS_USTopo.addTo(mapRef.current);

      // Fit map to show all mountains
      if (bounds.isValid()) {
        mapRef.current.fitBounds(bounds, {
          padding: [20, 20],
        });
      } else {
        // Fallback to Colorado center if no valid bounds
        mapRef.current.setView([39.0, -105.5], 7);
      }

      // Invalidate size to ensure map renders properly
      setTimeout(() => {
        mapRef.current?.invalidateSize();
      }, 100);
    }

    // Clear existing markers
    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current.clear();

    // Add markers for all mountains
    mountains.forEach((mountain) => {
      if (mountain.latitude && mountain.longitude) {
        const isSelected = selectedMountain?.name === mountain.name;
        
        const icon = L.divIcon({
          className: "custom-marker",
          html: `<div style="
            background: ${isSelected ? "#ea580c" : "#dc2626"};
            width: ${isSelected ? "30px" : "24px"};
            height: ${isSelected ? "30px" : "24px"};
            border-radius: 50%;
            border: ${isSelected ? "4px solid #fb923c" : "3px solid white"};
            box-shadow: ${isSelected ? "0 3px 8px rgba(234, 88, 12, 0.4)" : "0 2px 4px rgba(0,0,0,0.3)"};
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: ${isSelected ? "14px" : "12px"};
            color: white;
            font-weight: bold;
            transition: all 0.2s ease;
          ">${mountain.rank || ""}</div>`,
          iconSize: isSelected ? [30, 30] : [24, 24],
          iconAnchor: isSelected ? [15, 15] : [12, 12],
        });

        const marker = L.marker([mountain.latitude, mountain.longitude], { icon })
          .addTo(mapRef.current!)
          .bindPopup(
            `<div style="text-align: center;">
              <strong>${mountain.name}</strong><br/>
              ${mountain.elevation_ft || `${mountain.elevation}ft`}<br/>
              ${mountain.mountain_range ? `Range: ${mountain.mountain_range}` : ""}
            </div>`
          )
          .on("click", () => {
            // Close all other popups first
            markersRef.current.forEach((m) => m.closePopup());
            setSelectedMountain(mountain);
            // Just show the information card, don't zoom
          });

        // Set z-index so selected markers appear on top
        if (isSelected) {
          marker.setZIndexOffset(1000);
        } else {
          marker.setZIndexOffset(0);
        }

        markersRef.current.set(mountain.name, marker);
      }
    });

    return () => {
      // Cleanup on unmount
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [mountains, isLoading]);

  // Update marker icons when selectedMountain changes (without re-initializing map)
  useEffect(() => {
    if (!mapRef.current || markersRef.current.size === 0) return;

    mountains.forEach((mountain) => {
      const marker = markersRef.current.get(mountain.name);
      if (!marker) return;

      const isSelected = selectedMountain?.name === mountain.name;
      
      const icon = L.divIcon({
        className: "custom-marker",
        html: `<div style="
          background: ${isSelected ? "#ea580c" : "#dc2626"};
          width: ${isSelected ? "30px" : "24px"};
          height: ${isSelected ? "30px" : "24px"};
          border-radius: 50%;
          border: ${isSelected ? "4px solid #fb923c" : "3px solid white"};
          box-shadow: ${isSelected ? "0 3px 8px rgba(234, 88, 12, 0.4)" : "0 2px 4px rgba(0,0,0,0.3)"};
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: ${isSelected ? "14px" : "12px"};
          color: white;
          font-weight: bold;
          transition: all 0.2s ease;
        ">${mountain.rank || ""}</div>`,
        iconSize: isSelected ? [30, 30] : [24, 24],
        iconAnchor: isSelected ? [15, 15] : [12, 12],
      });

      marker.setIcon(icon);
      
      // Update z-index so selected markers appear on top
      if (isSelected) {
        marker.setZIndexOffset(1000);
      } else {
        marker.setZIndexOffset(0);
      }
    });
    
    // Close all popups when selection changes
    markersRef.current.forEach((marker) => {
      marker.closePopup();
    });
    
    // Scroll selected mountain into view in the list
    if (selectedMountain && selectedMountainRef.current) {
      selectedMountainRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
      });
    }
  }, [selectedMountain, mountains]);

  // Handle display mode changes - toggle between fullscreen and inline
  const toggleDisplayMode = async () => {
    const newMode = displayMode === "fullscreen" ? "inline" : "fullscreen";
    try {
      if (window.openai?.requestDisplayMode) {
        await window.openai.requestDisplayMode({ mode: newMode });
        setDisplayMode(newMode);
        // Invalidate map size after mode change
        setTimeout(() => {
          mapRef.current?.invalidateSize();
        }, 200);
      }
    } catch (error) {
      console.error("Failed to change display mode:", error);
    }
  };

  // Invalidate map size when display mode changes
  useEffect(() => {
    if (mapRef.current) {
      // Use a small delay to ensure DOM has updated
      setTimeout(() => {
        mapRef.current?.invalidateSize();
      }, 100);
    }
  }, [displayMode]);

  // Listen for display mode changes from the host
  useEffect(() => {
    const checkDisplayMode = () => {
      // The host may change the display mode, so we should check periodically
      // or listen to events if available
      if (mapRef.current) {
        mapRef.current.invalidateSize();
      }
    };

    // Check on mount and periodically
    checkDisplayMode();
    const interval = setInterval(checkDisplayMode, 1000);
    
    return () => clearInterval(interval);
  }, []);

  if (isLoading) {
    return (
      <div 
        className="antialiased w-full text-black border border-black/10 rounded-2xl sm:rounded-3xl overflow-hidden bg-white flex flex-col"
        style={displayMode === "fullscreen" ? { height: "100vh" } : undefined}
      >
        {/* Header */}
        <div className="flex flex-row items-center gap-4 px-4 py-3 border-b border-black/5 flex-shrink-0">
          <div className="w-12 h-12 aspect-square rounded-xl bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center overflow-hidden">
            <img 
              src="https://kxvaohpqmhdtptwnaoyb.supabase.co/storage/v1/object/public/icons/14ersicon.png" 
              alt="14ers Icon" 
              className="w-full h-full object-cover"
            />
          </div>
          <div>
            <div className="text-base sm:text-lg font-medium">Colorado 14ers Map</div>
            <div className="text-sm text-black/60">
              <ShimmerText>Loading...</ShimmerText>
            </div>
          </div>
        </div>

        {/* Loading content area - matches map/results panel height */}
        <div 
          className="flex items-center justify-center"
          style={displayMode === "fullscreen" ? { flex: 1 } : { height: "500px" }}
        >
          <div className="text-center">
            <ShimmerText>Searching for mountains information...</ShimmerText>
          </div>
        </div>
      </div>
    );
  }

  if (mountains.length === 0) {
    return (
      <div 
        className="antialiased w-full text-black border border-black/10 rounded-2xl sm:rounded-3xl overflow-hidden bg-white flex flex-col"
        style={displayMode === "fullscreen" ? { height: "100vh" } : undefined}
      >
        {/* Header */}
        <div className="flex flex-row items-center gap-4 px-4 py-3 border-b border-black/5 flex-shrink-0">
          <div className="w-12 h-12 aspect-square rounded-xl bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center overflow-hidden">
            <img 
              src="https://kxvaohpqmhdtptwnaoyb.supabase.co/storage/v1/object/public/icons/14ersicon.png" 
              alt="14ers Icon" 
              className="w-full h-full object-cover"
            />
          </div>
          <div>
            <div className="text-base sm:text-lg font-medium">Colorado 14ers Map</div>
            <div className="text-sm text-black/60">No mountains</div>
          </div>
        </div>

        {/* Content area - matches map/results panel height */}
        <div 
          className="flex items-center justify-center"
          style={displayMode === "fullscreen" ? { flex: 1 } : { height: "500px" }}
        >
          <div className="text-center text-black/60">No mountains found with location data.</div>
        </div>
      </div>
    );
  }

  return (
    <div 
      className="antialiased w-full text-black border border-black/10 rounded-2xl sm:rounded-3xl overflow-hidden bg-white flex flex-col"
      style={displayMode === "fullscreen" ? { height: "100vh" } : undefined}
    >
      {/* Header */}
      <div className="flex flex-row items-center gap-2 sm:gap-4 px-2 sm:px-4 py-2 sm:py-3 border-b border-black/5 flex-shrink-0">
        <div className="w-8 h-8 sm:w-12 sm:h-12 aspect-square rounded-xl bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center overflow-hidden flex-shrink-0">
          <img 
            src="https://kxvaohpqmhdtptwnaoyb.supabase.co/storage/v1/object/public/icons/14ersicon.png" 
            alt="14ers Icon" 
            className="w-full h-full object-cover"
          />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm sm:text-base md:text-lg font-medium truncate">Colorado 14ers Map</div>
          <div className="text-xs sm:text-sm text-black/60 truncate">
            {mountains.length} {mountains.length === 1 ? "mountain" : "mountains"}
          </div>
        </div>
      </div>

      {/* Map and Results Panel */}
      <div className="flex flex-col sm:flex-row min-h-0" style={displayMode === "fullscreen" ? { flex: 1 } : { height: "500px" }}>
        {/* Map */}
        <div className="flex-1 h-full w-full relative min-h-0" ref={mapContainerRef} style={{ minHeight: displayMode === "fullscreen" ? "0" : "300px" }}>
          {/* Control Buttons - Floating */}
          <div className="absolute top-2 right-2 sm:top-4 sm:right-4 z-[1000] flex flex-col gap-2">
            {/* Fullscreen Toggle Button */}
            {window.openai?.requestDisplayMode && (
              <div className="bg-white rounded-full border border-black/10 shadow-sm hover:bg-gray-100 transition-colors w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center">
                <Button
                  variant="ghost"
                  color="secondary"
                  className="!bg-transparent !text-black hover:!bg-transparent !p-0 !rounded-full !w-full !h-full flex items-center justify-center"
                  onClick={toggleDisplayMode}
                  title={displayMode === "fullscreen" ? "Exit Fullscreen" : "Switch to Fullscreen"}
                >
                  {displayMode === "fullscreen" ? (
                    // Exit fullscreen icon (compress icon)
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 9V4.5M9 9H4.5M9 9L3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5l5.25 5.25" />
                    </svg>
                  ) : (
                    // Enter fullscreen icon (expand icon)
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                    </svg>
                  )}
                </Button>
              </div>
            )}
            {/* Reset Zoom Button */}
            <div className="bg-white rounded-full border border-black/10 shadow-sm hover:bg-gray-100 transition-colors w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center">
              <Button
                variant="ghost"
                color="secondary"
                className="!bg-transparent !text-black hover:!bg-transparent !p-0 !rounded-full !w-full !h-full flex items-center justify-center"
                onClick={() => {
                  setSelectedMountain(null);
                  if (boundsRef.current && mapRef.current) {
                    mapRef.current.fitBounds(boundsRef.current, {
                      padding: [20, 20],
                      animate: true,
                      duration: 0.5,
                    });
                  }
                }}
                title="Reset View"
              >
                <ArrowRotateCcw />
              </Button>
            </div>
          </div>
        </div>

        {/* Results Panel */}
        <div className="w-full sm:w-80 border-t sm:border-t-0 sm:border-l border-black/5 bg-white overflow-y-auto max-h-[200px] sm:max-h-none">
          <div className="p-2 sm:p-4 space-y-2">
            {mountains.map((mountain) => (
              <div
                key={mountain.name}
                ref={selectedMountain?.name === mountain.name ? selectedMountainRef : null}
                onClick={() => {
                  // First click: just show the marker, no zoom
                  // Second click (if already selected): zoom with lower zoom level
                  if (selectedMountain?.name === mountain.name) {
                    // Second click - zoom but less than before
                    if (mountain.latitude && mountain.longitude) {
                      mapRef.current?.setView(
                        [mountain.latitude, mountain.longitude],
                        11,
                        { animate: true, duration: 0.5 }
                      );
                    }
                  } else {
                    // First click - close all popups and select new mountain
                    markersRef.current.forEach((marker) => marker.closePopup());
                    
                    // Check if the new mountain is visible in current viewport
                    if (mapRef.current && mountain.latitude && mountain.longitude) {
                      const bounds = mapRef.current.getBounds();
                      const isVisible = bounds.contains([mountain.latitude, mountain.longitude]);
                      
                      // If not visible, reset zoom to show all mountains
                      if (!isVisible && boundsRef.current && boundsRef.current.isValid()) {
                        mapRef.current.fitBounds(boundsRef.current, {
                          padding: [20, 20],
                          animate: true,
                          duration: 0.5,
                        });
                      }
                    }
                    
                    setSelectedMountain(mountain);
                  }
                }}
                className={`p-2 sm:p-3 rounded-lg cursor-pointer transition-colors ${
                  selectedMountain?.name === mountain.name
                    ? "bg-orange-50 border-2 border-orange-500"
                    : "hover:bg-black/5 border-2 border-transparent"
                }`}
              >
                <div className="flex items-center gap-2 sm:gap-3">
                  {mountain.image_url ? (
                    <img
                      src={mountain.image_url}
                      alt={mountain.name}
                      className="h-10 w-10 sm:h-12 sm:w-12 rounded-lg object-cover ring ring-black/5 flex-shrink-0"
                    />
                  ) : (
                    <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-lg bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center flex-shrink-0">
                      <span className="text-white text-xs sm:text-sm">⛰️</span>
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-xs sm:text-sm truncate">{mountain.name}</div>
                    <div className="flex items-center gap-1.5 sm:gap-2 text-[10px] sm:text-xs text-black/70 mt-0.5 sm:mt-1">
                      <span>⬆ {mountain.elevation_ft || `${mountain.elevation}ft`}</span>
                      {mountain.rank !== null && mountain.rank !== undefined && (
                        <span>• Rank #{mountain.rank}</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

createRoot(document.getElementById("mountains-root")!).render(<App />);
