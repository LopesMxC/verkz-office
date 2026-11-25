// Banco de imagens para quadros com foto (PRÉVIA). Não é importado pelo app até a aprovação.
export type Provider = "openverse" | "wikimedia" | "unsplash" | "pexels" | "pixabay";
export interface Hit { id: string; thumb: string; full: string; w: number; h: number; author: string; source: Provider; page?: string }
export interface Picked { dataUrl: string; aspect: number; credit: string }

export const PROVIDERS: { id: Provider; name: string; key: boolean }[] = [
  { id: "openverse", name: "Openverse", key: false },
  { id: "wikimedia", name: "Wikimedia Commons", key: false },
  { id: "unsplash", name: "Unsplash", key: true },
  { id: "pexels", name: "Pexels", key: true },
  { id: "pixabay", name: "Pixabay", key: true },
];
const KEYS = "verkz.imgkeys";
export const getKeys = (): Record<string, string> => { try { return JSON.parse(localStorage.getItem(KEYS) || "{}"); } catch { return {}; } };
export const setKey = (p: Provider, v: string) => { const k = getKeys(); k[p] = v.trim(); try { localStorage.setItem(KEYS, JSON.stringify(k)); } catch { /* sem storage */ } };

export async function search(p: Provider, q: string, page = 1): Promise<Hit[]> {
  const k = getKeys()[p];
  const enc = encodeURIComponent(q);
  if (p === "openverse") {
    const j = await (await fetch(`https://api.openverse.org/v1/images/?q=${enc}&page=${page}&page_size=24&mature=false`)).json();
    return (j.results ?? []).map((r: any) => ({ id: "ov" + r.id, thumb: r.thumbnail || r.url, full: r.url, w: r.width || 1200, h: r.height || 800, author: r.creator || "", source: p, page: r.foreign_landing_url }));
  }
  if (p === "wikimedia") {
    const u = `https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*&generator=search&gsrnamespace=6&gsrlimit=24&gsroffset=${(page - 1) * 24}&gsrsearch=${enc}%20filetype:bitmap&prop=imageinfo&iiprop=url|size|extmetadata&iiurlwidth=1000`;
    const j = await (await fetch(u)).json();
    return Object.values(j.query?.pages ?? {}).map((r: any) => { const i = r.imageinfo?.[0]; return i && { id: "wm" + r.pageid, thumb: i.thumburl, full: i.thumburl, w: i.thumbwidth || i.width, h: i.thumbheight || i.height, author: (i.extmetadata?.Artist?.value || "").replace(/<[^>]+>/g, ""), source: p, page: i.descriptionurl }; }).filter(Boolean) as Hit[];
  }
  if (!k) throw new Error("Informe a chave de API de " + p);
  if (p === "unsplash") {
    const j = await (await fetch(`https://api.unsplash.com/search/photos?query=${enc}&page=${page}&per_page=24`, { headers: { Authorization: "Client-ID " + k } })).json();
    return (j.results ?? []).map((r: any) => ({ id: "us" + r.id, thumb: r.urls.small, full: r.urls.regular, w: r.width, h: r.height, author: r.user?.name || "", source: p, page: r.links?.html }));
  }
  if (p === "pexels") {
    const j = await (await fetch(`https://api.pexels.com/v1/search?query=${enc}&page=${page}&per_page=24`, { headers: { Authorization: k } })).json();
    return (j.photos ?? []).map((r: any) => ({ id: "px" + r.id, thumb: r.src.medium, full: r.src.large, w: r.width, h: r.height, author: r.photographer || "", source: p, page: r.url }));
  }
  const j = await (await fetch(`https://pixabay.com/api/?key=${k}&q=${enc}&page=${page}&per_page=24&image_type=photo&safesearch=true`)).json();
  return (j.hits ?? []).map((r: any) => ({ id: "pb" + r.id, thumb: r.webformatURL, full: r.largeImageURL || r.webformatURL, w: r.imageWidth, h: r.imageHeight, author: r.user || "", source: p, page: r.pageURL }));
}

/** Baixa e reduz para caber no layout (limite de 1,9 MB no JSON inteiro). */
export async function fetchAsDataUrl(h: Hit, max = 900): Promise<Picked> {
  const blob = await (await fetch(h.full, { mode: "cors" })).blob();
  const bmp = await createImageBitmap(blob);
  const s = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const cv = document.createElement("canvas"); cv.width = Math.round(bmp.width * s); cv.height = Math.round(bmp.height * s);
  const g = cv.getContext("2d")!; g.fillStyle = "#fff"; g.fillRect(0, 0, cv.width, cv.height); g.drawImage(bmp, 0, 0, cv.width, cv.height);
  // o escritório inteiro vai numa mensagem só: cada imagem fica pequena (até ~70 KB)
  let q = 0.82; let out = cv.toDataURL("image/jpeg", q);
  while (out.length > 70_000 && q > 0.4) out = cv.toDataURL("image/jpeg", (q -= 0.12));
  return { dataUrl: out, aspect: cv.width / cv.height, credit: `${h.author} · ${h.source}`.replace(/^ · /, "") };
}

const IC = {
  search: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg>',
  close: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  key: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M16 7l3 3"/></svg>',
};
const CSS = `.ib{position:fixed;inset:0;background:rgba(10,12,18,.72);display:flex;align-items:center;justify-content:center;z-index:9999;font-family:Inter,system-ui,sans-serif}
.ib-m{width:min(860px,94vw);height:min(620px,90vh);background:#1d2029;border:1px solid #343a4c;border-radius:14px;display:flex;flex-direction:column;color:#e6e8ee;overflow:hidden}
.ib-h{display:flex;gap:8px;align-items:center;padding:12px 14px;border-bottom:1px solid #2c3140}
.ib-h b{font-size:14px;margin-right:auto}.ib button,.ib select,.ib input{background:#262a37;color:#e6e8ee;border:1px solid #343a4c;border-radius:8px;padding:7px 10px;font:inherit;font-size:13px}
.ib button{cursor:pointer;display:inline-flex;align-items:center;gap:6px}.ib button:hover{border-color:#c8f501}.ib .pri{background:#c8f501;color:#14161c;border-color:#c8f501;font-weight:600}
.ib-s{display:flex;gap:8px;padding:10px 14px}.ib-s input{flex:1}
.ib-g{flex:1;overflow:auto;padding:0 14px 14px;display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px;align-content:start}
.ib-c{position:relative;border-radius:10px;overflow:hidden;cursor:pointer;border:2px solid transparent;background:#262a37;aspect-ratio:4/3}
.ib-c:hover,.ib-c.sel{border-color:#c8f501}.ib-c img{width:100%;height:100%;object-fit:cover;display:block}
.ib-c span{position:absolute;left:0;right:0;bottom:0;padding:14px 8px 5px;font-size:10px;background:linear-gradient(transparent,rgba(0,0,0,.75));color:#dfe3ee;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ib-f{display:flex;align-items:center;gap:8px;padding:10px 14px;border-top:1px solid #2c3140;font-size:12px;color:#8e93a3}
.ib-e{grid-column:1/-1;text-align:center;color:#8e93a3;padding:40px 0;font-size:13px}`;

/** Abre o seletor. Resolve com a imagem escolhida (já reduzida) ou null. */
export function openImageBank(opts: { query?: string; max?: number } = {}): Promise<Picked | null> {
  return new Promise((res) => {
    if (!document.getElementById("ib-css")) { const s = document.createElement("style"); s.id = "ib-css"; s.textContent = CSS; document.head.appendChild(s); }
    const root = document.createElement("div"); root.className = "ib";
    root.innerHTML = `<div class="ib-m"><div class="ib-h"><b>Banco de imagens</b><select id="ib-p">${PROVIDERS.map((p) => `<option value="${p.id}">${p.name}</option>`).join("")}</select><button id="ib-k" title="Chave de API">${IC.key}Chave</button><button id="ib-x" title="Fechar">${IC.close}</button></div>
<div class="ib-s"><input id="ib-q" placeholder="Buscar imagens (ex.: montanhas, escritório, cidade)" value="${opts.query ?? ""}"><button class="pri" id="ib-go">${IC.search}Buscar</button></div><div class="ib-g" id="ib-g"><div class="ib-e">Digite um termo e busque.</div></div>
<div class="ib-f"><span id="ib-i">Fontes com licença livre. O crédito fica salvo no quadro.</span><span style="flex:1"></span><button class="pri" id="ib-ok" disabled>Usar imagem</button></div></div>`;
    document.body.appendChild(root);
    const $ = <T extends HTMLElement>(id: string) => root.querySelector("#" + id) as T;
    let sel: Hit | null = null;
    const done = (v: Picked | null) => { root.remove(); res(v); };
    $("ib-x").onclick = () => done(null);
    root.addEventListener("mousedown", (e) => { if (e.target === root) done(null); });
    $("ib-k").onclick = () => { const p = $<HTMLSelectElement>("ib-p").value as Provider; if (!PROVIDERS.find((x) => x.id === p)!.key) { $("ib-i").textContent = "Esta fonte não precisa de chave."; return; } const v = prompt("Chave de API de " + p, getKeys()[p] ?? ""); if (v !== null) setKey(p, v); };
    const go = async () => {
      const g = $("ib-g"); const q = $<HTMLInputElement>("ib-q").value.trim(); if (!q) return;
      g.innerHTML = '<div class="ib-e">Buscando…</div>'; sel = null; $<HTMLButtonElement>("ib-ok").disabled = true;
      try {
        const hits = await search($<HTMLSelectElement>("ib-p").value as Provider, q);
        g.innerHTML = hits.length ? "" : '<div class="ib-e">Nada encontrado.</div>';
        for (const h of hits) { const d = document.createElement("div"); d.className = "ib-c"; d.innerHTML = `<img loading="lazy" src="${h.thumb}" alt=""><span>${h.author || h.source}</span>`; d.onclick = () => { g.querySelectorAll(".ib-c").forEach((x) => x.classList.remove("sel")); d.classList.add("sel"); sel = h; $<HTMLButtonElement>("ib-ok").disabled = false; }; g.appendChild(d); }
      } catch (e) { g.innerHTML = `<div class="ib-e">${(e as Error).message || "Falha na busca"}</div>`; }
    };
    $("ib-go").onclick = go; $("ib-q").addEventListener("keydown", (e) => { if ((e as KeyboardEvent).key === "Enter") go(); });
    $("ib-ok").onclick = async () => { if (!sel) return; $("ib-i").textContent = "Baixando…"; try { done(await fetchAsDataUrl(sel, opts.max ?? 560)); } catch { $("ib-i").textContent = "Esta imagem bloqueou o download. Escolha outra."; } };
  });
}
