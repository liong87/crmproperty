/**
 * How a PERSON's name is rendered when other people's names are on screen beside it.
 *
 * An agency screen is a list of names, and the reader's first question at every one of
 * them is "is that me?". Answering it by remembering your own name works until two
 * agents share a first name, or a team lead is scanning a board of five people, or the
 * name shown is the closer rather than the owner — at which point the reader guesses,
 * and a guess about who owns a lead is the kind that ends in two people ringing the
 * same client or neither of them doing it.
 *
 * The appointment board already did this and nothing else did, so the same name read as
 * "mine" on one screen and as an anonymous colleague on the next. This is that rule,
 * lifted out so every screen shares it.
 *
 * Deliberately a plain function taking the viewer's id rather than reading a session:
 * it is used from Server and Client Components alike, and a helper that quietly fetches
 * the current user cannot be rendered in either without surprising one of them.
 */
export function who(name: string | null | undefined, id: string | null, meId: string | null): string {
  if (!name) return "Unassigned";
  // Both ids must exist. `null === null` is true in JavaScript, and an unassigned row
  // viewed by a signed-out renderer would otherwise proudly announce itself as you.
  return id != null && meId != null && id === meId ? `${name} (You)` : name;
}
