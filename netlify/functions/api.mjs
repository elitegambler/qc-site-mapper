import { getStore } from "@netlify/blobs";

const PASS = "qc2026";

function denied() {
  return new Response(JSON.stringify({ error: "wrong passphrase" }), {
    status: 401,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
  });
}

function cors(body, status = 200, contentType = "application/json") {
  return new Response(body, {
    status,
    headers: {
      "Content-Type": contentType,
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, X-Pass",
      "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
      "Cache-Control": "no-store",
    },
  });
}

export default async (req, context) => {
  if (req.method === "OPTIONS") return cors("", 204);

  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/(\.netlify\/functions\/)?api\/?/, "");
  const segments = path.split("/").filter(Boolean);

  const pass = req.headers.get("x-pass") || url.searchParams.get("pass");
  if (pass !== PASS) return denied();

  const store = getStore("qc-files");

  // GET /api/kmz — list KMZ files
  if (req.method === "GET" && segments[0] === "kmz" && !segments[1]) {
    const { blobs } = await store.list({ prefix: "kmz/" });
    const names = blobs.map((b) => b.key.replace("kmz/", ""));
    return cors(JSON.stringify({ files: names }));
  }

  // GET /api/kmz/:name — download a KMZ file
  if (req.method === "GET" && segments[0] === "kmz" && segments[1]) {
    const name = decodeURIComponent(segments[1]);
    const blob = await store.get("kmz/" + name, { type: "arrayBuffer" });
    if (!blob) return cors(JSON.stringify({ error: "not found" }), 404);
    const ct = name.endsWith(".kml") ? "application/vnd.google-earth.kml+xml" : "application/vnd.google-earth.kmz";
    return new Response(blob, {
      headers: {
        "Content-Type": ct,
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "no-store",
      },
    });
  }

  // POST /api/kmz/:name — upload a KMZ file
  if (req.method === "POST" && segments[0] === "kmz" && segments[1]) {
    const name = decodeURIComponent(segments[1]);
    const body = await req.arrayBuffer();
    if (body.byteLength > 20_000_000) return cors(JSON.stringify({ error: "file too large" }), 400);
    await store.set("kmz/" + name, new Uint8Array(body));
    return cors(JSON.stringify({ ok: true, file: name }));
  }

  // DELETE /api/kmz/:name — delete a KMZ file
  if (req.method === "DELETE" && segments[0] === "kmz" && segments[1]) {
    const name = decodeURIComponent(segments[1]);
    await store.delete("kmz/" + name);
    return cors(JSON.stringify({ ok: true }));
  }

  // GET /api/projects — list project names
  if (req.method === "GET" && segments[0] === "projects" && !segments[1]) {
    const { blobs } = await store.list({ prefix: "projects/" });
    const names = blobs.map((b) => b.key.replace("projects/", ""));
    return cors(JSON.stringify({ files: names }));
  }

  // GET /api/projects/all — download ALL projects in one call
  if (req.method === "GET" && segments[0] === "projects" && segments[1] === "all") {
    const { blobs } = await store.list({ prefix: "projects/" });
    const all = [];
    for (const b of blobs) {
      const raw = await store.get(b.key, { type: "text" });
      if (raw) try { all.push(JSON.parse(raw)); } catch {}
    }
    return cors(JSON.stringify({ projects: all }));
  }

  // GET /api/projects/:name — download a single project
  if (req.method === "GET" && segments[0] === "projects" && segments[1] && segments[1] !== "all") {
    const name = decodeURIComponent(segments[1]);
    const data = await store.get("projects/" + name, { type: "text" });
    if (!data) return cors(JSON.stringify({ error: "not found" }), 404);
    return cors(data);
  }

  // POST /api/projects — save a project (keyed by project id, overwrites on re-save)
  if (req.method === "POST" && segments[0] === "projects") {
    const body = await req.text();
    if (body.length > 20_000_000) return cors(JSON.stringify({ error: "too large" }), 400);
    const data = JSON.parse(body);
    const pid = String(data.id || "project").replace(/[^A-Za-z0-9_\-]/g, "_").trim();
    await store.set("projects/" + pid + ".json", body);
    return cors(JSON.stringify({ ok: true, id: pid }));
  }

  // DELETE /api/projects/:name — delete a project
  if (req.method === "DELETE" && segments[0] === "projects" && segments[1]) {
    const name = decodeURIComponent(segments[1]);
    await store.delete("projects/" + name);
    return cors(JSON.stringify({ ok: true }));
  }

  return cors(JSON.stringify({ error: "not found" }), 404);
};

export const config = {
  path: "/api/*",
};
