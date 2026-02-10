import { useVsCodeApi } from "@/hooks/useVsCodeApi";

export function WelcomeView() {
  useVsCodeApi(); // keep hook initialization for future actions

  return (
    <div
      id="welcome-view"
      className="mx-auto my-auto flex w-full max-w-thread flex-grow flex-col px-4"
    >
      <div className="flex w-full flex-grow flex-col items-center justify-center">
        <div className="flex size-full flex-col justify-center px-8">
          {/* Intentionally blank (composer remains visible below) */}
        </div>
      </div>
    </div>
  );
}
