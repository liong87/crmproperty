import { redirect } from "next/navigation";

/**
 * Merged into /inbox. Both pages answered "what needs me?", so an agent had to check
 * two places and reliably checked neither.
 */
export default function RemindersPage() {
  redirect("/inbox");
}
