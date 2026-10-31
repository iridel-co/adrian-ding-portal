import { CorporateOverdueEmail } from "../src/features/crm/templates";
import { inquiry, config } from "./_data";

export default function Preview() {
  return <CorporateOverdueEmail inquiry={inquiry} config={config} />;
}
