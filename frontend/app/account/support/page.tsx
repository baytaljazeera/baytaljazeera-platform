import { redirect } from "next/navigation";

export default function LegacyAccountSupportRedirect() {
  redirect("/account/my-tickets");
}
