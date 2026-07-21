import type { Metadata } from "next";
import { AresCockpit } from "../page";

export const metadata: Metadata = {
  title: "ARES CISO — Cyber Decision Engine",
  description: "Review business exposure, compare governed cyber responses, and approve an auditable decision.",
};

export default function CisoPage() {
  return <AresCockpit initialView="ciso" />;
}
