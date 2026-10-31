import type { ReactNode } from "react";
import { Body, Button, Container, Head, Heading, Html, Preview, Section, Text } from "react-email";

const sans = 'Arial, Helvetica, sans-serif';
const serif = 'Georgia, "Times New Roman", serif';
const brand = "#980f09";
const ink = "#222222";

export function EmailLayout({ internal = false, preview, label, title, children }: {
  internal?: boolean; preview: string; label: string; title: string; children: ReactNode;
}) {
  return <Html lang="en"><Head>
    <meta name="color-scheme" content="light" />
    <style>{'@media only screen and (max-width:600px){.email-content{padding:28px 20px!important}.email-title{font-size:32px!important}}'}</style>
  </Head><Preview>{preview}</Preview>
    <Body style={{ backgroundColor: internal ? "#f7f6f4" : "#f5f4f2", color: ink, fontFamily: sans, margin: "0", padding: "32px 12px" }}>
      <Container style={{ maxWidth: "600px", backgroundColor: "#ffffff", border: "1px solid #e8e5e2", borderRadius: internal ? "6px" : "2px", overflow: "hidden" }}>
        <Section style={{ padding: "24px 32px", backgroundColor: internal ? "#1a1715" : "#ffffff", borderTop: `4px solid ${internal ? "#1a1715" : brand}`, borderBottom: "1px solid #e8e5e2" }}>
          <Text style={{ margin: "0", fontFamily: serif, fontSize: "24px", letterSpacing: "2px", lineHeight: "30px", color: internal ? "#ffffff" : ink }}>ADRIAN DING</Text>
          <Text style={{ margin: "5px 0 0", color: internal ? "#c6c0ba" : "#666666", fontSize: "10px", letterSpacing: "2px", lineHeight: "16px" }}>{internal ? "PORTAL / CRM" : "TRAINING & COACHING"}</Text>
        </Section>
        <Section className="email-content" style={{ padding: "36px 32px" }}>
          <Text style={{ margin: "0 0 12px", color: internal ? "#746c65" : brand, fontSize: "11px", fontWeight: "700", letterSpacing: "1.5px", lineHeight: "18px" }}>{label}</Text>
          <Heading className="email-title" as="h1" style={{ margin: "0 0 24px", color: ink, fontFamily: serif, fontWeight: "400", fontSize: "38px", lineHeight: "1.15", overflowWrap: "anywhere" }}>{title}</Heading>
          {children}
        </Section>
        <Section style={{ padding: "20px 32px", borderTop: "1px solid #e8e5e2", backgroundColor: "#faf9f8" }}>
          <Text style={{ margin: "0", color: "#746c65", fontSize: "12px", lineHeight: "20px" }}>{internal ? "Internal notification · Staff sign-in is required to view this record." : "Adrian Ding Team · Questions? Reply to this email."}</Text>
        </Section>
      </Container>
    </Body>
  </Html>;
}

export function EmailParagraph({ children }: { children: ReactNode }) {
  return <Text style={{ margin: "0 0 18px", fontSize: "15px", lineHeight: "25px", color: ink, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{children}</Text>;
}

export function EmailDetails({ rows }: { rows: [string, string][] }) {
  return <Section style={{ margin: "24px 0", border: "1px solid #e8e5e2", backgroundColor: "#faf9f8" }}>
    <table role="presentation" width="100%" cellPadding="0" cellSpacing="0" style={{ borderCollapse: "collapse" }}><tbody>
      {rows.map(([label, value], index) => <tr key={label}>
        <td style={{ padding: "12px 14px", width: "30%", fontFamily: sans, color: "#746c65", fontSize: "12px", lineHeight: "20px", verticalAlign: "top", borderTop: index ? "1px solid #e8e5e2" : undefined }}>{label}</td>
        <td style={{ padding: "12px 14px", fontFamily: sans, color: ink, fontSize: "14px", lineHeight: "20px", verticalAlign: "top", overflowWrap: "anywhere", wordBreak: "break-word", borderTop: index ? "1px solid #e8e5e2" : undefined }}>{value}</td>
      </tr>)}
    </tbody></table>
  </Section>;
}

export function EmailButton({ href, internal = false, children }: { href: string; internal?: boolean; children: ReactNode }) {
  return <Section style={{ margin: "24px 0" }}><Button href={href} style={{ backgroundColor: internal ? "#1a1715" : brand, color: "#ffffff", fontFamily: sans, fontSize: "14px", fontWeight: "700", padding: "14px 22px", borderRadius: internal ? "4px" : "2px", textDecoration: "none", textAlign: "center" }}>{children}</Button></Section>;
}

export function EmailAmount({ label, amount }: { label: string; amount: string }) {
  return <Section style={{ borderLeft: `3px solid ${brand}`, backgroundColor: "#faf7f6", padding: "18px 22px", margin: "24px 0" }}>
    <Text style={{ margin: "0 0 6px", color: "#746c65", fontSize: "12px", lineHeight: "18px" }}>{label}</Text>
    <Text style={{ margin: "0", fontFamily: serif, fontSize: "32px", lineHeight: "40px", color: brand }}>{amount}</Text>
  </Section>;
}
