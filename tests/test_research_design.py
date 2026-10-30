"""Tes untuk perbaikan v2: pembacaan PDF, verifikasi kutipan, validasi research_design,
taksonomi desain riset, dan finalisasi hierarki.

Jalankan dari folder project:   python tests/test_research_design.py
Tanpa pytest, tanpa jaringan, tanpa memakai API key (key dummy dipasang di bawah).
Bagian yang butuh PDF memakai folder data/pdfs (atau SLR_PDF_DIR) dan dilewati bila PDF tidak ada.
"""
import glob
import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
os.environ["LLM_PROVIDER"] = "deepseek"          # batas teks 80.000 seperti produksi
os.environ["DEEPSEEK_API_KEY"] = "dummy-untuk-tes"  # tidak pernah dipakai: tes tidak memanggil AI

import warnings
warnings.filterwarnings("ignore")
import app  # noqa: E402

PASSED = []


def check(name, condition, detail=""):
    assert condition, f"GAGAL: {name} {detail}"
    PASSED.append(name)
    print(f"  ok  {name}")


def find_pdf(record_id):
    for folder in filter(None, [os.getenv("SLR_PDF_DIR"), str(ROOT / "data" / "pdfs")]):
        hits = glob.glob(os.path.join(folder, f"{record_id}*.pdf"))
        if hits:
            return hits[0]
    return None


print("1. Normalisasi dan verifikasi kutipan")
src = "Kami menilai (SNGP) [59,60] offers distance-\naware uncertainty quantification capability, ok."
pn = [(3, app.match_norm(src))]
fn = pn[0][1]
check("kutipan benar dengan hyphenation + penanda sitasi", app.verify_quote("SNGP offers distance-aware uncertainty quantification", pn, fn) == (True, 3))
check("kutipan karangan ditolak", app.verify_quote("SNGP guarantees perfect calibration everywhere", pn, fn)[0] is False)
check("kutipan terlalu pendek ditolak", app.verify_quote("ok", pn, fn)[0] is False)
check("kutipan dengan elipsis diterima bila tiap potongan ada",
      app.verify_quote("Kami menilai (SNGP) ... quantification capability", pn, fn)[0] is True)

print("2. Pembuangan daftar pustaka dan pemotongan teks")
body = "Isi artikel. " * 400
text = body + "\nReferences\n[1] Penulis A. Judul. 2020.\n" * 1
cut, removed = app.strip_references(text)
check("daftar pustaka dibuang", removed and "Penulis A" not in cut)
check("kata 'References' di awal dokumen diabaikan", app.strip_references("References\n" + body)[1] is False)
long_text = "AWAL " + "x" * 5000 + " TENGAH " + "y" * 5000 + " KESIMPULAN-AKHIR"
trimmed, was = app.trim_text(long_text, 3000)
check("teks panjang dipotong ke batas", was and len(trimmed) <= 3000 + 10)
check("bagian akhir dokumen ikut terjaga", trimmed.endswith("KESIMPULAN-AKHIR") and trimmed.startswith("AWAL"))
check("penanda pemotongan ada", "bagian tengah dipotong" in trimmed)
check("teks pendek tidak diubah", app.trim_text("pendek", 3000) == ("pendek", False))

print("3. Validasi research_design")
raw = json.load(open(Path(__file__).parent / "fixtures_research_design.json", encoding="utf-8"))
fake_page = [(1, app.match_norm("we present a Singapore-based case study to evaluate the operational implications"))]
d = app.normalise_research_design(
    {"philosophy": {"value": "positivism", "basis": "stated", "evidence": "kutipan yang tidak ada"},
     "strategy": {"value": ["case_study", "numerical_experiment", "Case Study"], "basis": "stated",
                  "evidence": "we present a Singapore-based case study to evaluate"},
     "approach": "deductive", "time_horizon": {"value": "tidak ada", "basis": "stated", "evidence": ""}},
    fake_page, fake_page[0][1])
check("'stated' tanpa bukti diturunkan ke 'inferred'", d["philosophy"]["basis"] == "inferred")
check("kode di luar codebook dibuang + ada peringatan", d["strategy"]["value"] == ["case_study"] and any("numerical_experiment" in w for w in d["warnings"]))
check("'stated' dengan kutipan nyata dipertahankan", d["strategy"]["basis"] == "stated" and d["strategy"]["evidence_verified"])
check("nilai polos (tanpa objek) diterima sebagai inferred", d["approach"]["value"] == "deductive" and d["approach"]["basis"] == "inferred")
check("nilai tidak valid pada field tunggal menjadi not_stated", d["time_horizon"]["value"] == "not_stated")
check("field yang tidak dikirim menjadi not_stated", d["data_source"]["value"] == [] and d["data_source"]["basis"] == "not_stated")
check("codebook_version tercatat", d["codebook_version"] == app.CODEBOOK_VERSION)

print("4. Prompt konsisten dengan codebook")
prompt = app.article_prompt("x.pdf", 3, "teks", "RQ", "inc", "exc")
for key in ["experiment_modeling_simulation", "mono_quantitative", "synthetic_simulated", "positivism"]:
    check(f"prompt ekstraksi memuat kode {key}", key in prompt)
check("prompt ekstraksi memuat aturan pemotongan teks", "bagian tengah dipotong" in prompt)
final = app.final_synthesis_prompt([], [], "RQ", "inc", "exc") if "final_synthesis_prompt" in dir(app) else ""
check("prompt sintesis akhir tidak lagi meminta taxonomy", '"taxonomy"' not in final and final != "")
tprompt = app.taxonomy_only_prompt([{"id": "a"}], [], [], "RQ")
check("prompt taksonomi meminta 3 level + prinsip per level", "TIGA level" in tprompt and "PRINSIP" in tprompt)

print("5. Taksonomi desain riset (dihitung kode)")
articles, have_pdfs = [], True
for rid, raw_design in raw.items():
    if rid.startswith("_"):
        continue
    pdf = find_pdf(rid)
    if pdf:
        _, _, info = app.read_pdf(open(pdf, "rb").read())
        pns = [(n, app.match_norm(t)) for n, t in info["page_texts"]]
        fns = "".join(p for _, p in pns)
    else:
        have_pdfs, pns, fns = False, [], ""
    articles.append({"id": rid, "title": rid[:6], "research_design": app.normalise_research_design(raw_design, pns, fns)})
if have_pdfs:
    by = {a["id"]: a["research_design"] for a in articles}
    check("[PDF nyata] kutipan 'stated' yang benar terverifikasi", by["cf05cda816f84a7b"]["strategy"]["basis"] == "stated")
    check("[PDF nyata] kutipan 'stated' palsu diturunkan", by["c25ce2d9937e00bc"]["philosophy"]["basis"] == "inferred")
    check("[PDF nyata] kode di luar codebook dibuang", "numerical_experiment" not in by["c25ce2d9937e00bc"]["strategy"]["value"])
else:
    print("  --  PDF tidak ditemukan: pengecekan bukti nyata dilewati")

tx = app.build_design_taxonomy(articles + [{"id": "lama1", "title": "tanpa desain"}], topic="Predict-then-Optimize")
tree = {n["id"]: n for n in tx["tree"]["children"]}
check("artikel tanpa research_design dilaporkan, tidak crash", tx["missing_ids"] == ["lama1"] and tx["n_with_design"] == 5)
check("akar memakai nama topik", tx["tree"]["name"] == "Predict-then-Optimize")
check("empat cabang tingkat satu", list(tree) == ["metodologi", "strategi", "teknik", "fondasi"])
quan = next(c for c in tree["metodologi"]["children"] if c["id"] == "m-quantitative")
qual = next(c for c in tree["metodologi"]["children"] if c["id"] == "m-qualitative")
check("cabang Kuantitatif berisi 5 artikel", quan["count"] == 5)
check("cabang Kualitatif tetap tampil walau kosong (gap terlihat)", qual["count"] == 0 and qual["children"] == [])
strat = {c["id"]: c for c in tree["strategi"]["children"]}
check("Modeling & Simulation dipakai 5 artikel", strat["s-experiment_modeling_simulation"]["count"] == 5)
check("Case study hanya 1 artikel", strat["s-case_study"]["count"] == 1)
check("Survey tetap tampil dengan hitungan 0", strat["s-survey"]["count"] == 0)
check("induk = gabungan unik anak, bukan penjumlahan", tree["strategi"]["count"] == 5)
tech_names = [t["name"] for t in quan["children"]]
check("teknik yang sama di dua artikel digabung (Random Forest = 2)", next(t for t in quan["children"] if t["name"] == "Random Forest")["count"] == 2)
check("teknik diurutkan dari yang paling sering", quan["children"][0]["count"] >= quan["children"][-1]["count"])
cols = [c["key"] for c in tx["matrix"]["columns"]]
row_quan = next(r for r in tx["matrix"]["rows"] if r["id"] == "quantitative")
check("matriks memuat strategi inti", all(k in cols for k in app.CORE_STRATEGIES))
check("sel Kuantitatif x Case study = 1", len(row_quan["cells"]["case_study"]) == 1)
check("sel Kualitatif x Survey kosong = kandidat gap", next(r for r in tx["matrix"]["rows"] if r["id"] == "qualitative")["cells"]["survey"] == [])
check("ringkasan basis dihitung per field", tx["basis_summary"]["philosophy"]["not_stated"] >= 3)

only_unknown = app.build_design_taxonomy([{"id": "z", "title": "z", "research_design": app.normalise_research_design({}, [], "")}])
ns = next(c for c in {n["id"]: n for n in only_unknown["tree"]["children"]}["metodologi"]["children"] if c["id"] == "m-not_stated")
check("artikel tanpa label masuk cabang 'Tidak dinyatakan'", ns["count"] == 1)
check("korpus kosong tidak crash", app.build_design_taxonomy([])["n_with_design"] == 0)

print("6. Finalisasi hierarki taksonomi topik")
messy = {"hierarchical": {"root": {"id": "root", "name": "R"}, "nodes": [
    {"id": "a", "name": "A", "parent_id": "root", "article_ids": []},
    {"id": "a1", "name": "A1", "parent_id": "a", "article_ids": ["x1", "palsu"]},
    {"id": "a2", "name": "A2", "parent_id": "a", "article_ids": ["x2"]},
    {"id": "b", "name": "B", "parent_id": "tidak-ada", "article_ids": ["x3"]},
    {"id": "a1", "name": "duplikat id", "parent_id": "b", "article_ids": []},
    {"id": "c", "name": "C", "parent_id": "d", "article_ids": []},
    {"id": "d", "name": "D", "parent_id": "c", "article_ids": []},
]}}
fixed, cov = app.finalize_hierarchy(messy, {"x1", "x2", "x3", "x4"})
nodes = {n["id"]: n for n in fixed["hierarchical"]["nodes"]}
check("parent tidak ada dikembalikan ke root", nodes["b"]["parent_id"] == "root")
check("id duplikat diperbaiki", len(nodes) == 7)
check("siklus diputus (semua node terjangkau dari root)", all(n["level"] >= 1 for n in nodes.values()))
check("roll-up: induk = gabungan anak", set(nodes["a"]["article_ids"]) == {"x1", "x2"})
check("ID artikel yang tidak ada di korpus dibuang", "palsu" not in nodes["a1"]["article_ids"])
check("cakupan dihitung (3 dari 4 artikel)", cov["covered"] == 3 and cov["uncovered_ids"] == ["x4"])
check("hierarki kosong tidak crash", app.finalize_hierarchy({}, {"x1"})[1]["covered"] == 0)

print(f"\nSEMUA LULUS: {len(PASSED)} pengecekan")
