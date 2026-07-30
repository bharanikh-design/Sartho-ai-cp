import { redirect } from "next/navigation";

export default function WelcomePage() {
  redirect("/?tour=1");
}
