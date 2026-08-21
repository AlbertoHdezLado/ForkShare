import { redirect } from "next/navigation";

// Capture now happens directly on the home page; keep this route as a
// redirect for anyone with an old link/bookmark.
export default function NewReceiptRedirect() {
  redirect("/");
}
