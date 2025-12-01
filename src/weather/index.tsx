import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { ShimmerText } from "@openai/apps-sdk-ui/components/ShimmerText";
import { Button } from "@openai/apps-sdk-ui/components/Button";
import { ArrowLeft, ArrowRight } from "@openai/apps-sdk-ui/components/Icon";
import useEmblaCarousel from "embla-carousel-react";

// Fixed height for all widgets (except map)
const WIDGET_FIXED_HEIGHT = "400px";

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
  weather: WeatherData;
}

function waitForToolOutput(maxAttempts = 80, interval = 250): Promise<ToolOutput> {
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

function App() {
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
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
    setIsLoading(true);
    waitForToolOutput()
      .then((data) => {
        setWeather(data.weather || null);
        setIsLoading(false);
      })
      .catch((error) => {
        console.warn("Tool output not available:", error);
        setWeather(null);
        setIsLoading(false);
      });
  }, []);

  useEffect(() => {
    if (!emblaApi) return;
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
  }, [emblaApi]);

  // Reinitialize carousel when weather data changes
  useEffect(() => {
    if (!emblaApi || !weather) return;
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
  }, [emblaApi, weather]);

  // Combine current conditions and forecast into a single array for the carousel
  const allPeriods: (WeatherPeriod & { isCurrent?: boolean })[] = weather
    ? [
        { ...weather.current_conditions, name: "Current", isCurrent: true },
        ...weather.forecast,
      ]
    : [];

  if (isLoading) {
    return (
      <div 
        className="antialiased w-full text-black border border-black/10 rounded-2xl sm:rounded-3xl overflow-hidden bg-white flex flex-col"
        style={{ height: WIDGET_FIXED_HEIGHT }}
      >
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <ShimmerText>Loading weather forecast...</ShimmerText>
          </div>
        </div>
      </div>
    );
  }

  if (!weather || allPeriods.length === 0) {
    return (
      <div 
        className="antialiased w-full text-black border border-black/10 rounded-2xl sm:rounded-3xl overflow-hidden bg-white flex flex-col"
        style={{ height: WIDGET_FIXED_HEIGHT }}
      >
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center text-black/60">No weather data available.</div>
        </div>
      </div>
    );
  }

  return (
    <div 
      className="antialiased relative w-full text-black bg-white border border-black/10 rounded-2xl sm:rounded-3xl overflow-hidden flex flex-col"
      style={{ height: WIDGET_FIXED_HEIGHT }}
    >
      {/* Header */}
      <div className="flex flex-row items-center gap-2 sm:gap-4 px-3 sm:px-5 py-2 sm:py-3 border-b border-black/5 flex-shrink-0">
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

createRoot(document.getElementById("weather-root")!).render(<App />);
