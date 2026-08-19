export default async function handler(req, res) {
  const backend = process.env.TB_BACKEND;
  if (!backend) {
    return res.status(500).json({ error: "TB_BACKEND environment variable is not set on Vercel" });
  }

  const rest = (req.query.path || []).join("/");
  const query = (req.url || "").includes("?") ? "?" + (req.url || "").split("?")[1] : "";
  const target = `${backend}/api/${rest}${query}`;

  const headers = { "content-type": "application/json" };
  if (req.headers.authorization) headers.authorization = req.headers.authorization;

  let upstream;
  try {
    upstream = await fetch(target, {
      method: req.method,
      headers,
      body: ["GET", "HEAD"].includes(req.method) ? undefined : JSON.stringify(req.body || {}),
    });
  } catch {
    return res.status(502).json({ error: "Taskboard API is unreachable" });
  }

  const text = await upstream.text();
  res.status(upstream.status);
  res.setHeader("content-type", upstream.headers.get("content-type") || "application/json");
  res.send(text);
}