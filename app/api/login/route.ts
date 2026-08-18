import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const body = await request.json();
  const username = process.env.ADMIN_USERNAME || "admin";
  const password = process.env.ADMIN_PASSWORD || "Admin@2026";
  if (body.username === username && body.password === password) {
    return NextResponse.json({ ok: true, token: "mvp-admin" });
  }
  return NextResponse.json({ ok: false, message: "账号或密码错误" }, { status: 401 });
}
