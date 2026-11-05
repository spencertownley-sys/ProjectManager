import { redirect } from "next/navigation";

/*
  The marketing site (docs/13) is not built yet, so the root sends people into the app: signed in members land in
  their workspace and everyone else on the sign in page.
*/
export default function RootPage() {
  redirect("/app");
}
