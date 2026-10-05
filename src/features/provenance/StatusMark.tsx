import { Check, CircleAlert, Clock3 } from "lucide-react";

import type { CheckStatus } from "./types";

export function StatusMark({ status }: { status: CheckStatus }) {
  const styles = status === "valid" ? "bg-success-soft text-success" : status === "invalid" ? "bg-danger-soft text-danger" : "bg-warning-soft text-warning";
  const Icon = status === "valid" ? Check : status === "invalid" ? CircleAlert : Clock3;
  return <span className={`flex size-6 shrink-0 items-center justify-center rounded-full ${styles}`}><Icon className="size-3.5" aria-hidden="true" /></span>;
}
