import { RegistrationPaymentEmail } from "../src/features/crm/registration-template";
import { registrant, course, session, account } from "./_data";

export default function Preview() {
  return <RegistrationPaymentEmail registrant={registrant} course={course} session={{ ...session, endDate: "2026-11-17" }} account={account} qrUrl="/static/payment-qr.svg" />;
}
