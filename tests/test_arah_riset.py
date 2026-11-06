"""Tes Arah Riset tanpa jaringan dan tanpa API key:  python tests/test_arah_riset.py"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import arah_riset  # noqa: E402
from app import app  # noqa: E402

ok = fail = 0


def check(cond, msg):
    global ok, fail
    if cond:
        ok += 1
    else:
        fail += 1
        print("GAGAL:", msg)


e = arah_riset.Engine()
check(len(e.t) > 1000, "jumlah tesis wajar")

# opsi tiap layer: jumlah > 0 dan terurut menurun
for layer, _ in arah_riset.LAYERS:
    opts, n = e.options(layer, {})
    check(n == len(e.t), f"{layer}: n tanpa filter = total")
    check(all(c > 0 for _, c in opts), f"{layer}: hitungan positif")
    check([c for _, c in opts] == sorted((c for _, c in opts), reverse=True), f"{layer}: terurut")

# filter mengecil, bukan membesar
check(len(e.filtered({"kk": "sistem_manufaktur"})) < len(e.t), "filter KK mengecil")

# generator: kutip lurus, batas operator ScienceDirect, tanpa backslash
for sel in [{"masalah": "penjadwalan & sequencing", "kelompok_metode": "metaheuristik"},
            {"masalah": "adopsi teknologi & perilaku pengguna", "sektor": "UMKM/IKM", "metode": "SEM"},
            {"masalah": "routing & distribusi", "sektor": "transportasi & logistik", "kelompok_metode": "simulasi",
             "metode": "simulation", "pendekatan": "optimasi"}]:
    out = e.generate(sel)
    check(out["operator_sciencedirect"] <= 8, f"operator SD <= 8: {sel}")
    check("\\" not in out["query_sciencedirect"] + out["query_scopus"], "tanpa backslash")
    check(out["query_scopus"].startswith("TITLE-ABS-KEY("), "format Scopus")
    check(" & " not in out["research_question"], "RQ tanpa '&'")
    check(len(out["inklusi"]) >= 3 and len(out["eksklusi"]) >= 3, "kriteria terisi")

# masukan kosong ditolak; kata kunci tambahan saja cukup
try:
    e.generate({"kk": "sistem_manufaktur"})
    check(False, "tanpa masalah/sektor/metode harus ditolak")
except ValueError:
    check(True, "ditolak")
check('"cold chain"' in e.generate({"masalah": "lainnya"}, extra_en_terms=["cold chain"])["query_sciencedirect"], "kata kunci tambahan")

# route
c = app.test_client()
check(c.get("/api/arah-riset/meta").get_json()["total"] == len(e.t), "meta total")
check(c.post("/api/arah-riset/options", json={"layer": "nope"}).status_code == 400, "layer tak dikenal = 400")
check(c.post("/api/arah-riset/generate", json={"selected": {"kk": "sistem_manufaktur"}}).status_code == 400, "generate tanpa isi = 400")
r = c.post("/api/arah-riset/generate", json={"selected": {"masalah": "pengukuran kinerja", "bukan_layer": "x"}, "extra": "a, b"})
check(r.status_code == 200 and "bukan_layer" not in r.get_json()["pemilihan"], "layer asing dibuang")

print(f"{ok} lolos, {fail} gagal")
sys.exit(1 if fail else 0)
