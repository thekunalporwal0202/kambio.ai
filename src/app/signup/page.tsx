"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signUpAction, type AuthState } from "../auth-actions";
import { Button, Card, CardBody, Input, Label } from "@/components/ui";

export default function SignupPage() {
  const [state, action, pending] = useActionState<AuthState, FormData>(signUpAction, {});

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <Link href="/" className="mb-8 text-lg font-semibold tracking-tight">
        kambio<span className="text-brand">.</span>
      </Link>

      <Card>
        <CardBody>
          <h1 className="text-xl font-semibold">Create your workspace</h1>
          <p className="mt-1 text-sm text-muted">
            You get an inbound address immediately — forward a buyer email and watch it become a
            shipment.
          </p>

          <form action={action} className="mt-6 space-y-4">
            <div>
              <Label htmlFor="orgName">Company</Label>
              <Input id="orgName" name="orgName" required placeholder="Meridian Textiles" />
            </div>
            <div>
              <Label htmlFor="name">Your name</Label>
              <Input id="name" name="name" required placeholder="Priya Raman" />
            </div>
            <div>
              <Label htmlFor="email">Work email</Label>
              <Input id="email" name="email" type="email" required autoComplete="email" />
            </div>
            <div>
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                name="password"
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
              />
            </div>

            {state.error ? (
              <p className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
                {state.error}
              </p>
            ) : null}

            <Button type="submit" variant="primary" className="w-full" disabled={pending}>
              {pending ? "Creating…" : "Create workspace"}
            </Button>
          </form>

          <p className="mt-6 text-xs text-muted">
            Already have an account?{" "}
            <Link href="/login" className="text-brand hover:underline">
              Sign in
            </Link>
          </p>
        </CardBody>
      </Card>
    </main>
  );
}
