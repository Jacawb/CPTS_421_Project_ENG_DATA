// functions/api/[[path]].ts  -> handles every request under /api/*
// Bindings required (Pages project -> Settings -> Bindings): DB (D1), FILES (R2)

interface Env {
  DB: D1Database;
  FILES: R2Bucket;
}

const json = (data: unknown, status = 200) => Response.json(data, { status });
const err = (message: string, status = 400) => json({ error: message }, status);

async function sha256Hex(buf: ArrayBuffer): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export const onRequest = async ({ request, env }: { request: Request; env: Env }) => {
  const url = new URL(request.url);
  const method = request.method;
  const parts = url.pathname.replace(/^\/api\/?/, "").split("/").filter(Boolean);
  // parts examples: ["files"], ["files","3"], ["files","3","annotations"], ["groups","2"], ["annotations","9"]

  try {
    // ---------- FILES ----------
    if (parts[0] === "files") {
      // GET /api/files
      if (parts.length === 1 && method === "GET") {
        const { results } = await env.DB.prepare(
          "SELECT id, name, size_bytes, created_at FROM files ORDER BY created_at DESC, id DESC"
        ).all();
        return json(results);
      }

      // POST /api/files?name=notes.txt   (body = raw text)
      if (parts.length === 1 && method === "POST") {
        const name = (url.searchParams.get("name") ?? "").trim() || "untitled.txt";
        const bytes = await request.arrayBuffer();
        if (bytes.byteLength === 0) return err("Empty file");
        const key = await sha256Hex(bytes);

        await env.FILES.put(key, bytes); // blob first; same content = same key, safe to retry
        const row = await env.DB
          .prepare("INSERT INTO files (name, r2_key, size_bytes) VALUES (?, ?, ?) RETURNING id")
          .bind(name, key, bytes.byteLength)
          .first<{ id: number }>();
        return json({ id: row!.id, name, size_bytes: bytes.byteLength }, 201);
      }

      const fileId = Number(parts[1]);
      if (!Number.isInteger(fileId)) return err("Bad file id");

      // GET /api/files/:id  -> file + content + annotations
      if (parts.length === 2 && method === "GET") {
        const [fileRes, annRes] = await env.DB.batch([
          env.DB.prepare("SELECT id, name, r2_key FROM files WHERE id = ?").bind(fileId),
          env.DB
            .prepare(
              `SELECT a.id, a.group_id, a.start_offset AS start, a.end_offset AS end,
                      a.selected_text, g.name, g.color
               FROM annotations a JOIN annotation_groups g ON g.id = a.group_id
               WHERE a.file_id = ? ORDER BY a.start_offset`
            )
            .bind(fileId),
        ]);
        const file = fileRes.results[0] as { id: number; name: string; r2_key: string } | undefined;
        if (!file) return err("Not found", 404);
        const obj = await env.FILES.get(file.r2_key);
        const content = obj ? await obj.text() : null;
        return json({ id: file.id, name: file.name, content, annotations: annRes.results });
      }

      // DELETE /api/files/:id
      if (parts.length === 2 && method === "DELETE") {
        const file = await env.DB.prepare("SELECT r2_key FROM files WHERE id = ?")
          .bind(fileId)
          .first<{ r2_key: string }>();
        if (!file) return err("Not found", 404);
        await env.DB.batch([
          env.DB.prepare("DELETE FROM files WHERE id = ?").bind(fileId), // cascades to annotations
          env.DB.prepare(
            "DELETE FROM annotation_groups WHERE id NOT IN (SELECT DISTINCT group_id FROM annotations)"
          ),
        ]);
        const shared = await env.DB.prepare("SELECT COUNT(*) AS n FROM files WHERE r2_key = ?")
          .bind(file.r2_key)
          .first<{ n: number }>();
        if (shared!.n === 0) await env.FILES.delete(file.r2_key);
        return json({ deleted: true });
      }

      // POST /api/files/:id/annotations
      // body: { name, color, start, end, selectedText }
      // Finds the group by name (case-insensitive) or creates it with the given color.
      if (parts.length === 3 && parts[2] === "annotations" && method === "POST") {
        const b = (await request.json()) as {
          name?: string; color?: string; start?: number; end?: number; selectedText?: string;
        };
        const name = (b.name ?? "").trim();
        if (!name) return err("Tag name required");
        if (!Number.isInteger(b.start) || !Number.isInteger(b.end) || b.start! < 0 || b.end! <= b.start!)
          return err("Invalid range");

        const [, ins] = await env.DB.batch([
          env.DB
            .prepare("INSERT INTO annotation_groups (name, color) VALUES (?, ?) ON CONFLICT(name) DO NOTHING")
            .bind(name, b.color ?? "default"),
          env.DB
            .prepare(
              `INSERT INTO annotations (file_id, group_id, start_offset, end_offset, selected_text)
               SELECT ?, id, ?, ?, ? FROM annotation_groups WHERE name = ?
               RETURNING id, group_id`
            )
            .bind(fileId, b.start, b.end, b.selectedText ?? "", name),
        ]);
        const row = ins.results[0] as { id: number; group_id: number } | undefined;
        if (!row) return err("Could not create annotation", 500);
        const group = await env.DB.prepare("SELECT name, color FROM annotation_groups WHERE id = ?")
          .bind(row.group_id)
          .first<{ name: string; color: string }>();
        return json({ id: row.id, group_id: row.group_id, ...group }, 201);
      }
    }

    // ---------- GROUPS ----------
    if (parts[0] === "groups") {
      // GET /api/groups  (with tag counts)
      if (parts.length === 1 && method === "GET") {
        const { results } = await env.DB.prepare(
          `SELECT g.id, g.name, g.color, COUNT(a.id) AS tag_count
           FROM annotation_groups g LEFT JOIN annotations a ON a.group_id = g.id
           GROUP BY g.id ORDER BY g.name`
        ).all();
        return json(results);
      }
      // PATCH /api/groups/:id   body: { color }   (recolors every tag in the group)
      const groupId = Number(parts[1]);
      if (parts.length === 2 && method === "PATCH" && Number.isInteger(groupId)) {
        const { color } = (await request.json()) as { color?: string };
        if (!color) return err("Color required");
        await env.DB.prepare("UPDATE annotation_groups SET color = ? WHERE id = ?").bind(color, groupId).run();
        return json({ id: groupId, color });
      }
    }

    // ---------- ANNOTATIONS ----------
    // DELETE /api/annotations/:id  (also removes the group if it is now empty)
    if (parts[0] === "annotations" && parts.length === 2 && method === "DELETE") {
      const id = Number(parts[1]);
      if (!Number.isInteger(id)) return err("Bad id");
      await env.DB.batch([
        env.DB.prepare("DELETE FROM annotations WHERE id = ?").bind(id),
        env.DB.prepare(
          "DELETE FROM annotation_groups WHERE id NOT IN (SELECT DISTINCT group_id FROM annotations)"
        ),
      ]);
      return json({ deleted: true });
    }

    return err("Not found", 404);
  } catch (e) {
    return err(e instanceof Error ? e.message : "Server error", 500);
  }
};