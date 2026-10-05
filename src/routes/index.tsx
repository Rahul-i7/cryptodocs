import { createFileRoute } from "@tanstack/react-router";
import { Workspace } from "@/features/provenance/Workspace";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Aegis Provenance — Offline Document Evidence" },
      { name: "description", content: "A local prototype for cryptographic document attribution, decryption evidence, and fail-closed verification." },
      { property: "og:title", content: "Aegis Provenance — Offline Document Evidence" },
      { property: "og:description", content: "Demonstrate the evidence chain from authorized document access to forensic verification." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  return <Workspace />;
}
