import { redirect } from "next/navigation";
import { SignUp } from "@clerk/nextjs";
import { LOCAL_AUTH } from "@/lib/auth";

export default function SignUpPage() {
  // Local installs have no accounts to create.
  if (LOCAL_AUTH) redirect("/library");

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--yt-bg)]">
      <SignUp />
    </div>
  );
}
