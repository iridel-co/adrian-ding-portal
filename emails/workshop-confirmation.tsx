import { RegistrationAcknowledgmentEmail } from "../src/features/crm/registration-template";
import { registrant, course, session } from "./_data";

export default function Preview() {
  return <RegistrationAcknowledgmentEmail registrant={registrant} course={course} session={session} />;
}
