import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase-server";

const allowedTypes: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp"
};
const MAX_FILE_SIZE = 5 * 1024 * 1024;

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get("file");

  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Proof of payment attachment is required." }, { status: 400 });
  }
  if (!allowedTypes[file.type]) {
    return NextResponse.json({ error: "Proof of payment must be a JPG, PNG, or WEBP image." }, { status: 400 });
  }
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: "Proof of payment must be 5 MB or smaller." }, { status: 400 });
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const ext = allowedTypes[file.type];
  const path = `proofs/${Date.now()}-${crypto.randomUUID()}.${ext}`;
  const supabase = getServerSupabase();
  const { error } = await supabase.storage.from("payment-proofs").upload(path, bytes, {
    contentType: file.type,
    upsert: false
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ path });
}
