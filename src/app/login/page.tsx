"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signInAction, type AuthState } from "../auth-actions";
import { Button, Card, CardBody, Input, Label } from "@/components/ui";

export default function LoginPage() {
  const [state, action, pending] = useActionState<AuthState, FormData>(signInAction, {});

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <Link href="/" className="mb-8 text-lg font-semibold tracking-tight">
        kambio<span className="text-brand">.</span>
      </Link>

      <Card>
        <CardBody>
          <h1 className="text-xl font-semibold">Sign in</h1>
          <p className="mt-1 text-sm text-muted">Welcome back to your operations desk.</p>

          <form action={action} className="mt-6 space-y-4">
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
                autoComplete="current-password"
              />
            </div>

            {state.error ? (
              <p className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
                {state.error}
              </p>
            ) : null}

            <Button type="submit" variant="primary" className="w-full" disabled={pending}>
              {pending ? "Signing in…" : "Sign in"}
            </Button>
          </form>

          <p className="mt-6 text-xs text-muted">
            No account?{" "}
            <Link href="/signup" className="text-brand hover:underline">
              Create one
            </Link>
          </p>
          <p className="mt-3 rounded-lg border border-line bg-panel-2 px-3 py-2 text-[11px] text-muted">
            Demo login — <span className="text-fg">ops@meridiantextiles.example</span> /{" "}
            <span className="text-fg">kambio-demo</span>
          </p>
        </CardBody>
      </Card>
    </main>
  );
}
