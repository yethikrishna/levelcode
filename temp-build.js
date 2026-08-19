const fs = require("fs");
const path = require("path");
const base = "c:/Users/kkvin/levelcode-project/levelcode";
function w(rel, content) {
  const p = path.join(base, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content, "utf8");
  console.log("wrote", rel);
}
