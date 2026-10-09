import { ChevronDown, Mail, Phone } from "lucide-react";

import { Missing, SampleLabel } from "@/components/preview/placeholder";
import { CONTACT, FAQ_QUESTIONS, TESTIMONIALS } from "@/components/preview/sample-content";
import type { PreviewModel } from "@/features/preview/model";

function TestimonialCard({ testimonial }: { testimonial: (typeof TESTIMONIALS)[number] }) {
  return (
    <figure className="rounded-3xl bg-card p-8 shadow-md lg:p-10">
      <blockquote className="text-[1.05rem] lg:text-[1.15rem]">“{testimonial.quote}”</blockquote>
      <figcaption className="mt-6">
        <p className="font-medium">{testimonial.name}</p>
        <p className="text-sm text-muted-foreground">{testimonial.role}</p>
      </figcaption>
    </figure>
  );
}

/* Testimonials: one card below md, a two-column grid from md. */
export function TestimonialsSection() {
  return (
    <section className="bg-muted/40 py-16 lg:py-24">
      <div className="mx-auto max-w-5xl px-6 sm:px-8">
        <SampleLabel />
        <h2 className="mt-4 font-display text-[2.25rem] leading-[1.05] tracking-[-0.02em] lg:text-[3rem]">
          The language that outlasts the room
        </h2>
        <div className="mt-10 md:hidden">
          <TestimonialCard testimonial={TESTIMONIALS[0]} />
          <div className="mt-5 flex justify-center gap-2">
            {TESTIMONIALS.map((testimonial, index) => (
              <span
                key={testimonial.name}
                className={index === 0 ? "size-2 rounded-full bg-brand" : "size-2 rounded-full bg-border"}
              />
            ))}
          </div>
        </div>
        <div className="mt-10 hidden gap-5 md:grid md:grid-cols-2">
          {TESTIMONIALS.map((testimonial) => (
            <TestimonialCard key={testimonial.name} testimonial={testimonial} />
          ))}
        </div>
      </div>
    </section>
  );
}

/* FAQ heading beside a list of collapsed questions from lg. */
export function FaqSection() {
  return (
    <section className="bg-background py-16 lg:py-24">
      <div className="mx-auto grid max-w-5xl gap-10 px-6 sm:px-8 lg:grid-cols-[0.6fr_minmax(0,1fr)] lg:gap-16">
        <div>
          <SampleLabel />
          <h2 className="mt-4 font-display text-[2.25rem] leading-[1.05] tracking-[-0.02em] lg:text-[3rem]">
            Before you register
          </h2>
        </div>
        <ul className="flex flex-col">
          {FAQ_QUESTIONS.map((question) => (
            <li
              key={question}
              className="flex items-center justify-between gap-4 border-t border-border py-5 text-[1.05rem] last:border-b"
            >
              {question}
              <ChevronDown className="size-5 shrink-0 text-muted-foreground" />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export function FinalCtaSection({ model }: { model: PreviewModel }) {
  return (
    <section className="bg-brand text-brand-foreground">
      <div className="mx-auto flex max-w-5xl flex-col gap-8 px-6 py-16 sm:px-8 lg:flex-row lg:items-center lg:justify-between lg:py-20">
        <div>
          <h2 className="font-display text-[2.25rem] leading-[1.05] tracking-[-0.02em] lg:text-[3rem]">
            {model.title ?? <Missing>Add a title</Missing>}
          </h2>
          <p className="mt-3 text-brand-foreground/80">
            {model.dateText ?? <Missing>No date yet</Missing>}
            {" · "}
            {model.venueName ?? <Missing>Add a venue</Missing>}
            {model.capacity !== null && ` · ${model.capacity} of ${model.capacity} seats left`}
          </p>
          <p className="mt-2 text-sm text-brand-foreground/70">Sending more than one person? Ask about team rates.</p>
        </div>
        <span className="shrink-0 self-start rounded-full bg-brand-foreground px-8 py-3.5 font-medium text-brand lg:self-auto">
          Register now
        </span>
      </div>
    </section>
  );
}

export function CorporatePromoSection() {
  return (
    <section className="bg-background py-16 lg:py-24">
      <div className="mx-auto max-w-5xl px-6 sm:px-8">
        <div className="border-border/60 flex flex-col gap-6 border-t pt-12 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-xl">
            <h2 className="font-display text-[1.75rem] leading-[1.15] tracking-[-0.02em] sm:text-[2.25rem]">
              Want this for your whole team?
            </h2>
            <p className="mt-3 text-muted-foreground">
              We run every workshop in-house, tailored to your company.
            </p>
          </div>
          <span className="flex-1 text-sm font-medium text-brand sm:flex-none sm:text-right">
            Corporate training →
          </span>
        </div>
      </div>
    </section>
  );
}

export function ContactSection() {
  return (
    <section className="bg-muted/40 py-16 lg:py-24">
      <div className="mx-auto grid max-w-5xl gap-10 px-6 sm:px-8 lg:grid-cols-[0.6fr_minmax(0,1fr)] lg:gap-16">
        <div>
          <SampleLabel />
          <h2 className="mt-4 font-display text-[2.25rem] leading-[1.05] tracking-[-0.02em] lg:text-[3rem]">
            Questions? Talk to us.
          </h2>
          <p className="mt-4 text-muted-foreground">{CONTACT.responseTime}</p>
        </div>
        <ul className="flex flex-col gap-4 text-[1.05rem]">
          <li className="flex items-center gap-3">
            <Phone className="size-5 shrink-0 text-brand" />
            Call or text {CONTACT.phone}
          </li>
          {CONTACT.emails.map((email) => (
            <li key={email} className="flex items-center gap-3 break-all">
              <Mail className="size-5 shrink-0 text-brand" />
              {email}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
