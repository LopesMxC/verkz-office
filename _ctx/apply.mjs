// aplica um diff unificado (só troca de blocos exatos) sem precisar de git/patch
import fs from "node:fs";
const [, , file, diffFile] = process.argv;
let src = fs.readFileSync(file, "utf8");
const lines = fs.readFileSync(diffFile, "utf8").split("\n");
let i = 0, n = 0;
while (i < lines.length) {
  if (!lines[i].startsWith("@@")) { i++; continue; }
  i++;
  const oldL = [], newL = [];
  while (i < lines.length && !lines[i].startsWith("@@")) {
    const l = lines[i];
    if (l.startsWith("\\")) { i++; continue; }
    if (l.startsWith(" ") || l === "") { oldL.push(l.slice(1)); newL.push(l.slice(1)); }
    else if (l.startsWith("-")) oldL.push(l.slice(1));
    else if (l.startsWith("+")) newL.push(l.slice(1));
    i++;
  }
  while (oldL.length && oldL[oldL.length - 1] === "" && newL[newL.length - 1] === "") { oldL.pop(); newL.pop(); }
  const o = oldL.join("\n"), nw = newL.join("\n");
  const at = src.indexOf(o);
  if (at < 0 || src.indexOf(o, at + 1) >= 0) { console.error("hunk não encaixa:", o.slice(0, 120)); process.exit(1); }
  src = src.slice(0, at) + nw + src.slice(at + o.length);
  n++;
}
fs.writeFileSync(file, src);
console.log(`${n} trechos aplicados em ${file}`);
