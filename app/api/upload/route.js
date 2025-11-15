import { put } from "@vercel/blob";

export const runtime = "edge";

export async function POST(req) {
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!file) {
      return new Response(JSON.stringify({ error: "Missing file" }), { status: 400 });
    }

    const filename = `${Date.now()}-${(file.name || "upload").replace(/[^a-z0-9.\-]/gi, "_")}`;

    const { url } = await put(filename, file, {
      access: "public",
      addRandomSuffix: true,
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });

    return new Response(JSON.stringify({ url }), { status: 200, headers: { "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
}
