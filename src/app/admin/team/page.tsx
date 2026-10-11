import { redirect } from "next/navigation";

// Старый интерфейс отключён. Оставляем адрес для старых закладок и ссылок.
export default function LegacyTeamRedirectPage() {
  redirect("/admin");
}
