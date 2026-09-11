import { redirect } from "next/navigation";
import { SignIn } from "@clerk/nextjs";
import { LOCAL_AUTH } from "@/lib/auth";

export default function SignInPage() {
  // Local installs have no accounts to sign into.
  if (LOCAL_AUTH) redirect("/library");

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--yt-bg)]">
      <SignIn />
    </div>
  );
}
