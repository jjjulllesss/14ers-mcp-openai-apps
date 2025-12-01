import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { ShimmerText } from "@openai/apps-sdk-ui/components/ShimmerText";
import { Button } from "@openai/apps-sdk-ui/components/Button";
import { ArrowLeft, ArrowRight } from "@openai/apps-sdk-ui/components/Icon";
import useEmblaCarousel from "embla-carousel-react";

// Fixed height for all widgets (except map)
const WIDGET_FIXED_HEIGHT = "400px";


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

interface Route {
  mountain_name: string;
  route_name: string;
  route_difficulty: string;
  roundtrip_distance: number | null;
  elevation_gain: number | null;
  mountain_range: string | null;
  snow: boolean | null;
  snow_difficulty?: string;
  risk_factor_exposure: string | null;
  risk_factor_rockfall: string | null;
  risk_factor_route_finding: string | null;
  risk_factor_commitment: string | null;
  route_url: string | null;
  standard: boolean | null;
}

interface WeatherPeriod {
  name?: string;
  temperature?: number | { value?: number; unitCode?: string };
  temperatureUnit?: string;
  wind_speed?: string;
  wind_direction?: string;
  short_forecast?: string;
  detailed_forecast?: string;
  probabilityOfPrecipitation?: number | { value?: number; unitCode?: string };
  icon?: string;
}

interface WeatherData {
  mountain_name: string;
  location: {
    latitude: number;
    longitude: number;
  };
  current_conditions: WeatherPeriod;
  forecast: WeatherPeriod[];
}

interface ToolOutput {
  mountain: Mountain | null;
  route_count?: number;
  routes?: Route[];
  weather?: WeatherData;
}

type ViewMode = "info" | "routes" | "weather";

interface WidgetState {
  viewMode: ViewMode;
  routes?: Route[];
  weather?: WeatherData;
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
  const [mountain, setMountain] = useState<Mountain | null>(null);
  const [routeCount, setRouteCount] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [viewMode, setViewMode] = useState<ViewMode>("info");
  const [routes, setRoutes] = useState<Route[]>([]);
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [isLoadingTool, setIsLoadingTool] = useState<boolean>(false);

  // Load initial data from toolOutput
  useEffect(() => {
    setIsLoading(true);
    waitForToolOutput()
      .then((data) => {
        setMountain(data.mountain || null);
        setRouteCount(data.route_count || 0);
        setIsLoading(false);
      })
      .catch((error) => {
        console.warn("Tool output not available:", error);
        setMountain(null);
        setIsLoading(false);
      });
  }, []);

  // Load widget state from setWidgetState if available
  useEffect(() => {
    // Check if there's persisted widget state
    const savedState = (window as any).openai?.widgetState as WidgetState | undefined;
    if (savedState) {
      if (savedState.viewMode === "routes" && savedState.routes) {
        setViewMode("routes");
        setRoutes(savedState.routes);
      } else if (savedState.viewMode === "weather" && savedState.weather) {
        setViewMode("weather");
        setWeather(savedState.weather);
      }
    }
  }, []);


  // Embla carousel for weather view
  const [emblaRef, emblaApi] = useEmblaCarousel({
    align: "center",
    loop: false,
    containScroll: "trimSnaps",
    slidesToScroll: "auto",
    dragFree: false,
  });
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);

  useEffect(() => {
    if (!emblaApi || viewMode !== "weather") return;
    const updateButtons = () => {
      setCanPrev(emblaApi.canScrollPrev());
      setCanNext(emblaApi.canScrollNext());
    };
    updateButtons();
    emblaApi.on("select", updateButtons);
    emblaApi.on("reInit", updateButtons);
    emblaApi.on("resize", updateButtons);
    emblaApi.on("settle", updateButtons);
    return () => {
      emblaApi.off("select", updateButtons);
      emblaApi.off("reInit", updateButtons);
      emblaApi.off("resize", updateButtons);
      emblaApi.off("settle", updateButtons);
    };
  }, [emblaApi, viewMode]);

  // Reinitialize carousel when weather data changes or view mode changes to weather
  useEffect(() => {
    if (!emblaApi || viewMode !== "weather" || !weather) return;
    // Wait for DOM to update, then reinitialize
    const timeoutId = setTimeout(() => {
      emblaApi.reInit();
      // Update button states after reinit with a small delay to ensure DOM is ready
      setTimeout(() => {
        const prev = emblaApi.canScrollPrev();
        const next = emblaApi.canScrollNext();
        setCanPrev(prev);
        setCanNext(next);
      }, 100);
    }, 300);
    return () => clearTimeout(timeoutId);
  }, [emblaApi, viewMode, weather]);

  // Helper function to get difficulty color
  function getDifficultyColor(difficulty: string): string {
    if (difficulty.includes("Class 1") || difficulty.includes("Easy")) {
      return "bg-green-100 text-green-800 border-green-300";
    } else if (difficulty.includes("Class 2")) {
      return "bg-blue-100 text-blue-800 border-blue-300";
    } else if (difficulty.includes("Class 3")) {
      return "bg-yellow-100 text-yellow-800 border-yellow-300";
    } else if (difficulty.includes("Class 4")) {
      return "bg-orange-100 text-orange-800 border-orange-300";
    } else if (difficulty.includes("Class 5")) {
      return "bg-red-100 text-red-800 border-red-300";
    }
    return "bg-gray-100 text-gray-800 border-gray-300";
  }

  // Helper function to extract temperature value
  function extractTemperature(temp: number | { value?: number; unitCode?: string } | undefined): number | null {
    if (temp === undefined || temp === null) return null;
    if (typeof temp === "number") return temp;
    return temp.value ?? null;
  }

  // Helper function to extract temperature unit
  function extractTemperatureUnit(temp: number | { value?: number; unitCode?: string } | undefined, defaultUnit: string): string {
    if (typeof temp === "object" && temp?.unitCode) {
      if (temp.unitCode.includes("degF")) return "F";
      if (temp.unitCode.includes("degC")) return "C";
    }
    return defaultUnit;
  }

  // Helper function to extract probability
  function extractProbability(pop: number | { value?: number; unitCode?: string } | undefined): number | null {
    if (pop === undefined || pop === null) return null;
    if (typeof pop === "number") return pop;
    return pop.value ?? null;
  }

  // Function to go back to info view
  const goBackToInfo = () => {
    setViewMode("info");
    if (window.openai?.setWidgetState) {
      window.openai.setWidgetState({ viewMode: "info" });
    }
  };

  if (isLoading) {
    return (
      <div 
        className="antialiased w-full text-black border border-black/10 rounded-2xl sm:rounded-3xl overflow-hidden bg-white flex flex-col"
        style={{ height: WIDGET_FIXED_HEIGHT }}
      >
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <ShimmerText>Searching for mountain information...</ShimmerText>
          </div>
        </div>
      </div>
    );
  }

  if (!mountain) {
    return (
      <div 
        className="antialiased w-full text-black border border-black/10 rounded-2xl sm:rounded-3xl overflow-hidden bg-white flex flex-col"
        style={{ height: WIDGET_FIXED_HEIGHT }}
      >
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center text-black/60">No mountain information available.</div>
        </div>
      </div>
    );
  }

  // Show loading state when tool is being called
  if (isLoadingTool) {
    return (
      <div 
        className="antialiased w-full text-black border border-black/10 rounded-2xl sm:rounded-3xl overflow-hidden bg-white flex flex-col"
        style={{ height: WIDGET_FIXED_HEIGHT }}
      >
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <ShimmerText>Loading...</ShimmerText>
          </div>
        </div>
      </div>
    );
  }

  // Routes view
  if (viewMode === "routes" && routes.length > 0) {
    return (
      <div 
        className="antialiased w-full text-black border border-black/10 rounded-2xl sm:rounded-3xl overflow-hidden bg-white flex flex-col"
        style={{ height: WIDGET_FIXED_HEIGHT }}
      >
        {/* Header with back button */}
        <div className="flex flex-row items-center gap-2 sm:gap-4 px-2 sm:px-4 py-2 sm:py-3 border-b border-black/5 flex-shrink-0">
          <button
            onClick={goBackToInfo}
            className="p-1 hover:bg-black/5 rounded transition-colors flex-shrink-0"
            title="Back to mountain info"
          >
            <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="w-8 h-8 sm:w-12 sm:h-12 aspect-square rounded-xl bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center overflow-hidden flex-shrink-0">
            <img 
              src="https://kxvaohpqmhdtptwnaoyb.supabase.co/storage/v1/object/public/icons/14ersicon.png" 
              alt="14ers Icon" 
              className="w-full h-full object-cover"
            />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm sm:text-base font-medium truncate">Climbing Routes</div>
            <div className="text-xs sm:text-sm text-black/60 truncate">
              {routes.length} {routes.length === 1 ? "route" : "routes"}
            </div>
          </div>
        </div>

        {/* Routes List */}
        <div className="overflow-y-auto flex-1 min-h-0">
          <div className="p-2 sm:p-4 space-y-2 sm:space-y-3">
            {routes.map((route, index) => (
              <div
                key={`${route.mountain_name}-${route.route_name}-${index}`}
                className="p-2 sm:p-3 rounded-lg border border-black/10 hover:border-orange-300 hover:shadow-md transition-all bg-white"
              >
                <div className="flex flex-col gap-2 sm:gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 mb-1.5 sm:mb-2">
                      <div className="flex-1 min-w-0">
                        <h3 className="text-base sm:text-lg font-semibold text-black truncate">
                          {route.route_name}
                        </h3>
                        <p className="text-xs sm:text-sm text-black/70 mt-0.5 truncate">
                          {route.mountain_name}
                          {route.mountain_range && (
                            <span className="ml-1 sm:ml-2 text-black/50">
                              • {route.mountain_range}
                            </span>
                          )}
                        </p>
                      </div>
                      {route.standard && (
                        <span className="px-1.5 sm:px-2 py-0.5 sm:py-1 text-xs font-semibold bg-orange-100 text-orange-800 border border-orange-300 rounded-full whitespace-nowrap flex-shrink-0">
                          Standard
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 sm:gap-2 mb-2 sm:mb-3 flex-wrap">
                      <span
                        className={`px-2 sm:px-2.5 py-0.5 sm:py-1 text-xs font-semibold border rounded-full ${getDifficultyColor(
                          route.route_difficulty
                        )}`}
                      >
                        {route.route_difficulty}
                      </span>
                      {route.snow && (
                        <span className="px-2 sm:px-2.5 py-0.5 sm:py-1 text-xs font-semibold bg-blue-100 text-blue-800 border border-blue-300 rounded-full">
                          ❄️ {route.snow_difficulty ? route.snow_difficulty : "Snow"}
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 mb-2 sm:mb-3">
                      {route.roundtrip_distance !== null && (
                        <div>
                          <div className="text-[10px] sm:text-xs uppercase tracking-wider text-black/60 font-semibold mb-0.5 sm:mb-1">
                            Distance
                          </div>
                          <div className="text-xs sm:text-sm font-medium text-black">
                            {route.roundtrip_distance.toFixed(1)} mi
                          </div>
                        </div>
                      )}
                      {route.elevation_gain !== null && (
                        <div>
                          <div className="text-[10px] sm:text-xs uppercase tracking-wider text-black/60 font-semibold mb-0.5 sm:mb-1">
                            Elevation
                          </div>
                          <div className="text-xs sm:text-sm font-medium text-black">
                            {route.elevation_gain.toLocaleString()} ft
                          </div>
                        </div>
                      )}
                      {route.risk_factor_exposure && (
                        <div>
                          <div className="text-[10px] sm:text-xs uppercase tracking-wider text-black/60 font-semibold mb-0.5 sm:mb-1">
                            Exposure
                          </div>
                          <div className="text-xs sm:text-sm font-medium text-black">
                            {route.risk_factor_exposure}
                          </div>
                        </div>
                      )}
                      {route.risk_factor_rockfall && (
                        <div>
                          <div className="text-[10px] sm:text-xs uppercase tracking-wider text-black/60 font-semibold mb-0.5 sm:mb-1">
                            Rockfall
                          </div>
                          <div className="text-xs sm:text-sm font-medium text-black">
                            {route.risk_factor_rockfall}
                          </div>
                        </div>
                      )}
                    </div>

                    {(route.risk_factor_route_finding || route.risk_factor_commitment) && (
                      <div className="flex flex-wrap gap-1.5 sm:gap-2 mt-1.5 sm:mt-2">
                        {route.risk_factor_route_finding && (
                          <span className="text-[10px] sm:text-xs text-black/70">
                            Route: {route.risk_factor_route_finding}
                          </span>
                        )}
                        {route.risk_factor_commitment && (
                          <span className="text-[10px] sm:text-xs text-black/70">
                            Commit: {route.risk_factor_commitment}
                          </span>
                        )}
                      </div>
                    )}

                    {route.route_url && (
                      <div className="mt-2 sm:mt-3">
                        <Button
                          variant="outline"
                          color="secondary"
                          size="sm"
                          className="text-xs sm:text-sm"
                          onClick={() => {
                            if (route.route_url) {
                              window.open(route.route_url, "_blank", "noopener,noreferrer");
                            }
                          }}
                        >
                          View Details
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Weather view
  if (viewMode === "weather" && weather) {
    const allPeriods: (WeatherPeriod & { isCurrent?: boolean })[] = [
      { ...weather.current_conditions, name: "Current", isCurrent: true },
      ...weather.forecast,
    ];

    return (
      <div 
        className="antialiased relative w-full text-black bg-white border border-black/10 rounded-2xl sm:rounded-3xl overflow-hidden flex flex-col"
        style={{ height: WIDGET_FIXED_HEIGHT }}
      >
        {/* Header with back button */}
        <div className="flex flex-row items-center gap-2 sm:gap-4 px-3 sm:px-5 py-2 sm:py-3 border-b border-black/5 flex-shrink-0">
          <button
            onClick={goBackToInfo}
            className="p-1 hover:bg-black/5 rounded transition-colors flex-shrink-0"
            title="Back to mountain info"
          >
            <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="w-8 h-8 sm:w-10 sm:h-10 aspect-square rounded-xl bg-gradient-to-br from-blue-500 to-cyan-600 flex items-center justify-center overflow-hidden flex-shrink-0">
            <span className="text-white text-base sm:text-xl">🌤️</span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm sm:text-base md:text-lg font-medium truncate">Weather Forecast</div>
            <div className="text-xs sm:text-sm text-black/60 truncate">{weather.mountain_name}</div>
          </div>
        </div>

        {/* Carousel */}
        <div className="overflow-hidden py-3 sm:py-4 flex-1 relative w-full" ref={emblaRef}>
          <div className="flex gap-3 sm:gap-4 max-sm:mx-3 sm:mx-0 items-stretch">
            {allPeriods.map((period, index) => {
              const temp = extractTemperature(period.temperature);
              const tempUnit = extractTemperatureUnit(period.temperature, period.temperatureUnit || "F");
              const pop = extractProbability(period.probabilityOfPrecipitation);
              
              return (
                <div
                  key={index}
                  className="flex-shrink-0 w-[120px] sm:w-[140px] md:w-[180px] border-r border-black/5 last:border-r-0 px-2 sm:px-3"
                >
                  <div className="flex flex-col items-center">
                    {period.icon && (
                      <div className="mt-2 sm:mt-4 h-16 sm:h-20 md:h-24 w-full flex items-center justify-center">
                        <img
                          src={period.icon}
                          alt={period.name || "Weather"}
                          className="h-full w-auto rounded-xl object-contain"
                        />
                      </div>
                    )}
                    <div className="mt-2 sm:mt-4 text-center">
                      <div className="text-sm sm:text-base md:text-lg font-semibold text-black">
                        {period.name || (period.isCurrent ? "Current" : "Forecast")}
                      </div>
                      {temp !== null && (
                        <div className="text-xl sm:text-2xl font-bold text-black mt-0.5 sm:mt-1">
                          {temp}°{tempUnit}
                        </div>
                      )}
                      <div className="mt-1.5 sm:mt-2 text-xs sm:text-sm font-medium text-black/70 text-center">
                        {pop !== null && (
                          <div className="flex items-center justify-center gap-1">
                            <span>💧</span>
                            <span>{pop}%</span>
                          </div>
                        )}
                        {period.wind_speed && (
                          <div className="flex items-center justify-center gap-1 mt-1">
                            <span>💨</span>
                            <span>
                              {period.wind_speed}
                              {period.wind_direction && ` ${period.wind_direction}`}
                            </span>
                          </div>
                        )}
                      </div>
                      {period.short_forecast && (
                        <div className="mt-1.5 sm:mt-2 text-[10px] sm:text-xs text-black/70 text-center line-clamp-2">
                          {period.short_forecast}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Navigation Buttons */}
        <div className="absolute left-1 sm:left-2 top-1/2 -translate-y-1/2 z-20 pointer-events-none">
          <Button
            variant="ghost"
            color="secondary"
            size="sm"
            className={`pointer-events-auto !bg-white !text-black shadow-lg ring ring-black/5 hover:!bg-white !rounded-full !w-7 !h-7 sm:!w-8 sm:!h-8 !p-0 flex items-center justify-center ${!canPrev ? 'opacity-50' : ''}`}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (emblaApi) {
                emblaApi.scrollPrev();
              }
            }}
            aria-label="Previous"
          >
            <ArrowLeft className="h-4.5 w-4.5" />
          </Button>
        </div>
        <div className="absolute right-1 sm:right-2 top-1/2 -translate-y-1/2 z-20 pointer-events-none">
          <Button
            variant="ghost"
            color="secondary"
            size="sm"
            className={`pointer-events-auto !bg-white !text-black shadow-lg ring ring-black/5 hover:!bg-white !rounded-full !w-7 !h-7 sm:!w-8 sm:!h-8 !p-0 flex items-center justify-center ${!canNext ? 'opacity-50' : ''}`}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (emblaApi) {
                emblaApi.scrollNext();
              }
            }}
            aria-label="Next"
          >
            <ArrowRight className="h-4.5 w-4.5" />
          </Button>
        </div>
      </div>
    );
  }

  // Default info view
  return (
    <div 
      className="antialiased w-full text-black border border-black/10 rounded-2xl sm:rounded-3xl overflow-hidden bg-white flex flex-col"
      style={{ height: WIDGET_FIXED_HEIGHT }}
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-0 flex-1 min-h-0 overflow-hidden">
        {/* Image Section */}
        <div className="relative h-[200px] sm:h-full bg-gradient-to-br from-orange-500 to-red-600 flex-shrink-0">
          {mountain.image_url ? (
            <img
              src={mountain.image_url}
              alt={mountain.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-white text-4xl">
              ⛰️
            </div>
          )}
        </div>

        {/* Content Section */}
        <div className="p-4 sm:p-6 md:p-8 flex flex-col gap-4 sm:gap-6 overflow-y-auto min-h-0">
          {/* Header */}
          <div>
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-black mb-3 sm:mb-4">
              {mountain.name}
            </h1>
            <div className="space-y-2 sm:space-y-3">
              {mountain.county && (
                <div>
                  <div className="text-xs uppercase tracking-wider text-black/60 font-semibold mb-1">
                    County
                  </div>
                  <div className="text-base text-black">{mountain.county}</div>
                </div>
              )}
              {mountain.nearby_towns && (
                <div>
                  <div className="text-xs uppercase tracking-wider text-black/60 font-semibold mb-1">
                    Nearby Cities
                  </div>
                  <div className="text-base text-black">{mountain.nearby_towns}</div>
                </div>
              )}
            </div>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-2 gap-3 sm:gap-4 mt-auto">
            <div className="flex flex-col gap-1 sm:gap-2">
              <div className="text-2xl sm:text-3xl font-bold text-orange-600">
                {mountain.elevation_ft || `${mountain.elevation}ft`}
              </div>
              <div className="text-[10px] sm:text-xs uppercase tracking-wider text-black/60 font-semibold">
                Elevation
              </div>
            </div>
            <div className="flex flex-col gap-1 sm:gap-2">
              <div className="text-2xl sm:text-3xl font-bold text-red-600">
                {mountain.rank !== null && mountain.rank !== undefined
                  ? `#${mountain.rank}`
                  : "Unranked"}
              </div>
              <div className="text-[10px] sm:text-xs uppercase tracking-wider text-black/60 font-semibold">
                Ranking
              </div>
            </div>
            <div className="flex flex-col gap-1 sm:gap-2">
              <div
                className="text-2xl sm:text-3xl font-bold text-orange-600 cursor-pointer hover:text-orange-700 transition-colors"
                onClick={async () => {
                  if (mountain?.name && window.openai?.callTool) {
                    setIsLoadingTool(true);
                    try {
                      const result = await window.openai.callTool("get_mountain_routes", {
                        mountain_name: mountain.name,
                      });
                      // Use the return value from callTool
                      // The result might be in structuredContent or directly in result
                      const routesData = (result as any)?.structuredContent?.routes || (result as any)?.routes;
                      if (routesData && Array.isArray(routesData)) {
                        setRoutes(routesData);
                        setViewMode("routes");
                        // Persist state using setWidgetState
                        if (window.openai?.setWidgetState) {
                          window.openai.setWidgetState({
                            viewMode: "routes",
                            routes: routesData,
                          });
                        }
                      }
                    } catch (error) {
                      console.error("Failed to call get_mountain_routes:", error);
                    } finally {
                      setIsLoadingTool(false);
                    }
                  }
                }}
                title="Click to see route details"
              >
                {routeCount}
              </div>
              <div className="text-[10px] sm:text-xs uppercase tracking-wider text-black/60 font-semibold">
                Routes
              </div>
            </div>
            <div className="flex items-end col-span-2 sm:col-span-1">
              <Button
                color="primary"
                block
                className="text-xs sm:text-sm"
                onClick={async () => {
                  if (mountain?.name && window.openai?.callTool) {
                    setIsLoadingTool(true);
                    try {
                      const result = await window.openai.callTool("get_mountain_weather", {
                        mountain_name: mountain.name,
                      });
                      // Use the return value from callTool
                      // The result might be in structuredContent or directly in result
                      const weatherData = (result as any)?.structuredContent?.weather || (result as any)?.weather;
                      if (weatherData) {
                        setWeather(weatherData);
                        setViewMode("weather");
                        // Persist state using setWidgetState
                        if (window.openai?.setWidgetState) {
                          window.openai.setWidgetState({
                            viewMode: "weather",
                            weather: weatherData,
                          });
                        }
                      }
                    } catch (error) {
                      console.error("Failed to call get_mountain_weather:", error);
                    } finally {
                      setIsLoadingTool(false);
                    }
                  }
                }}
              >
                Check Weather
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

createRoot(document.getElementById("mountain-info-root")!).render(<App />);


