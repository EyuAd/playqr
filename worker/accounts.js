import { accountOwner, digest } from "./auth.js";
import { librarySnapshot } from "../shared/library.js";
import { text } from "../shared/domain.js";

export async function accounts(request, env, json, readBody) {
  const path = new URL(request.url).pathname;
  const publicProfile = path.match(/^\/profiles\/([a-z0-9][a-z0-9-]{2,23})$/);
  if (publicProfile && request.method === "GET") {
    const p = await env.DB.prepare("SELECT * FROM profiles WHERE handle = ?")
      .bind(publicProfile[1])
      .first();
    if (!p) return json({ error: "Profile not found." }, 404);
    const { results } = await env.DB.prepare(
      "SELECT code,title,description,presentation,created_at FROM links WHERE owner_hash = ? AND kind = 'collection' AND listed = 1 ORDER BY created_at DESC LIMIT 200",
    )
      .bind(p.owner_hash)
      .all();
    return json({
      profile: { handle: p.handle, name: p.name, bio: p.bio },
      collections: results.map((r) => ({
        ...r,
        presentation: JSON.parse(r.presentation),
      })),
    });
  }
  if (!path.startsWith("/account/")) return null;
  const owner = await accountOwner(request, env);
  if (path === "/account/library") {
    if (request.method === "GET") {
      const row = await env.DB.prepare(
        "SELECT data,revision FROM libraries WHERE owner_hash = ?",
      )
        .bind(owner)
        .first();
      return json(
        row
          ? { data: JSON.parse(row.data), revision: row.revision }
          : { data: null, revision: 0 },
      );
    }
    if (request.method === "POST") {
      const input = await readBody(request, 131072);
      if (!Number.isSafeInteger(input?.revision) || input.revision < 0)
        return json({ error: "Invalid library revision." }, 400);
      let data;
      try {
        data = librarySnapshot(input.data);
      } catch (e) {
        return json({ error: e.message }, 400);
      }
      const row =
        input.revision === 0
          ? await env.DB.prepare(
              "INSERT OR IGNORE INTO libraries(owner_hash,data) VALUES(?,?) RETURNING revision",
            )
              .bind(owner, JSON.stringify(data))
              .first()
          : await env.DB.prepare(
              "UPDATE libraries SET data = ?, revision = revision + 1 WHERE owner_hash = ? AND revision = ? RETURNING revision",
            )
              .bind(JSON.stringify(data), owner, input.revision)
              .first();
      return row
        ? json(row)
        : json(
            {
              error:
                "Your library changed on another device. Reload the cloud copy before saving again.",
            },
            409,
          );
    }
  }
  if (path === "/account/profile") {
    if (request.method === "GET")
      return json({
        profile: await env.DB.prepare(
          "SELECT handle,name,bio FROM profiles WHERE owner_hash = ?",
        )
          .bind(owner)
          .first(),
      });
    if (request.method === "POST") {
      const input = await readBody(request),
        handle = text(input?.handle, 25).toLowerCase(),
        name = text(input?.name, 80),
        bio = text(input?.bio, 300);
      if (!/^[a-z0-9][a-z0-9-]{2,23}$/.test(handle) || !name)
        return json(
          {
            error:
              "Choose a name and a 3–24 character handle using letters, numbers or hyphens.",
          },
          400,
        );
      try {
        await env.DB.prepare(
          "INSERT INTO profiles(owner_hash,handle,name,bio) VALUES(?,?,?,?) ON CONFLICT(owner_hash) DO UPDATE SET handle=excluded.handle,name=excluded.name,bio=excluded.bio",
        )
          .bind(owner, handle, name, bio)
          .run();
      } catch (e) {
        if (String(e.message).includes("UNIQUE"))
          return json({ error: "That handle is already taken." }, 409);
        throw e;
      }
      return json({ profile: { handle, name, bio } });
    }
  }
  if (path === "/account/claim" && request.method === "POST") {
    const input = await readBody(request);
    if (!/^[a-f0-9]{64}$/.test(input?.guestKey || ""))
      return json({ error: "Invalid browser library key." }, 400);
    const guest = await digest(input.guestKey);
    const counts = await env.DB.prepare(
      "SELECT COUNT(*) AS total FROM links WHERE owner_hash IN (?,?)",
    )
      .bind(owner, guest)
      .first();
    if (counts.total > 200)
      return json(
        { error: "Import would exceed the 200-link account limit." },
        409,
      );
    const result = await env.DB.prepare(
      "UPDATE links SET owner_hash = ? WHERE owner_hash = ? AND (SELECT COUNT(*) FROM links WHERE owner_hash IN (?,?)) <= 200",
    )
      .bind(owner, guest, owner, guest)
      .run();
    return json({ imported: result.meta.changes });
  }
  return json({ error: "Not found." }, 404);
}
