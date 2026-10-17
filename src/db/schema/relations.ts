import { defineRelations } from "drizzle-orm";

import { activityLog } from "./activity-log";
import { account, session, user, verification } from "./auth";
import { corporateInquiry, crmEmailJob, crmSubmissionKey, registration } from "./crm";
import { faq } from "./faq";
import { media } from "./media";
import { siteProfile } from "./profile";
import { paymentAccount } from "./payments";
import { client, inhouseProgram, testimonial } from "./showcase";
import { taxonomyTerm } from "./taxonomy";
import { workshop, workshopSession, workshopTag } from "./workshops";

export const relations = defineRelations(
  {
    user,
    session,
    account,
    verification,
    media,
    taxonomyTerm,
    workshop,
    workshopTag,
    workshopSession,
    inhouseProgram,
    paymentAccount,
    testimonial,
    client,
    siteProfile,
    faq,
    activityLog,
    corporateInquiry,
    crmEmailJob,
    crmSubmissionKey,
    registration
  },
  (r) => ({
    user: {
      sessions: r.many.session({ from: r.user.id, to: r.session.userId }),
      accounts: r.many.account({ from: r.user.id, to: r.account.userId })
    },
    session: {
      user: r.one.user({ from: r.session.userId, to: r.user.id })
    },
    account: {
      user: r.one.user({ from: r.account.userId, to: r.user.id })
    },
    workshop: {
      heroMedia: r.one.media({ from: r.workshop.heroMediaId, to: r.media.id }),
      tags: r.many.workshopTag({ from: r.workshop.id, to: r.workshopTag.workshopId }),
      sessions: r.many.workshopSession({ from: r.workshop.id, to: r.workshopSession.workshopId })
    },
    workshopTag: {
      workshop: r.one.workshop({ from: r.workshopTag.workshopId, to: r.workshop.id }),
      term: r.one.taxonomyTerm({ from: r.workshopTag.termId, to: r.taxonomyTerm.id })
    },
    workshopSession: {
      workshop: r.one.workshop({ from: r.workshopSession.workshopId, to: r.workshop.id }),
      registrations: r.many.registration({ from: r.workshopSession.id, to: r.registration.workshopSessionId })
    },
    corporateInquiry: {
      emailJobs: r.many.crmEmailJob({ from: r.corporateInquiry.id, to: r.crmEmailJob.corporateInquiryId })
    },
    crmEmailJob: {
      corporateInquiry: r.one.corporateInquiry({ from: r.crmEmailJob.corporateInquiryId, to: r.corporateInquiry.id }),
      registration: r.one.registration({ from: r.crmEmailJob.registrationId, to: r.registration.id })
    },
    registration: {
      workshopSession: r.one.workshopSession({ from: r.registration.workshopSessionId, to: r.workshopSession.id }),
      emailJobs: r.many.crmEmailJob({ from: r.registration.id, to: r.crmEmailJob.registrationId }),
      submissionKeys: r.many.crmSubmissionKey({ from: r.registration.id, to: r.crmSubmissionKey.registrationId })
    },
    crmSubmissionKey: {
      registration: r.one.registration({ from: r.crmSubmissionKey.registrationId, to: r.registration.id }),
      corporateInquiry: r.one.corporateInquiry({ from: r.crmSubmissionKey.corporateInquiryId, to: r.corporateInquiry.id })
    },
    inhouseProgram: {
      image: r.one.media({ from: r.inhouseProgram.imageMediaId, to: r.media.id })
    },
    testimonial: {
      photo: r.one.media({ from: r.testimonial.photoMediaId, to: r.media.id }),
      workshop: r.one.workshop({ from: r.testimonial.workshopId, to: r.workshop.id })
    },
    client: {
      logo: r.one.media({ from: r.client.logoMediaId, to: r.media.id }),
      industry: r.one.taxonomyTerm({ from: r.client.industryTermId, to: r.taxonomyTerm.id })
    },
    paymentAccount: {
      qrMedia: r.one.media({ from: r.paymentAccount.qrMediaId, to: r.media.id })
    },
    siteProfile: {
      portrait: r.one.media({ from: r.siteProfile.portraitMediaId, to: r.media.id })
    },
    activityLog: {
      user: r.one.user({ from: r.activityLog.userId, to: r.user.id })
    }
  })
);
