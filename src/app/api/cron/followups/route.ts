import { NextRequest, NextResponse } from "next/server";
import { env } from "@/env";
import { sweepFollowUps } from "@/server/domain/followups";
import "@/server/queue/handlers";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Follow-up sweep, callable from any scheduler (Vercel Cron, GitHub Actions,
 * a plain curl in crontab). The BullMQ worker also runs this on a repeatable
 * job — whichever fires first wins, and the second is a no-op because the
 * sweep advances `dueAt` as it goes.
 */
async function run() {
  const result = await sweepFollowUps();
  return NextResponse.json({ ok: true, ...result });
}

function authorised(req: NextRequest) {
  if (!env.CRON_SECRET) return true; // dev only
  const header = req.headers.get("authorization") ?? "";
  const bearer = header.startsWith("Bearer ") ? header.slice(7) : "";
  return bearer === env.CRON_SECRET || req.nextUrl.searchParams.get("secret") === env.CRON_SECRET;
}

export async function POST(req: NextRequest) {
  if (!authorised(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return run();
}

// GET so schedulers that only issue GETs (Vercel Cron) work unchanged.
export async function GET(req: NextRequest) {
  if (!authorised(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return run();
}
