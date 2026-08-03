"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createSession, destroySession, signIn, signUp } from "@/server/auth";

export type AuthState = { error?: string };

const credentials = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export async function signInAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = credentials.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid credentials" };
  }

  const user = await signIn(parsed.data.email, parsed.data.password);
  if (!user) return { error: "Email or password is incorrect" };

  await createSession(user);
  redirect("/app");
}

export async function signUpAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = credentials
    .extend({
      orgName: z.string().min(2, "Company name is required"),
      name: z.string().min(2, "Your name is required"),
    })
    .safeParse({
      orgName: formData.get("orgName"),
      name: formData.get("name"),
      email: formData.get("email"),
      password: formData.get("password"),
    });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid details" };
  }

  try {
    const user = await signUp(parsed.data);
    await createSession(user);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not create the account" };
  }
  redirect("/app");
}

export async function signOutAction() {
  await destroySession();
  redirect("/login");
}
