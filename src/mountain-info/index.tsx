import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { ShimmerText } from "@openai/apps-sdk-ui/components/ShimmerText";
import { Button } from "@openai/apps-sdk-ui/components/Button";

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
  mountain: Mountain | null;
  route_count?: number;
}

function waitForToolOutput(maxAttempts = 50, interval = 100): Promise<ToolOutput> {
  return new Promise((resolve, reject) => {
    let attempts = 0;

    const checkForData = () => {
      attempts++;

      if ((window as any).openai && (window as any).openai.toolOutput) {
        resolve((window as any).openai.toolOutput);
        return;
      }

      if (attempts >= maxAttempts) {
        reject(new Error("Tool output not available after waiting"));
        return;
      }

      setTimeout(checkForData, interval);
    };

    checkForData();
  });
}

function App() {
  const [mountain, setMountain] = useState<Mountain | null>(null);
  const [routeCount, setRouteCount] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(true);

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

  if (isLoading) {
    return (
      <div className="antialiased w-full text-black px-4 py-6 border border-black/10 rounded-2xl sm:rounded-3xl overflow-hidden bg-white">
        <div className="text-center">
          <ShimmerText>Searching for mountain information...</ShimmerText>
        </div>
      </div>
    );
  }

  if (!mountain) {
    return (
      <div className="antialiased w-full text-black px-4 py-6 border border-black/10 rounded-2xl sm:rounded-3xl overflow-hidden bg-white">
        <div className="text-center text-black/60">No mountain information available.</div>
      </div>
    );
  }

  return (
    <div className="antialiased w-full text-black border border-black/10 rounded-2xl sm:rounded-3xl overflow-hidden bg-white">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-0">
        {/* Image Section */}
        <div className="relative aspect-square sm:aspect-auto sm:h-full min-h-[300px] bg-gradient-to-br from-orange-500 to-red-600">
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
        <div className="p-6 sm:p-8 flex flex-col gap-6">
          {/* Header */}
          <div>
            <h1 className="text-3xl sm:text-4xl font-bold text-black mb-4">
              {mountain.name}
            </h1>
            <div className="space-y-3">
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
          <div className="grid grid-cols-2 gap-4 mt-auto">
            <div className="flex flex-col gap-2">
              <div className="text-3xl font-bold text-orange-600">
                {mountain.elevation_ft || `${mountain.elevation}ft`}
              </div>
              <div className="text-xs uppercase tracking-wider text-black/60 font-semibold">
                Elevation
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <div className="text-3xl font-bold text-red-600">
                {mountain.rank !== null && mountain.rank !== undefined
                  ? `#${mountain.rank}`
                  : "Unranked"}
              </div>
              <div className="text-xs uppercase tracking-wider text-black/60 font-semibold">
                Ranking
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <div
                className="text-3xl font-bold text-orange-600 cursor-pointer hover:text-orange-700 transition-colors"
                onClick={() => {
                  if (mountain?.name && window.openai?.sendFollowUpMessage) {
                    window.openai.sendFollowUpMessage({
                      prompt: `Get more details about the routes for ${mountain.name}.`,
                    });
                  }
                }}
                title="Click to see route details"
              >
                {routeCount}
              </div>
              <div className="text-xs uppercase tracking-wider text-black/60 font-semibold">
                Routes
              </div>
            </div>
            <div className="flex items-end">
              <Button
                color="primary"
                block
                onClick={() => {
                  if (mountain?.name && window.openai?.sendFollowUpMessage) {
                    window.openai.sendFollowUpMessage({
                      prompt: `Get the weather for ${mountain.name}`,
                    });
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


