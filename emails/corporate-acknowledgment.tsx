import { CorporateAcknowledgmentEmail } from "../src/features/crm/templates";
import { data, id, config } from "./_data";

export default function Preview() {
  return <CorporateAcknowledgmentEmail data={data} id={id} config={config} />;
}
