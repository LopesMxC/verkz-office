"""Transcrição (NVIDIA Riva/Parakeet) para o VERKZ Office.
POST /transcribe  (corpo = áudio, qualquer formato que o ffmpeg leia)
  -> {"segments":[{"start":0,"end":40,"text":"..."}], "secs": N}
GET /health
Chave em NVIDIA_API_KEY (variável de ambiente, nunca no código)."""
import json, os, subprocess, tempfile, time, glob
from concurrent.futures import ThreadPoolExecutor
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import riva.client

FUNC = os.environ.get("NVIDIA_ASR_FUNCTION", "71203149-d3b7-4460-8231-1be2543a1fca")
KEY = os.environ.get("NVIDIA_API_KEY", "").strip()
LANG = os.environ.get("ASR_LANG", "pt-BR")
SEG = int(os.environ.get("ASR_SEG", "40"))
PAR = int(os.environ.get("ASR_PARALLEL", "3"))

def recognize(wav: bytes) -> str:
    last = None
    for i in range(4):
        try:
            auth = riva.client.Auth(None, True, "grpc.nvcf.nvidia.com:443", [["function-id", FUNC], ["authorization", "Bearer " + KEY]])
            cfg = riva.client.RecognitionConfig(language_code=LANG, max_alternatives=1, enable_automatic_punctuation=True, audio_channel_count=1)
            r = riva.client.ASRService(auth).offline_recognize(wav, cfg)
            return " ".join(a.alternatives[0].transcript.strip() for a in r.results if a.alternatives).strip()
        except Exception as e:  # limite de uso, rede...
            last = e
            time.sleep(2 * (i + 1))
    raise RuntimeError(str(last)[:300])

def transcribe(data: bytes):
    with tempfile.TemporaryDirectory() as d:
        src = os.path.join(d, "in.bin")
        open(src, "wb").write(data)
        p = subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", src, "-vn", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le",
                            "-f", "segment", "-segment_time", str(SEG), os.path.join(d, "c%05d.wav")], capture_output=True)
        if p.returncode:
            raise RuntimeError("ffmpeg: " + p.stderr.decode()[:200])
        files = sorted(glob.glob(os.path.join(d, "c*.wav")))
        with ThreadPoolExecutor(PAR) as ex:
            texts = list(ex.map(lambda f: recognize(open(f, "rb").read()), files))
    return [{"start": i * SEG, "end": (i + 1) * SEG, "text": t} for i, t in enumerate(texts) if t]

class H(BaseHTTPRequestHandler):
    def _j(self, code, obj):
        b = json.dumps(obj, ensure_ascii=False).encode()
        self.send_response(code); self.send_header("content-type", "application/json"); self.send_header("content-length", str(len(b))); self.end_headers(); self.wfile.write(b)
    def do_GET(self):
        self._j(200, {"ok": bool(KEY)})
    def do_POST(self):
        if not KEY:
            return self._j(500, {"error": "NVIDIA_API_KEY não configurada"})
        try:
            n = int(self.headers.get("content-length", "0"))
            data = self.rfile.read(n)
            segs = transcribe(data)
            self._j(200, {"segments": segs, "secs": len(segs) * SEG})
        except Exception as e:
            self._j(502, {"error": str(e)[:300]})
    def log_message(self, *a): pass

if __name__ == "__main__":
    ThreadingHTTPServer(("0.0.0.0", int(os.environ.get("PORT", "8090"))), H).serve_forever()
