import { cn } from "cn";
import { Eye, Monitor, Smartphone, Tablet } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  type PreviewContent,
  type PreviewPayload,
  type PreviewView,
  PREVIEW_MESSAGE_TYPE,
  PREVIEW_READY_MESSAGE,
  PREVIEW_VIEWS,
  previewViewSchema
} from "@/features/preview/model";

const DEVICES = [
  { id: "mobile", label: "Mobile", width: 390, icon: Smartphone },
  { id: "tablet", label: "Tablet", width: 768, icon: Tablet },
  { id: "desktop", label: "Desktop", width: 1280, icon: Monitor }
] as const;

type DeviceId = (typeof DEVICES)[number]["id"];

const VIEW_LABELS: Record<PreviewView, string> = {
  card: "Card",
  page: "Page"
};

const POST_DELAY_MS = 150;
const PHONE_SCREEN_MAX_WIDTH = 767;

type PreviewDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  content: PreviewContent;
};

/* Full-screen preview of the public site layout in a frame at a chosen device width. */
export function PreviewDialog({ open, onOpenChange, content }: PreviewDialogProps) {
  const views = PREVIEW_VIEWS[content.kind];
  const [view, setView] = useState<PreviewView>(views.at(-1) ?? "card");
  const [deviceId, setDeviceId] = useState<DeviceId>("desktop");

  useEffect(() => {
    if (open && window.innerWidth <= PHONE_SCREEN_MAX_WIDTH) setDeviceId("mobile");
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[calc(100svh-2rem)] max-w-[calc(100%-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-[calc(100%-2rem)]">
        <div className="flex flex-wrap items-center gap-3 border-b px-4 py-3 pr-14">
          <div className="mr-auto flex flex-col">
            <DialogTitle>Preview</DialogTitle>
            <DialogDescription className="text-xs">
              Shows your unsaved changes. Nothing is saved.
            </DialogDescription>
          </div>
          {views.length > 1 && (
            <Tabs value={view} onValueChange={(value) => setView(previewViewSchema.parse(value))}>
              <TabsList>
                {views.map((option) => (
                  <TabsTrigger key={option} value={option}>
                    {VIEW_LABELS[option]}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          )}
          <div className="flex gap-1 rounded-lg bg-muted p-1" role="group" aria-label="Device">
            {DEVICES.map((device) => (
              <Button
                key={device.id}
                type="button"
                size="sm"
                variant={device.id === deviceId ? "secondary" : "ghost"}
                aria-pressed={device.id === deviceId}
                onClick={() => setDeviceId(device.id)}
              >
                <device.icon />
                <span className="hidden sm:inline">{device.label}</span>
              </Button>
            ))}
          </div>
        </div>
        <PreviewFrame
          content={content}
          view={view}
          width={DEVICES.find((device) => device.id === deviceId)?.width ?? 1280}
        />
      </DialogContent>
    </Dialog>
  );
}

type PreviewFrameProps = {
  content: PreviewContent;
  view: PreviewView;
  width: number;
};

/* The frame at its true device width, scaled down to fit the stage when the stage is narrower. */
function PreviewFrame({ content, view, width }: PreviewFrameProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [isFrameReady, setIsFrameReady] = useState(false);
  const [stage, setStage] = useState({ width: 0, height: 0 });

  useLayoutEffect(() => {
    const element = stageRef.current;
    if (!element) return;

    const observer = new ResizeObserver(([entry]) => {
      setStage({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return;
      if (event.source !== frameRef.current?.contentWindow) return;
      if (event.data === PREVIEW_READY_MESSAGE) setIsFrameReady(true);
    }

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  useEffect(() => {
    if (!isFrameReady) return;

    const payload: PreviewPayload = {
      type: PREVIEW_MESSAGE_TYPE,
      view,
      content
    };
    const timer = window.setTimeout(() => {
      frameRef.current?.contentWindow?.postMessage(payload, window.location.origin);
    }, POST_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [isFrameReady, content, view]);

  const scale = stage.width > 0 ? Math.min(1, stage.width / width) : 1;

  return (
    <div ref={stageRef} className="relative min-h-0 flex-1 overflow-hidden bg-muted/60">
      <div
        className="mx-auto h-full overflow-hidden bg-white shadow-sm"
        style={{ width: width * scale }}
      >
        <iframe
          ref={frameRef}
          src={`/preview/${content.kind}`}
          title="Public site preview"
          className={cn("origin-top-left border-0", !isFrameReady && "opacity-0")}
          style={{
            width,
            height: scale > 0 ? stage.height / scale : stage.height,
            transform: `scale(${scale})`
          }}
        />
      </div>
    </div>
  );
}

export function PreviewButton({ content }: { content: PreviewContent }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <Button type="button" variant="outline" onClick={() => setIsOpen(true)}>
        <Eye />
        Preview
      </Button>
      <PreviewDialog open={isOpen} onOpenChange={setIsOpen} content={content} />
    </>
  );
}
