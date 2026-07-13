const fs = require("node:fs/promises");
const path = require("node:path");

async function loadSourceModule(relativePath, replacements = []) {
  const absolutePath = path.resolve(__dirname, "../..", relativePath);
  let source = await fs.readFile(absolutePath, "utf8");

  for (const [pattern, replacement] of replacements) {
    source = source.replace(pattern, replacement);
  }

  const encoded = Buffer.from(source).toString("base64");
  return await import(`data:text/javascript;base64,${encoded}#${Date.now()}-${Math.random()}`);
}

module.exports = { loadSourceModule };
