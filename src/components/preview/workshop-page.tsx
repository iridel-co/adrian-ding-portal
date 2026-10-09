import { HeroSection } from "@/components/preview/sections/hero";
import {
  ContactSection,
  CorporatePromoSection,
  FaqSection,
  FinalCtaSection,
  TestimonialsSection
} from "@/components/preview/sections/closing";
import { OverviewSection } from "@/components/preview/sections/overview";
import {
  AudienceSection,
  CurriculumSection,
  InclusionsSection
} from "@/components/preview/sections/program";
import { ClientLogosSection, CoachSection, PrimerSection } from "@/components/preview/sections/trust";
import type { PreviewModel } from "@/features/preview/model";

/* The public workshop detail page, in the public site section order. */
export function WorkshopPage({ model }: { model: PreviewModel }) {
  return (
    <>
      <HeroSection model={model} />
      <OverviewSection model={model} />
      <PrimerSection model={model} />
      <ClientLogosSection />
      <CoachSection />
      <CurriculumSection model={model} />
      <InclusionsSection model={model} />
      <AudienceSection model={model} />
      <TestimonialsSection />
      <FaqSection />
      <FinalCtaSection model={model} />
      <CorporatePromoSection />
      <ContactSection />
    </>
  );
}
