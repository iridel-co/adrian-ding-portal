/*
  Copies the "Programs we run in-house" section of the public /corporate-training page.
  Below lg, or without a fine pointer, every card shows who it is for.
  From lg with a fine pointer, a card shows its summary and widens on hover to show who it is for.
*/
import { cn } from "cn";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";

import { Missing, PreviewImage } from "@/components/preview/placeholder";
import { PROGRAMS_SECTION } from "@/components/preview/sample-content";
import type { ProgramPreviewModel } from "@/features/preview/model";

const HOVER_QUERY = "(min-width: 1024px) and (pointer: fine)";
const COLLAPSED_BASIS = "22rem";
const EXPANDED_BASIS = "34rem";
const REVEAL_TRANSITION =
  "grid transition-[grid-template-rows,opacity] duration-[420ms] ease-[cubic-bezier(0.33,1,0.68,1)] motion-reduce:transition-none";

function useCanHover() {
  const [canHover, setCanHover] = useState(false);

  useEffect(() => {
    const query = window.matchMedia(HOVER_QUERY);
    setCanHover(query.matches);

    const onChange = () => setCanHover(query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  return canHover;
}

type ProgramCardProps = {
  model: ProgramPreviewModel;
  canHover: boolean;
  isExpanded: boolean;
  onExpandedChange: (isExpanded: boolean) => void;
};

export function ProgramCard({ model, canHover, isExpanded, onExpandedChange }: ProgramCardProps) {
  const showsDetail = !canHover || isExpanded;
  const title = model.title ?? <Missing>Add a title</Missing>;

  return (
    <div
      className="group relative h-[32rem] w-[82vw] max-w-[22rem] shrink-0 snap-start overflow-hidden rounded-3xl contain-layout lg:h-[34rem] lg:w-auto lg:max-w-none lg:flex-[0_0_22rem]"
      style={
        canHover
          ? {
              flex: `0 0 ${isExpanded ? EXPANDED_BASIS : COLLAPSED_BASIS}`,
              transition: "flex-basis 420ms cubic-bezier(0.33, 1, 0.68, 1)"
            }
          : undefined
      }
      onMouseEnter={() => onExpandedChange(true)}
      onMouseLeave={() => onExpandedChange(false)}
    >
      <PreviewImage
        image={model.image}
        missingLabel="Add a card image"
        className={cn(
          "absolute inset-0 size-full transition-transform duration-500 motion-reduce:transition-none",
          canHover && isExpanded ? "scale-[1.03]" : "scale-100"
        )}
      />
      <div className="absolute inset-0 bg-linear-to-t from-black/70 via-black/35 to-black/10" />
      <div
        className={cn(
          "absolute inset-0 bg-black/35 transition-opacity duration-300 motion-reduce:transition-none",
          showsDetail ? "opacity-100" : "opacity-0"
        )}
      />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex flex-col gap-3 p-6 lg:p-8">
        <h3
          className={cn(
            "max-w-[15.5rem] text-xl leading-tight font-extrabold tracking-[-0.01em] text-balance text-white lg:text-[1.65rem]",
            !canHover && "mx-auto mb-2 text-center lg:mx-0 lg:mb-0 lg:shrink-0 lg:text-left"
          )}
        >
          {title}
        </h3>
        {canHover && (
          <div className={cn(REVEAL_TRANSITION, isExpanded ? "grid-rows-[0fr] opacity-0" : "grid-rows-[1fr] opacity-100")}>
            <div className="min-h-0 overflow-hidden">
              <p className="max-w-[15.5rem] text-sm leading-relaxed text-white/85 lg:text-base">
                {model.summary ?? <Missing>Add a summary</Missing>}
              </p>
            </div>
          </div>
        )}
        <div
          className={cn(REVEAL_TRANSITION, showsDetail ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0")}
        >
          <div className="min-h-0 overflow-hidden">
            <div className={cn("w-full pt-1", canHover && "lg:w-[30rem]")}>
              <p className="text-sm font-semibold text-white">Useful for</p>
              {model.usefulFor.length > 0 ? (
                <ul className="mt-2 space-y-1.5">
                  {model.usefulFor.map((item, index) => (
                    <li key={index} className="flex gap-2.5 text-sm leading-snug text-white/90">
                      <Check className="mt-0.5 size-4 shrink-0 text-white/70" />
                      {item}
                    </li>
                  ))}
                </ul>
              ) : (
                <Missing className="mt-2 text-white">Add who it's useful for</Missing>
              )}
              <div className="mt-5 flex justify-end">
                <span className="relative isolate inline-flex shrink-0 items-center gap-2 overflow-hidden rounded-full bg-brand px-5 py-2.5 text-sm font-semibold text-brand-foreground shadow-lg shadow-black/25">
                  Inquire
                  <ArrowRight className="size-4" />
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

type ProgramSectionPreviewProps = {
  cards: ProgramPreviewModel[];
  editedIndex: number;
};

/* The section with its heading, intro and card row, scrolled so the edited card shows. */
export function ProgramSectionPreview({ cards, editedIndex }: ProgramSectionPreviewProps) {
  const rowRef = useRef<HTMLDivElement>(null);
  const canHover = useCanHover();
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const [scrollEdges, setScrollEdges] = useState({ isAtStart: true, isAtEnd: false });

  useEffect(() => {
    const row = rowRef.current;
    if (!row) return;

    const scrollToEditedCard = () => {
      const firstCard = row.children[0];
      const editedCard = row.children[editedIndex];
      if (!(firstCard instanceof HTMLElement) || !(editedCard instanceof HTMLElement)) return;

      row.scrollTo({ left: editedCard.offsetLeft - firstCard.offsetLeft });
    };

    scrollToEditedCard();
    window.addEventListener("resize", scrollToEditedCard);
    return () => window.removeEventListener("resize", scrollToEditedCard);
  }, [editedIndex]);

  const updateScrollEdges = () => {
    const row = rowRef.current;
    if (!row) return;

    setScrollEdges({
      isAtStart: row.scrollLeft <= 1,
      isAtEnd: row.scrollLeft + row.clientWidth >= row.scrollWidth - 1
    });
  };

  const scrollByCard = (direction: 1 | -1) => {
    rowRef.current?.scrollBy({ left: direction * 360, behavior: "smooth" });
  };

  return (
    <section className="bg-muted/40 py-24 lg:py-36">
      <div className="mx-auto max-w-7xl px-6 sm:px-8">
        <div className="mb-10 flex flex-col gap-6 lg:mb-14 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <h2 className="font-display text-[2.5rem] leading-[1.05] tracking-[-0.02em] lg:text-[3.5rem]">
              Programs <span className="text-brand">we run in-house</span>
            </h2>
            <p className="mt-5 text-lg leading-relaxed text-muted-foreground">
              {PROGRAMS_SECTION.intro}
              {canHover && ` ${PROGRAMS_SECTION.hoverHint}`}
            </p>
          </div>
          <div className="hidden items-center gap-2.5 lg:flex">
            <ScrollButton
              label="Previous programmes"
              isDisabled={scrollEdges.isAtStart}
              onClick={() => scrollByCard(-1)}
            >
              <ArrowLeft className="size-5" />
            </ScrollButton>
            <ScrollButton
              label="Next programmes"
              isDisabled={scrollEdges.isAtEnd}
              onClick={() => scrollByCard(1)}
            >
              <ArrowRight className="size-5" />
            </ScrollButton>
          </div>
        </div>
      </div>
      <div
        ref={rowRef}
        onScroll={updateScrollEdges}
        className="no-scrollbar flex snap-x snap-mandatory scroll-px-6 gap-4 overflow-x-auto px-6 pb-1 sm:scroll-px-8 sm:px-8 lg:snap-none lg:scroll-px-0 lg:gap-5 lg:pr-0 lg:pb-0 lg:pl-10"
      >
        {cards.map((card, index) => (
          <ProgramCard
            key={index}
            model={card}
            canHover={canHover}
            isExpanded={expandedIndex === index}
            onExpandedChange={(isExpanded) => setExpandedIndex(isExpanded ? index : null)}
          />
        ))}
        <div aria-hidden="true" className="w-px shrink-0 lg:w-8" />
      </div>
    </section>
  );
}

type ScrollButtonProps = {
  label: string;
  isDisabled: boolean;
  onClick: () => void;
  children: ReactNode;
};

function ScrollButton({ label, isDisabled, onClick, children }: ScrollButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={isDisabled}
      onClick={onClick}
      className="flex size-11 items-center justify-center rounded-full border border-border/80 text-foreground transition-colors hover:border-foreground hover:bg-foreground hover:text-background disabled:cursor-default disabled:opacity-25 disabled:hover:border-border/80 disabled:hover:bg-transparent disabled:hover:text-foreground"
    >
      {children}
    </button>
  );
}
