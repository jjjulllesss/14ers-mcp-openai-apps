/// <reference types="vite/client" />

interface Window {
  openai?: {
    toolOutput?: any;
    widgetState?: any;
    maxHeight?: number;
    callTool?: (name: string, args: Record<string, unknown>) => Promise<any>;
    setWidgetState?: (state: any) => void;
    sendFollowUpMessage?: (message: string | { prompt: string }) => void;
    sendMessage?: (message: string | { prompt: string }) => void;
  };
  HostAPI?: {
    sendFollowUpMessage?: (message: string | { prompt: string }) => void;
    sendMessage?: (message: string | { prompt: string }) => void;
    postMessage?: (message: string | { prompt: string }) => void;
    sendUserMessage?: (message: string | { prompt: string }) => void;
    submitMessage?: (message: string | { prompt: string }) => void;
  };
}

