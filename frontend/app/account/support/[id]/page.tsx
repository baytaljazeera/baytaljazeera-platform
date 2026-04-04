import { redirect } from "next/navigation";

export default function LegacyAccountSupportTicketRedirect({ params }: { params: { id: string } }) {
  redirect(`/account/my-tickets?open=${encodeURIComponent(params.id)}`);
}
