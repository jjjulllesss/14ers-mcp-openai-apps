import { useEffect, useState, useRef } from "react";
import { createRoot } from "react-dom/client";
import { ShimmerText } from "@openai/apps-sdk-ui/components/ShimmerText";
import { Button } from "@openai/apps-sdk-ui/components/Button";
import { ArrowRotateCcw } from "@openai/apps-sdk-ui/components/Icon";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

interface Mountain {
  id: number;
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
  image_filename: string | null;
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
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<Map<number, L.Marker>>(new Map());
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
        const isSelected = selectedMountain?.id === mountain.id;
        
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

        markersRef.current.set(mountain.id, marker);
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
      const marker = markersRef.current.get(mountain.id);
      if (!marker) return;

      const isSelected = selectedMountain?.id === mountain.id;
      
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

  if (isLoading) {
    return (
      <div className="antialiased w-full text-black border border-black/10 rounded-2xl sm:rounded-3xl overflow-hidden bg-white">
        <div className="p-4">
          <div className="text-center">
            <ShimmerText>Searching for mountains information...</ShimmerText>
          </div>
        </div>
      </div>
    );
  }

  if (mountains.length === 0) {
    return (
      <div className="antialiased w-full text-black border border-black/10 rounded-2xl sm:rounded-3xl overflow-hidden bg-white">
        <div className="p-4">
          <div className="text-center text-black/60">No mountains found with location data.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="antialiased w-full text-black border border-black/10 rounded-2xl sm:rounded-3xl overflow-hidden bg-white flex flex-col h-full">
      {/* Header */}
      <div className="flex flex-row items-center gap-4 px-4 py-3 border-b border-black/5">
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
            {mountains.length} {mountains.length === 1 ? "mountain" : "mountains"}
          </div>
        </div>
      </div>

      {/* Map and Results Panel */}
      <div className="flex flex-col sm:flex-row" style={{ height: "500px" }}>
        {/* Map */}
        <div className="flex-1 h-full w-full relative" ref={mapContainerRef} style={{ minHeight: "400px" }}>
          {/* Reset Zoom Button - Floating */}
          <div className="absolute top-4 right-4 z-[1000]">
            <div className="bg-white rounded-full border border-black/10 shadow-sm hover:bg-gray-100 transition-colors w-10 h-10 flex items-center justify-center">
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
        <div className="w-full sm:w-80 border-t sm:border-t-0 sm:border-l border-black/5 bg-white overflow-y-auto">
          <div className="p-4 space-y-2">
            {mountains.map((mountain) => (
              <div
                key={mountain.id}
                ref={selectedMountain?.id === mountain.id ? selectedMountainRef : null}
                onClick={() => {
                  // First click: just show the marker, no zoom
                  // Second click (if already selected): zoom with lower zoom level
                  if (selectedMountain?.id === mountain.id) {
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
                className={`p-3 rounded-lg cursor-pointer transition-colors ${
                  selectedMountain?.id === mountain.id
                    ? "bg-orange-50 border-2 border-orange-500"
                    : "hover:bg-black/5 border-2 border-transparent"
                }`}
              >
                <div className="flex items-center gap-3">
                  {mountain.image_url ? (
                    <img
                      src={mountain.image_url}
                      alt={mountain.name}
                      className="h-12 w-12 rounded-lg object-cover ring ring-black/5"
                    />
                  ) : (
                    <div className="h-12 w-12 rounded-lg bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center">
                      <span className="text-white text-sm">⛰️</span>
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">{mountain.name}</div>
                    <div className="flex items-center gap-2 text-xs text-black/70 mt-1">
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
