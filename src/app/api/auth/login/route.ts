import { NextRequest, NextResponse } from "next/server";

const AUTH_COOKIE = "serp_auth";
const DEFAULT_USERNAME = "trafficradius";
const DEFAULT_PASSWORD = "Traffic@123";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      username?: string;
      password?: string;
    };

    const username = (body.username ?? "").trim();
    const password = body.password ?? "";

    const expectedUsername = process.env.LOGIN_USERNAME ?? DEFAULT_USERNAME;
    const expectedPassword = process.env.LOGIN_PASSWORD ?? DEFAULT_PASSWORD;

    if (username !== expectedUsername || password !== expectedPassword) {
      return NextResponse.json(
        { error: "Invalid username or password." },
        { status: 401 }
      );
    }

    const res = NextResponse.json({ success: true });
    res.cookies.set(AUTH_COOKIE, "1", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
    });
    return res;
  } catch {
    return NextResponse.json(
      { error: "Invalid request payload." },
      { status: 400 }
    );
  }
}
