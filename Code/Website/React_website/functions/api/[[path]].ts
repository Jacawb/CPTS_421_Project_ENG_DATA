// functions/api/[[path]].ts  -> handles every request under /api/*
// Bindings required (Pages project -> Settings -> Bindings): DB (D1)

interface Env {
  DB: D1Database;
}

const MAX_FILE_BYTES = 1_000_000; // D1 caps a single value at ~2 MB

const json = (data: unknown, status = 200) => Response.json(data, { status });
const err = (message: string, status = 400) => json({ error: message }, status);

export const onRequest = async ({ request, env }: { request: Request; env: Env }) => {
  const url = new URL(request.url);
  const method = request.method;
  const parts = url.pathname.replace(/^\/api\/?/, "").split("/").filter(Boolean);
  // parts examples: ["files"], ["files","3"], ["files","3","annotations"], ["groups","2"], ["annotations","9"]

  try {
    // ---------- FILES ----------
    if (parts[0] === "files") {
      // GET /api/files              -> metadata only
      // GET /api/files?content=1    -> metadata + text (used to load the workspace in one request)
      if (parts.length === 1 && method === "GET") {
        const columns = url.searchParams.get("content") === "1"
          ? "id, name, content, size_bytes, created_at"
          : "id, name, size_bytes, created_at";
        const { results } = await env.DB.prepare(
          `SELECT ${columns} FROM files ORDER BY created_at DESC, id DESC`
        ).all();
        return json(results);
      }

      // POST /api/files   body: { name, content }   (JSON, so file names stay out of URLs/logs)
      if (parts.length === 1 && method === "POST") {
        const b = (await request.json()) as { name?: string; content?: string };
        const name = (b.name ?? "").trim() || "untitled.txt";
        const content = b.content ?? "";
        const sizeBytes = new TextEncoder().encode(content).byteLength;
        if (sizeBytes === 0) return err("Empty file");
        if (sizeBytes > MAX_FILE_BYTES) return err("File too large (max 1 MB of text)", 413);

        const row = await env.DB
          .prepare("INSERT INTO files (name, content, size_bytes) VALUES (?, ?, ?) RETURNING id, created_at")
          .bind(name, content, sizeBytes)
          .first<{ id: number; created_at: string }>();
        return json({ id: row!.id, name, size_bytes: sizeBytes, created_at: row!.created_at }, 201);
      }

      const fileId = Number(parts[1]);
      if (!Number.isInteger(fileId)) return err("Bad file id");

      // GET /api/files/:id  -> file + content + annotations
      if (parts.length === 2 && method === "GET") {
        const [fileRes, annRes] = await env.DB.batch([
          env.DB.prepare("SELECT id, name, content FROM files WHERE id = ?").bind(fileId),
          env.DB
            .prepare(
              `SELECT a.id, a.group_id, a.start_offset AS start, a.end_offset AS end,
                      a.selected_text, g.name, g.color
               FROM annotations a JOIN annotation_groups g ON g.id = a.group_id
               WHERE a.file_id = ? ORDER BY a.start_offset`
            )
            .bind(fileId),
        ]);
        const file = fileRes.results[0] as { id: number; name: string; content: string } | undefined;
        if (!file) return err("Not found", 404);
        return json({ id: file.id, name: file.name, content: file.content, annotations: annRes.results });
      }

      // DELETE /api/files/:id
      if (parts.length === 2 && method === "DELETE") {
        const [del] = await env.DB.batch([
          env.DB.prepare("DELETE FROM files WHERE id = ? RETURNING id").bind(fileId), // cascades to annotations
          env.DB.prepare(
            "DELETE FROM annotation_groups WHERE id NOT IN (SELECT DISTINCT group_id FROM annotations)"
          ),
        ]);
        if (del.results.length === 0) return err("Not found", 404);
        return json({ deleted: true });
      }

      // POST /api/files/:id/annotations
      // body: { name, color, start, end, selectedText }
      // start/end both null = a whole-document annotation.
      // Finds the group by name (case-insensitive) or creates it with the given color.
      if (parts.length === 3 && parts[2] === "annotations" && method === "POST") {
        const b = (await request.json()) as {
          name?: string; color?: string; start?: number | null; end?: number | null; selectedText?: string;
        };
        const name = (b.name ?? "").trim();
        if (!name) return err("Tag name required");
        const wholeDocument = b.start == null && b.end == null;
        if (!wholeDocument &&
            (!Number.isInteger(b.start) || !Number.isInteger(b.end) || b.start! < 0 || b.end! <= b.start!))
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
            .bind(fileId, b.start ?? null, b.end ?? null, b.selectedText ?? "", name),
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
    // GET /api/annotations?files=1,2,3  -> every annotation in those files, with its group
    if (parts[0] === "annotations" && parts.length === 1 && method === "GET") {
      const ids = (url.searchParams.get("files") ?? "").split(",").map(Number).filter(Number.isInteger);
      if (ids.length === 0) return json([]);
      const { results } = await env.DB
        .prepare(
          `SELECT a.id, a.file_id, a.group_id, a.start_offset AS start, a.end_offset AS end,
                  a.selected_text, g.name, g.color
           FROM annotations a JOIN annotation_groups g ON g.id = a.group_id
           WHERE a.file_id IN (SELECT value FROM json_each(?))
           ORDER BY a.id`
        )
        .bind(JSON.stringify(ids))
        .all();
      return json(results);
    }

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