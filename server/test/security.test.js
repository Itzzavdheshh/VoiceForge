import test from "node:test";
import assert from "node:assert";
import http from "node:http";

// Need to set NODE_ENV=test so the server doesn't auto-listen
process.env.NODE_ENV = "test";
const { default: app } = await import("../index.js");

function makeRequest(path, method = "GET") {
  return new Promise((resolve, reject) => {
    const server = http.createServer(app);
    server.listen(0, () => {
      const port = server.address().port;
      const req = http.request(
        {
          hostname: "localhost",
          port,
          path,
          method,
        },
        (res) => {
          let data = "";
          res.on("data", (chunk) => (data += chunk));
          res.on("end", () => {
            server.close();
            resolve({ res, data });
          });
        }
      );
      req.on("error", (err) => {
        server.close();
        reject(err);
      });
      req.end();
    });
  });
}

test("Security Headers (Integration) - Development environment", async () => {
  const { res } = await makeRequest("/api/health");
  
  assert.strictEqual(res.statusCode, 200);

  // Helmet sets this
  assert.strictEqual(res.headers["cross-origin-opener-policy"], "same-origin");
  assert.strictEqual(res.headers["cross-origin-embedder-policy"], "require-corp");
  
  // Custom permissions policy
  assert.strictEqual(
    res.headers["permissions-policy"],
    "camera=(), microphone=(self), geolocation=(), interest-cohort=()"
  );

  // Content-Security-Policy
  const csp = res.headers["content-security-policy"];
  assert.ok(csp.includes("default-src 'self'"));
  assert.ok(csp.includes("worker-src 'self' blob:"));
  assert.ok(csp.includes("script-src 'self' 'unsafe-inline' 'unsafe-eval'")); // development has unsafe-inline
});
