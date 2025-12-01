import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { ShimmerText } from "@openai/apps-sdk-ui/components/ShimmerText";
import { Button } from "@openai/apps-sdk-ui/components/Button";

// Fixed height for all widgets (except map)
const WIDGET_FIXED_HEIGHT = "400px";

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

interface ToolOutput {
  routes: Route[];
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

function App() {
  const [routes, setRoutes] = useState<Route[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    setIsLoading(true);
    waitForToolOutput()
      .then((data) => {
        setRoutes(data.routes || []);
        setIsLoading(false);
      })
      .catch((error) => {
        console.warn("Tool output not available:", error);
        setRoutes([]);
        setIsLoading(false);
      });
  }, []);

  if (isLoading) {
    return (
      <div 
        className="antialiased w-full text-black border border-black/10 rounded-2xl sm:rounded-3xl overflow-hidden bg-white flex flex-col"
        style={{ height: WIDGET_FIXED_HEIGHT }}
      >
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <ShimmerText>Loading routes...</ShimmerText>
          </div>
        </div>
      </div>
    );
  }

  if (routes.length === 0) {
    return (
      <div 
        className="antialiased w-full text-black border border-black/10 rounded-2xl sm:rounded-3xl overflow-hidden bg-white flex flex-col"
        style={{ height: WIDGET_FIXED_HEIGHT }}
      >
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center text-black/60">No routes found.</div>
        </div>
      </div>
    );
  }

  // Get mountain name from first route (all routes should have the same mountain_name)
  const mountainName = routes[0]?.mountain_name || "";

  return (
    <div 
      className="antialiased w-full text-black border border-black/10 rounded-2xl sm:rounded-3xl overflow-hidden bg-white flex flex-col"
      style={{ height: WIDGET_FIXED_HEIGHT }}
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
          <div className="text-sm sm:text-base font-medium truncate">Climbing Routes</div>
          <div className="text-xs sm:text-sm text-black/60 truncate">
            {mountainName && `${mountainName} • `}
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
                {/* Main Content */}
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

                  {/* Difficulty Badge */}
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

                  {/* Stats Grid - More compact */}
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

                  {/* Additional Risk Factors - More compact */}
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

                  {/* Route URL Button - Smaller on mobile */}
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

createRoot(document.getElementById("routes-root")!).render(<App />);
