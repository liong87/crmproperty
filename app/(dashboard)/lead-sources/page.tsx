import { redirect } from "next/navigation";

/** Renamed to /leads-capture, which now covers creating forms as well as mapping them. */
export default function LeadSourcesPage() {
  redirect("/leads-capture");
}
