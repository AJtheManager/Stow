"use client";

import { useRouter } from "next/navigation";
import { Lock } from "lucide-react";
import { useSession } from "@/context/SessionProvider";
import LockedPlanForm from "@/components/savings/LockedPlanForm";

export default function NewLockedPlanPage() {
  const router = useRouter();
  const { address } = useSession();

  const handleCreated = (planId: string) => {
    router.push(`/savings/locked/${planId}`);
  };

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="mx-auto max-w-2xl">
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <Lock className="h-8 w-8 text-brand" />
            <h1 className="text-3xl font-semibold text-foreground">
              Create a Locked Plan
            </h1>
          </div>
          <p className="text-muted">
            Lock savings until a date you choose. Funds can&apos;t be withdrawn
            before the unlock date.
          </p>
        </div>

        {address ? (
          <LockedPlanForm owner={address} onCreated={handleCreated} />
        ) : (
          <p className="text-sm text-muted">
            Connect a wallet to create a locked plan.
          </p>
        )}
      </div>
    </div>
  );
}
