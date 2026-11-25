import fs from "fs";import zlib from "zlib";
const [,,oldf,delta,outf]=process.argv;
const old=fs.readFileSync(oldf);const d=zlib.brotliDecompressSync(fs.readFileSync(delta));
const parts=[];let p=0;
while(p<d.length){const t=d[p];if(t===67){parts.push(old.subarray(d.readUInt32LE(p+1),d.readUInt32LE(p+1)+d.readUInt32LE(p+5)));p+=9;}else{const n=d.readUInt32LE(p+1);parts.push(d.subarray(p+5,p+5+n));p+=5+n;}}
fs.writeFileSync(outf,Buffer.concat(parts));
