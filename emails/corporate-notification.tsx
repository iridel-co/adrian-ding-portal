import { CorporateNotificationEmail } from "../src/features/crm/templates";
import { data, id, config } from "./_data";

export default function Preview() {
  return <CorporateNotificationEmail data={data} id={id} config={config} />;
}
