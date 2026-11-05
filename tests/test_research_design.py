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

print("3. Validasi research_design (v3: basis per nilai, label eksplisit wajib bukti)")
raw = json.load(open(Path(__file__).parent / "fixtures_research_design.json", encoding="utf-8"))
case_sentence = "we present a Singapore-based case study to evaluate the operational implications of charger-limited public charging"
numeric_sentence = "we perform numerical experiments using data derived from Singapore"
page = [(1, app.match_norm(case_sentence + " " + numeric_sentence))]
fnorm = page[0][1]
def norm(raw_design):
    return app.normalise_research_design(raw_design, page, fnorm)

d = norm({"philosophy": {"value": "positivism", "basis": "stated", "evidence": "kutipan yang tidak ada"},
          "strategy": {"value": ["case_study", "numerical_experiment", "Case Study"], "basis": "stated", "evidence": "we present a Singapore-based case study to evaluate"},
          "approach": "deductive", "time_horizon": {"value": "tidak ada", "basis": "stated", "evidence": ""}})
check("philosophy tebakan/kutipan palsu dibuang", d["philosophy"]["value"] == "not_stated" and any("philosophy: 'positivism'" in w for w in d["warnings"]))
check("kode di luar codebook dibuang + peringatan", d["strategy"]["value"] == ["case_study"] and any("numerical_experiment" in w for w in d["warnings"]))
check("'stated' dengan kutipan nyata dan istilah yang tepat dipertahankan", d["strategy"]["items"][0]["basis"] == "stated" and d["strategy"]["items"][0]["evidence_verified"])
check("nilai polos (tanpa objek) diterima sebagai inferred", d["approach"]["value"] == "deductive" and d["approach"]["basis"] == "inferred")
check("nilai tidak valid pada field tunggal menjadi not_stated", d["time_horizon"]["value"] == "not_stated")
check("field yang tidak dikirim menjadi not_stated", d["data_source"]["value"] == [] and d["data_source"]["basis"] == "not_stated")
check("codebook_version tercatat", d["codebook_version"] == app.CODEBOOK_VERSION)

d2 = norm({"strategy": {"values": [
    {"code": "experiment_modeling_simulation", "basis": "inferred", "evidence": ""},
    {"code": "case_study", "basis": "stated", "evidence": case_sentence}]}})
by_code = {e["code"]: e for e in d2["strategy"]["items"]}
check("basis dinilai PER NILAI pada field multi", by_code["experiment_modeling_simulation"]["basis"] == "inferred" and by_code["case_study"]["basis"] == "stated")
check("agregat field = inferred bila ada nilai yang disimpulkan", d2["strategy"]["basis"] == "inferred")

d3 = norm({"strategy": {"values": [{"code": "case_study", "basis": "stated", "evidence": numeric_sentence}]}})
check("case_study dibuang bila kutipan (walau ada di teks) tidak memuat istilahnya", d3["strategy"]["value"] == [] and any("case_study" in w and "dibuang" in w for w in d3["warnings"]))
d4 = norm({"strategy": {"values": [{"code": "case_study", "basis": "inferred", "evidence": ""}]}})
check("case_study tanpa 'stated' dibuang (tebakan tidak diterima)", d4["strategy"]["value"] == [])
d5 = norm({"strategy": {"value": ["experiment_modeling_simulation", "archival_research"], "basis": "stated", "evidence": case_sentence}})
check("bentuk lama: satu kutipan untuk dua nilai diturunkan ke inferred", all(e["basis"] == "inferred" for e in d5["strategy"]["items"]) and any("satu kutipan" in w for w in d5["warnings"]))
d6 = norm({"strategy": {"values": [{"code": "archival_research", "basis": "inferred", "evidence": ""}]}})
check("archival_research boleh disimpulkan", d6["strategy"]["value"] == ["archival_research"])

print("3b. Aturan self-reference (pemulihan label eksplisit yang terlewat AI) dan bukti not_applicable")
def design_with(strategy_items):
    return {"strategy": {"value": [e["code"] for e in strategy_items], "basis": "inferred", "items": strategy_items, "evidence": "", "evidence_verified": False}, "warnings": []}
M_S = {"code": "experiment_modeling_simulation", "basis": "inferred", "evidence": "", "evidence_verified": False}
def run_rule(sentence, items=None):
    pt = [(3, sentence)]
    pn_ = [(n, app.match_norm(x)) for n, x in pt]
    return app.apply_self_reference_rules(design_with(items if items is not None else [dict(M_S)]), pt, pn_, "".join(x for _, x in pn_))
r1 = run_rule("In this paper,\nwe present a Singapore-based case study to evaluate the operational implications.")
cs = [e for e in r1["strategy"]["items"] if e["code"] == "case_study"]
check("kalimat orang pertama 'we present a ... case study' ditambahkan", len(cs) == 1 and cs[0]["basis"] == "stated" and cs[0]["source"] == "rule" and cs[0]["page"] == 3 and cs[0]["evidence_verified"])
check("penambahan dicatat di warnings dengan halaman", any("ditambahkan oleh aturan" in w and "hal. 3" in w for w in r1["warnings"]))
check("agregat tetap inferred (M&S masih disimpulkan)", r1["strategy"]["basis"] == "inferred")
for label, sentence in [("kalimat pustaka (kasus Ontario)", "As such, case studies from Canada and similar climates to Ontario are the most relevant for this research."),
                        ("judul bagian (kasus Struktur)", "4. Case studies 4.1. Example 1: Six-story nonlinear inelastic shear building"),
                        ("tinjauan pustaka orang pertama", "We review several case studies reported in the literature."),
                        ("karya orang lain", "Previous work presented a case study of a port."),
                        ("'we use' dari pustaka", "We use case studies from the literature to motivate the problem.")]:
    check(f"tidak cocok: {label}", all(e["code"] != "case_study" for e in run_rule(sentence)["strategy"]["items"]))
r2 = run_rule("We conduct a case study of a hospital in Bandung.", items=[])
check("strategi kosong dari AI tetap bisa dipulihkan", r2["strategy"]["value"] == ["case_study"] and r2["strategy"]["basis"] == "stated")
already = [dict(M_S), {"code": "case_study", "basis": "stated", "evidence": "x", "evidence_verified": True}]
check("tidak menggandakan bila AI sudah mengusulkan case_study", [e["code"] for e in run_rule("we present a case study of X in Y.", items=already)["strategy"]["items"]].count("case_study") == 1)
d_na = norm({"time_horizon": {"value": "not_applicable", "basis": "stated", "evidence": numeric_sentence}})
check("not_applicable: bukti dikosongkan dan basis inferred", d_na["time_horizon"]["evidence"] == "" and d_na["time_horizon"]["basis"] == "inferred" and not d_na["time_horizon"]["evidence_verified"])
d_lg = norm({"time_horizon": {"value": "longitudinal", "basis": "stated", "evidence": numeric_sentence}})
check("longitudinal tetap boleh membawa bukti", d_lg["time_horizon"]["evidence"] != "")
cb = app.app.test_client().get("/api/codebook").get_json()
check("endpoint codebook memuat explicit_terms + analysis_version", "case_study" in cb["explicit_terms"]["strategy"] and "positivism" in cb["explicit_terms"]["philosophy"] and cb["analysis_version"] == app.ANALYSIS_VERSION)
check("ANALYSIS_VERSION sudah dinaikkan (>= 4)", app.ANALYSIS_VERSION >= 4)
found_real, any_pdf = {}, False
for rid in [k for k in raw if not k.startswith("_")]:
    pdf = find_pdf(rid)
    if not pdf:
        continue
    any_pdf = True
    _, _, info_ = app.read_pdf(open(pdf, "rb").read())
    pn_ = [(n, app.match_norm(x)) for n, x in info_["page_texts"]]
    out_ = app.apply_self_reference_rules(design_with([dict(M_S)]), info_["page_texts"], pn_, "".join(x for _, x in pn_))
    found_real[rid[:4]] = [e.get("page") for e in out_["strategy"]["items"] if e["code"] == "case_study"]
if any_pdf:
    check("[PDF nyata] aturan hanya menambah case_study pada artikel Singapura (hal. 3)", found_real == {"a7b7": [], "be0c": [], "c25c": [], "cf05": [3], "f0b9": []}, str(found_real))
else:
    print("  --  PDF tidak ditemukan: uji aturan pada PDF nyata dilewati")

print("3c. Gerbang istilah kutipan (synthetic_simulated)")
def ds_design(items):
    return {"data_source": {"value": [e["code"] for e in items], "basis": "inferred", "items": items, "evidence": "", "evidence_verified": False}, "warnings": []}
def ds(code, ev, basis="inferred"):
    return {"code": code, "basis": basis, "evidence": ev, "evidence_verified": bool(ev)}
g1 = app.apply_evidence_gates(ds_design([ds("secondary", "We utilize three publicly available datasets covering daily data from 2004 to 2021", "stated"),
        ds("synthetic_simulated", "we discretize the possible realizations of PM2.5 levels using the sample average approximation method")]))
check("sintetis dengan kutipan SAA (kasus PM2.5) dibuang", g1["data_source"]["value"] == ["secondary"] and any("synthetic_simulated" in w and "dibuang" in w for w in g1["warnings"]))
check("agregat basis dihitung ulang setelah pembuangan", g1["data_source"]["basis"] == "stated")
for label, ev in [("simulate", "we simulate the background occupancy at each discrete time step"), ("generated", "generated through the spectral representation method"),
                  ("synthesized+generative", "we synthesized 10,000 unique student profiles using a Gaussian Copula generative model"),
                  ("synthetic", "we generated a synthetic dataset to emulate the system")]:
    check(f"sintetis dipertahankan bila kutipan memuat istilah ({label})", app.apply_evidence_gates(ds_design([ds("synthetic_simulated", ev)]))["data_source"]["value"] == ["synthetic_simulated"])
check("sintetis tanpa kutipan tetap diterima sebagai tebakan (inferred)", app.apply_evidence_gates(ds_design([ds("synthetic_simulated", "")]))["data_source"]["value"] == ["synthetic_simulated"])
g2 = app.apply_evidence_gates(ds_design([ds("synthetic_simulated", "kutipan tidak relevan sama sekali")]))
check("jika satu-satunya nilai dibuang: field menjadi not_stated", g2["data_source"]["value"] == [] and g2["data_source"]["basis"] == "not_stated")
check("label lain tidak terpengaruh gerbang", app.apply_evidence_gates(ds_design([ds("secondary", "kutipan apa saja")]))["data_source"]["value"] == ["secondary"])
prompt_c = app.article_prompt("x.pdf", 3, "teks", "RQ", "inc", "exc")
check("prompt: SAA dan diskretisasi skenario bukan data sintetis", "sample average approximation" in prompt_c and "BUKAN data sintetis" in prompt_c)
check("ANALYSIS_VERSION >= 5", app.ANALYSIS_VERSION >= 5)

print("4. Prompt konsisten dengan codebook")
prompt = app.article_prompt("x.pdf", 3, "teks", "RQ", "inc", "exc")
for key in ["experiment_modeling_simulation", "mono_quantitative", "synthetic_simulated", "positivism"]:
    check(f"prompt ekstraksi memuat kode {key}", key in prompt)
check("prompt ekstraksi memuat aturan pemotongan teks", "bagian tengah dipotong" in prompt)
check("prompt time_horizon: urutan longitudinal -> cross_sectional -> not_applicable", "= longitudinal" in prompt and "= not_applicable" in prompt and "BUKAN time horizon penelitian" in prompt)
check("prompt: not_applicable tanpa evidence", "(kosongkan evidence)" in prompt)
check("prompt: label eksplisit wajib kutipan + skema per nilai", "HANYA boleh dipakai bila penulis sendiri menyebut" in prompt and '"values": [{"code"' in prompt)
check("codebook v3 tercatat", app.CODEBOOK_VERSION.endswith("-v3"))
check("definisi not_applicable menyebut simulasi", "simulasi" in app.RESEARCH_ONION["time_horizon"]["values"]["not_applicable"]["def"])
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
    check("[PDF nyata] case_study cf05 dipertahankan (kutipan memuat istilah, terverifikasi)", "case_study" in by["cf05cda816f84a7b"]["strategy"]["value"])
    check("[PDF nyata] f0b9 tanpa case_study, time_horizon longitudinal", "case_study" not in by["f0b90378a8c2d81b"]["strategy"]["value"] and by["f0b90378a8c2d81b"]["time_horizon"]["value"] == "longitudinal")
    check("[PDF nyata] philosophy 'stated' palsu dibuang", by["c25ce2d9937e00bc"]["philosophy"]["value"] == "not_stated")
    check("[PDF nyata] c25c: synthetic stated, secondary tetap inferred (per nilai)", {e["code"]: e["basis"] for e in by["c25ce2d9937e00bc"]["data_source"]["items"]} == {"secondary": "inferred", "synthetic_simulated": "stated"})
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
check("Case study hanya 1 artikel (hanya bila PDF tersedia untuk memverifikasi)", strat["s-case_study"]["count"] == (1 if have_pdfs else 0))
check("Survey tetap tampil dengan hitungan 0", strat["s-survey"]["count"] == 0)
check("induk = gabungan unik anak, bukan penjumlahan", tree["strategi"]["count"] == 5)
tech_names = [t["name"] for t in quan["children"]]
check("teknik yang sama di dua artikel digabung (Random Forest = 2)", next(t for t in quan["children"] if t["name"] == "Random Forest")["count"] == 2)
check("teknik diurutkan dari yang paling sering", quan["children"][0]["count"] >= quan["children"][-1]["count"])
cols = [c["key"] for c in tx["matrix"]["columns"]]
row_quan = next(r for r in tx["matrix"]["rows"] if r["id"] == "quantitative")
check("matriks memuat strategi inti", all(k in cols for k in app.CORE_STRATEGIES))
check("sel Kuantitatif x Case study sesuai", len(row_quan["cells"]["case_study"]) == (1 if have_pdfs else 0))
check("sel Kualitatif x Survey kosong = kandidat gap", next(r for r in tx["matrix"]["rows"] if r["id"] == "qualitative")["cells"]["survey"] == [])
check("ringkasan basis: philosophy semua not_stated (tebakan dibuang)", tx["basis_summary"]["philosophy"]["not_stated"] == 5)

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

print("7. Normalisasi teknik (tahap 3)")
tech_fx = json.load(open(Path(__file__).parent / "fixtures_techniques.json", encoding="utf-8"))
def mk_article(aid, techniques, choice="mono_quantitative"):
    return {"id": aid, "title": aid[:6], "research_design": app.normalise_research_design(
        {"methodological_choice": {"value": choice, "basis": "inferred"}, "techniques": techniques}, [], "")}
corpus = [mk_article(aid, v["techniques"]) for aid, v in tech_fx.items()]
techs = app.collect_techniques(corpus)
by_name = {x["name"]: x for x in techs}
check("pengumpulan teknik: 37 nama unik dari 5 artikel", len(techs) == 37)
check("teknik yang dipakai >1 artikel dihitung benar (Random Forest, TCN = 2)", by_name["Random Forest"]["count"] == 2 and by_name["TCN"]["count"] == 2)
dup = app.collect_techniques([mk_article("x1", ["Random Forest", "random-forest"]), mk_article("x2", ["RANDOM FOREST", "LSTM"])])
check("nama beda huruf besar/tanda baca digabung deterministik tanpa AI", len(dup) == 2 and dup[0]["count"] == 2 and len(dup[0]["raw"]) == 3)

names = [x["name"] for x in techs]
mock = {  # keluaran 'AI' sengaja berantakan
    "principle": "Jenis/peran teknik dalam metode penelitian",
    "families": [
        {"id": "F1", "name": "ML berbasis pohon dan ensemble", "definition": "Model pohon keputusan/ensemble untuk prediksi tabular."},
        {"id": "F2", "name": "Deep learning sekuens dan graf", "definition": "Jaringan saraf untuk deret waktu atau graf."},
        {"id": "F3", "name": "Optimasi eksak dan dekomposisi", "definition": "Model optimasi dengan solusi optimal terbukti."},
        {"id": "F3b", "name": "optimasi eksak dan dekomposisi", "definition": "duplikat nama keluarga, harus menyatu dengan F3"},
        {"id": "F4", "name": "Heuristik dan metaheuristik", "definition": "Pencarian aproksimatif."},
        {"id": "F5", "name": "Pemodelan ketidakpastian dan probabilistik", "definition": "Representasi atau penanganan ketidakpastian."},
        {"id": "F6", "name": "", "definition": "tanpa nama, harus diabaikan"},
    ],
    "merges": [
        {"canonical": "LSTM", "variants": ["LSTM", "BiLSTM", "Stacked LSTM"]},          # menggabungkan metode berbeda: AI salah, tetap harus lolos validasi
        {"canonical": "Gaussian Copula", "variants": ["Gaussian Copula", "Tidak Ada Di Daftar"]},   # varian karangan -> grup < 2 -> diabaikan
        {"canonical": "Tunggal", "variants": ["GBDT"]},                                  # satu varian -> diabaikan
        {"canonical": "Integer Programming", "variants": ["Integer Programming", "LP relaxation"]},   # LP relaxation di-drop -> sisa 1 nama -> merge diabaikan
    ],
    "drops": [{"name": "GridSearchCV", "reason": "alat penyetelan, bukan metode penelitian"},
              {"name": "piecewise linear charging function", "reason": "komponen model"},
              {"name": "Nama Karangan", "reason": "tidak ada di daftar"},
              {"name": "LP relaxation", "reason": "drop menang atas merge"}],
    "assign": {"XGBoost": "F1", "Random Forest": "F1", "LSTM": "F2", "GRU": "F2", "TCN": "F2", "GATv2": "F2", "aLSTM encoder": "F2",
               "Integer Programming": "F3b", "data-driven column generation": "F3", "branch-and-price": "F3", "labeling algorithm": "F3",
               "set-covering model": "F3", "two-stage stochastic programming": "F3",
               "randomized rounding": "F4", "NSGA-II": "F4", "CMA-ES": "F99",   # id salah -> belum dikelompokkan
               "SNGP": "F5", "particle filtering": "F5", "Karangan": "F1"},
}
fin = app.finalize_normalization(mock, techs)
items = fin["items"]
covered = [r for it in items for r in it["variants"]]
all_raw = sorted(r for x in techs for r in x["raw"])
check("invarian: setiap nama masukan muncul TEPAT SEKALI", sorted(covered) == all_raw and len(covered) == len(set(covered)))
check("nama karangan tidak masuk ke hasil", not any("Karangan" in it["canonical"] or "Tidak Ada" in " ".join(it["variants"]) for it in items))
fam_names = [f["name"].lower() for f in fin["families"]]
check("keluarga duplikat nama menyatu dan keluarga tanpa nama diabaikan", len(fam_names) == len(set(fam_names)) == 5)
it_by = {it["canonical"]: it for it in items}
check("drop menang atas merge (LP relaxation dibuang)", it_by["LP relaxation"]["family"] == app.NORM_DROP)
check("drop menyimpan alasan", "komponen" in it_by["piecewise linear charging function"]["reason"])
check("merge sah menyatukan varian (LSTM+BiLSTM+Stacked LSTM) dan menghitung artikel", set(it_by["LSTM"]["variants"]) == {"LSTM", "BiLSTM", "Stacked LSTM"} and it_by["LSTM"]["count"] == 1)
check("merge dengan varian tidak valid/tunggal diabaikan", "Tunggal" not in it_by and it_by["Gaussian Copula"]["variants"] == ["Gaussian Copula"] and it_by["Integer Programming"]["variants"] == ["Integer Programming"])
check("id keluarga yang menyatu (F3b -> F3) dipetakan benar", it_by["Integer Programming"]["family"] == it_by["data-driven column generation"]["family"])
check("id keluarga tidak valid (F99) menjadi belum dikelompokkan (None)", it_by["CMA-ES"]["family"] is None)
check("teknik tanpa penugasan menjadi belum dikelompokkan (None)", it_by["SBOA"]["family"] is None and it_by["Birkhoff algorithm"]["family"] is None)
check("hasil memakai prinsip dan menandai item baru", fin["principle"].startswith("Jenis/peran") and all(it["new"] for it in items))

print("   tree dengan pemetaan")
approved = {"families": fin["families"], "items": [dict(it, new=False) for it in items]}
tx = app.build_design_taxonomy(corpus, "PtO", approved)
quan = next(c for c in next(n for n in tx["tree"]["children"] if n["id"] == "metodologi")["children"] if c["id"] == "m-quantitative")
fam_nodes = {c["name"]: c for c in quan["children"]}
check("cabang Kuantitatif berisi node keluarga, bukan daftar datar", all(c["kind"] == "family" for c in quan["children"]))
check("teknik yang dibuang tidak muncul di pohon", all(t["name"] not in ("GridSearchCV", "piecewise linear charging function", "LP relaxation") for c in quan["children"] for t in c["children"]))
check("teknik baku bergabung: LSTM (3 varian) satu simpul", sum(1 for c in quan["children"] for t in c["children"] if t["name"] == "LSTM") == 1 and not any(t["name"] in ("BiLSTM", "Stacked LSTM") for c in quan["children"] for t in c["children"]))
check("keluarga ML pohon: Random Forest dihitung 2 artikel, keluarga = gabungan unik", fam_nodes["ML berbasis pohon dan ensemble"]["count"] >= 2 and any(t["name"] == "Random Forest" and t["count"] == 2 for t in fam_nodes["ML berbasis pohon dan ensemble"]["children"]))
check("bucket 'Belum dikelompokkan' tampil terakhir untuk yang tak terpetakan", quan["children"][-1]["name"] == app.NORM_UNASSIGNED)
st = tx["normalization_status"]
check("status normalisasi: applied dan jumlah belum terpetakan", st["applied"] and st["unmapped_count"] == len(st["unmapped"]) and st["unmapped_count"] >= 3)
flat = app.build_design_taxonomy(corpus, "PtO")
check("tanpa pemetaan perilaku lama (daftar datar) tidak berubah", all(c["kind"] == "technique" for c in next(c for c in next(n for n in flat["tree"]["children"] if n["id"] == "metodologi")["children"] if c["id"] == "m-quantitative")["children"]) and flat["normalization_status"]["applied"] is False)

print("   inkremental: teknik baru ditambahkan tanpa mengubah pemetaan yang sudah disetujui")
new_art = corpus + [mk_article("nova", ["XGBoost", "Random Forest classifier", "Benders decomposition"])]
before = json.dumps(approved, sort_keys=True)
new_techs = [x for x in app.collect_techniques(new_art) if x["key"] not in app._norm_lookup(approved)["lookup"]]
check("hanya teknik yang belum dikenal yang diproses (XGBoost sudah dikenal)", sorted(x["name"] for x in new_techs) == ["Benders decomposition", "Random Forest classifier"], str([x["name"] for x in new_techs]))
prop2 = {"families": [{"id": "F1", "name": "ML berbasis pohon dan ensemble"}, {"id": "F7", "name": "Dekomposisi lanjutan", "definition": "x"}],
         "merges": [{"canonical": "Random Forest", "variants": ["Random Forest classifier", "Random Forest"]}],
         "assign": {"Random Forest": "F1", "Benders decomposition": "F7"}}
fin2 = app.finalize_normalization(prop2, new_techs, approved)
check("pemetaan lama tidak berubah (keluarga dan item identik)", fin2["families"][:len(approved["families"])] == approved["families"] and fin2["items"][:len(approved["items"])] == approved["items"])
check("approved tidak dimutasi oleh finalisasi", json.dumps(approved, sort_keys=True) == before)
check("keluarga lama dipakai ulang lewat nama (tidak diduplikasi)", sum(1 for f in fin2["families"] if f["name"] == "ML berbasis pohon dan ensemble") == 1)
check("keluarga baru mendapat id baru tanpa bentrok", any(f["name"] == "Dekomposisi lanjutan" and f["id"] not in {x["id"] for x in approved["families"]} for f in fin2["families"]))
check("item baru ditandai new, item lama dipertahankan", sum(1 for i in fin2["items"] if i.get("new")) >= 2 and fin2["items"][0].get("new") is False)

print("   rute /api/normalize-techniques (AI tiruan)")
calls, real_llm = [], app.llm_json
def fake_llm(prompt, **kw):
    calls.append(prompt)
    if kw.get("usage") is not None:
        kw["usage"]["calls"] += 1; kw["usage"]["prompt_tokens"] += 100
    listed = [l.split('"')[1] for l in prompt.splitlines() if l.startswith('- "')]
    return {"principle": "uji", "families": [{"id": "F1", "name": "Keluarga Uji", "definition": "d"}], "merges": [], "drops": [],
            "assign": {n: "F1" for n in listed}}
try:
    app.llm_json = fake_llm
    cl = app.app.test_client()
    r = cl.post("/api/normalize-techniques", json={"articles": corpus, "topic": "PtO", "research_question": "RQ"})
    j = r.get_json()
    check("rute mengembalikan draf normalisasi + usage", r.status_code == 200 and j["usage"]["calls"] == 1 and len(j["normalization"]["items"]) == 37)
    check("prompt memuat aturan gabung/buang/keluarga", all(k in calls[0] for k in ("SAMA PERSIS", "JANGAN menggabungkan", "BUKAN teknik", "SATU prinsip")))
    check("prompt: arsitektur model adalah teknik, solver/perangkat lunak dibuang (temuan audit korpus nyata)", all(k in calls[0] for k in ("ADALAH teknik", "TCN", "Gurobi", "perangkat lunak")))
    check("prompt: varian metodologis (quantile/robust/weighted) tidak digabung ke metode dasar", "tetap terpisah dari metode dasarnya" in calls[0] and "quantile" in calls[0])
    check("prompt: jangan memaksa teknik ke keluarga yang salah", "jangan memaksa teknik" in calls[0] and "K-means" in calls[0])
    check("semua teknik ditugaskan ke keluarga (AI tiruan)", all(i["family"] == "F1" for i in j["normalization"]["items"]))
    calls.clear(); old_chunk = app.NORM_CHUNK; app.NORM_CHUNK = 10
    j2 = cl.post("/api/normalize-techniques", json={"articles": corpus}).get_json()
    check("chunking: 37 nama dengan batch 10 = 4 panggilan AI", len(calls) == 4 and len(j2["normalization"]["items"]) == 37 and j2["usage"]["calls"] == 4)
    check("chunk berikutnya menerima keluarga dari chunk sebelumnya sebagai konteks", "KELUARGA YANG SUDAH ADA" not in calls[0] and "KELUARGA YANG SUDAH ADA" in calls[1])
    app.NORM_CHUNK = old_chunk
    calls.clear()
    j3 = cl.post("/api/normalize-techniques", json={"articles": corpus, "existing": j["normalization"]}).get_json()
    check("tanpa teknik baru: tidak ada panggilan AI, pemetaan tetap", len(calls) == 0 and j3["normalization"]["added"] == 0)
    check("tanpa teknik sama sekali: galat 400 yang jelas", cl.post("/api/normalize-techniques", json={"articles": []}).status_code == 400)
    def boom(prompt, **kw):
        kw["usage"]["calls"] += 1; raise RuntimeError("provider mati")
    app.llm_json = boom
    rb = cl.post("/api/normalize-techniques", json={"articles": corpus})
    check("kegagalan AI: 502 + usage tetap dikembalikan (token tetap terhitung)", rb.status_code == 502 and rb.get_json()["usage"]["calls"] == 1 and "provider mati" in rb.get_json()["error"])
    app.llm_json = fake_llm
    calls.clear()
    part = {"families": approved["families"], "principle": "x", "items": [dict(i, new=False) for i in approved["items"]]}
    part["items"][0] = dict(part["items"][0], family=None)           # satu item tersimpan 'belum dikelompokkan'
    first_name = part["items"][0]["canonical"]
    j4 = cl.post("/api/normalize-techniques", json={"articles": corpus, "existing": part}).get_json()
    expected = sum(1 for i in part["items"] if i["family"] is None)   # semua item tak terkelompok (termasuk yang dari mock berantakan) diproses ulang
    check("item 'belum dikelompokkan' diproses ulang oleh Perbarui (konsisten dengan hitungan UI)", len(calls) == 1 and f'- "{first_name}"' in calls[0] and j4["normalization"]["added"] == expected and expected >= 2, f"calls={len(calls)} added={j4['normalization']['added']} expected={expected}")
    check("item itu tidak digandakan setelah diproses ulang", sum(1 for i in j4["normalization"]["items"] if first_name in i["variants"]) == 1)
    app.llm_json = real_llm
    rt = cl.post("/api/design-taxonomy", json={"articles": corpus, "topic": "PtO", "normalization": approved}).get_json()
    check("/api/design-taxonomy menerapkan pemetaan yang dikirim klien", rt["normalization_status"]["applied"] and rt["normalization_status"]["families"] == 5)
finally:
    app.llm_json = real_llm


print("   normalisasi inkremental (A-D): singkatan, kunci longgar, penjaga varian, attach, gabung otomatis")
K, M = app._tech_key, app._merge_key
check("A: singkatan kurung diabaikan (random forest (RF), SAA, KNN, CSR, BBC)",
      K("random forest (RF)") == K("Random Forest") and K("sample average approximation (SAA)") == K("Sample Average Approximation")
      and K("K-nearest neighbour (KNN)") == K("K-nearest neighbour") and K("cluster-based scenario reduction (CSR)") == K("cluster-based scenario reduction")
      and K("Benders-based branch-and-cut (BBC)") == K("Benders-based branch-and-cut"))
check("A: kurung yang BUKAN singkatan nama tetap dibedakan (kernel RBF, kata kecil, satu kata)",
      K("support vector machine (RBF)") != K("support vector machine") and K("XGBoost (quantile)") != K("XGBoost") and K("Lasso (L1)") != K("Lasso"))
dd = app.collect_techniques([mk_article("y1", ["random forest (RF)"]), mk_article("y2", ["Random Forest"])])
check("A: 'random forest (RF)' dan 'Random Forest' satu ember (2 artikel, dua ejaan tercatat)", len(dd) == 1 and dd[0]["count"] == 2 and len(dd[0]["raw"]) == 2)
check("kunci longgar: rolling horizon ~ rolling horizon optimization ~ framework; Random Forest classifier ~ RF",
      M("rolling horizon") == M("rolling horizon optimization") == M("rolling horizon framework") and M("Random Forest classifier") == M("random forest (RF)"))
check("kunci longgar TIDAK menyatukan metode berbeda (LSTM/BiLSTM, Transformer/decoder-only, Bayesian optimization/Bayesian)",
      M("LSTM") != M("BiLSTM") and M("Transformer") != M("Transformer decoder-only") and M("Bayesian optimization") != M("Bayesian"))
check("C: konflik kata pengubah (weighted SAA vs SAA, robust MPC vs MPC, quantile XGBoost vs XGBoost); stochastic program sepadan",
      app._modifier_conflict("weighted sample average approximation", "Sample Average Approximation") and app._modifier_conflict("robust MPC", "MPC")
      and app._modifier_conflict("quantile XGBoost", "XGBoost") and not app._modifier_conflict("stochastic program", "two-stage stochastic programming")
      and not app._modifier_conflict("XGB-CQR", "XGBoost"))

def mk_item(name, fam, ids=("a",), variants=None):
    return {"canonical": name, "variants": list(variants or [name]), "family": fam, "reason": "", "count": len(ids), "article_ids": list(ids), "new": False}
dup_norm = {"families": [{"id": "F1", "name": "Stokastik", "definition": "d"}, {"id": "F2", "name": "Jaringan", "definition": "d"}],
            "items": [mk_item("Sample Average Approximation", "F1", ("a", "b")), mk_item("sample average approximation (SAA)", "F1", ("c",)),
                      mk_item("weighted sample average approximation", "F1", ("d",)), mk_item("rolling horizon optimization", "F1", ("a",)),
                      mk_item("rolling horizon", "F1", ("e",)), mk_item("LSTM", "F2"), mk_item("BiLSTM", "F2"),
                      mk_item("Gurobi", app.NORM_DROP), mk_item("XGBoost", "F1"), mk_item("XGBoost", "F2")]}
before_dup = json.dumps(dup_norm, sort_keys=True)
cons, merged_ex, review_ex = app.consolidate_normalization(dup_norm)
c_by = {i["canonical"]: i for i in cons["items"]}
check("gabung otomatis duplikat lama: SAA(SAA) dan 'rolling horizon' masuk ke item lama (10 -> 8 item)", len(cons["items"]) == 8 and "rolling horizon" not in c_by and "sample average approximation (SAA)" not in c_by)
check("gabungan mewarisi artikel (union) dan mencatat ejaan", set(c_by["Sample Average Approximation"]["article_ids"]) == {"a", "b", "c"} and c_by["Sample Average Approximation"]["count"] == 3 and "sample average approximation (SAA)" in c_by["Sample Average Approximation"]["variants"])
check("varian bermakna (weighted SAA), LSTM/BiLSTM, dan buangan tidak ikut digabung", "weighted sample average approximation" in c_by and "LSTM" in c_by and "BiLSTM" in c_by and c_by["Gurobi"]["family"] == app.NORM_DROP)
check("duplikat LINTAS keluarga dilaporkan, tidak digabung diam-diam", review_ex == [["XGBoost", "XGBoost"]] and sum(1 for i in cons["items"] if i["canonical"] == "XGBoost") == 2)
check("konsolidasi tidak mengubah masukan", json.dumps(dup_norm, sort_keys=True) == before_dup and len(merged_ex) == 2)

run_norm = {"families": cons["families"], "items": [dict(i) for i in cons["items"]]}
todo_fx = [{"key": "rolling horizon framework", "name": "rolling horizon framework", "raw": ["rolling horizon framework"], "count": 1, "article_ids": ["z"]},
           {"key": "benders decomposition", "name": "Benders decomposition", "raw": ["Benders decomposition"], "count": 1, "article_ids": ["z"]},
           {"key": "weighted saa", "name": "weighted SAA", "raw": ["weighted SAA"], "count": 1, "article_ids": ["z"]}]
rest, att = app.auto_attach(todo_fx, run_norm)
check("auto-attach tanpa AI: 'rolling horizon framework' menempel ke item lama; sisanya tetap untuk AI",
      [t["name"] for t in rest] == ["Benders decomposition", "weighted SAA"] and att == [{"name": "rolling horizon framework", "to": "rolling horizon optimization", "how": "otomatis"}])

base_map = {"families": [{"id": "F1", "name": "Stokastik", "definition": "d"}], "items": [mk_item("Sample Average Approximation", "F1", ("a",))]}
before_base = json.dumps(base_map, sort_keys=True)
ts = app.collect_techniques([mk_article("b1", ["SAA"]), mk_article("c1", ["weighted SAA"]), mk_article("d1", ["Unknown thing"])])
fin_a = app.finalize_normalization({"attach": {"SAA": "Sample Average Approximation", "weighted SAA": "Sample Average Approximation",
                                               "Unknown thing": "Tidak Ada"}, "assign": {}}, ts, base_map)
fa = {i["canonical"]: i for i in fin_a["items"]}
check("B: attach AI menempelkan SAA ke item lama, keluarga lama tetap, jumlah artikel bertambah", set(fa["Sample Average Approximation"]["variants"]) == {"Sample Average Approximation", "SAA"} and fa["Sample Average Approximation"]["family"] == "F1" and fa["Sample Average Approximation"]["count"] == 2 and fin_a["attached"] == [{"name": "SAA", "to": "Sample Average Approximation", "how": "AI"}])
check("C: attach ke varian bermakna ditolak (weighted SAA jadi item sendiri); target tak ada diabaikan", "weighted SAA" in fa and fa["weighted SAA"]["family"] is None and "Unknown thing" in fa and len(fin_a["items"]) == 3)
check("attach tidak mengubah pemetaan masukan", json.dumps(base_map, sort_keys=True) == before_base)
ts2 = app.collect_techniques([mk_article("e1", ["Sample Average Approximation", "SAA", "weighted SAA"])])
fin_m = app.finalize_normalization({"merges": [{"canonical": "Sample Average Approximation", "variants": ["SAA", "weighted SAA"]}], "assign": {}}, ts2)
fm = {i["canonical"]: i for i in fin_m["items"]}
check("C: merge AI yang mencampur weighted SAA dipecah: SAA bergabung, weighted tetap sendiri",
      set(fm["Sample Average Approximation"]["variants"]) == {"Sample Average Approximation", "SAA"} and fm["weighted SAA"]["variants"] == ["weighted SAA"])

ts_abbr = app.collect_techniques([mk_article("q1", ["Benders-based branch-and-cut (BBC)", "support vector machine (RBF)"])])
fin_abbr = app.finalize_normalization({"assign": {}}, ts_abbr)
fb = {i["canonical"]: i for i in fin_abbr["items"]}
check("nama baku item baru tanpa singkatan kurung (BBC), ejaan asli tetap di variants; '(RBF)' bukan singkatan jadi dibiarkan",
      "Benders-based branch-and-cut" in fb and fb["Benders-based branch-and-cut"]["variants"] == ["Benders-based branch-and-cut (BBC)"]
      and "support vector machine (RBF)" in fb)
long_name = "Model prediktif berbasis pembelajaran mesin (Jaringan Syaraf Tiruan dan Deep Learning)"
ts_long = app.collect_techniques([mk_article("lg1", ["LSTM"])])
fin_long = app.finalize_normalization({"families": [{"id": "F1", "name": long_name, "definition": "d"}], "assign": {"LSTM": "F1"}}, ts_long)
check("nama keluarga panjang (>60 karakter) tidak terpotong diam-diam", fin_long["families"][0]["name"] == long_name and len(long_name) > 60, fin_long["families"][0]["name"])
print("   rute Perbarui: nama baru menempel ke item lama, AI hanya untuk sisa")
inc_map = {"families": [{"id": "F1", "name": "Stokastik dan robust", "definition": "d"}, {"id": "F2", "name": "Sekuensial", "definition": "d"}],
           "items": [mk_item("Sample Average Approximation", "F1", ("a",)), mk_item("rolling horizon optimization", "F2", ("a",)), mk_item("Random Forest", "F2", ("a",))]}
inc_arts = [mk_article("n1", ["random forest (RF)", "rolling horizon", "SAA", "weighted sample average approximation", "Benders decomposition", "Sample Average Approximation"])]
calls2, real2 = [], app.llm_json
def fake_llm_inc(prompt, **kw):
    calls2.append(prompt)
    if kw.get("usage") is not None:
        kw["usage"]["calls"] += 1
    return {"principle": "uji", "families": [], "merges": [], "drops": [],
            "attach": {"SAA": "Sample Average Approximation", "weighted sample average approximation": "Sample Average Approximation"},
            "assign": {"weighted sample average approximation": "F1", "Benders decomposition": "F2"}}
try:
    app.llm_json = fake_llm_inc
    cl2 = app.app.test_client()
    inc_before = json.dumps(inc_map, sort_keys=True)
    ji = cl2.post("/api/normalize-techniques", json={"articles": inc_arts, "topic": "PtO", "existing": inc_map}).get_json()
    nn = ji["normalization"]
    ni = {i["canonical"]: i for i in nn["items"]}
    check("Perbarui memanggil AI sekali, hanya untuk nama yang tidak jelas (3 dari 4 nama baru; 1 ditempel otomatis)", len(calls2) == 1 and nn["added"] == 4 and '- "rolling horizon"' not in calls2[0] and '- "SAA"' in calls2[0])
    check("prompt Perbarui memuat NAMA BAKU YANG SUDAH ADA + aturan attach + skema attach", "NAMA BAKU YANG SUDAH ADA" in calls2[0] and "Sample Average Approximation" in calls2[0] and "attach" in calls2[0])
    check("hasil: SAA & rolling horizon menempel ke item lama (bukan item baru); weighted tetap item sendiri; Benders item baru",
          set(ni["Sample Average Approximation"]["variants"]) >= {"SAA"} and "rolling horizon" in ni["rolling horizon optimization"]["variants"]
          and "SAA" not in ni and "rolling horizon" not in ni and "weighted sample average approximation" in ni and "Benders decomposition" in ni and len(nn["items"]) == 5)
    check("laporan: semua yang menempel tercatat (otomatis, AI, dan ejaan lewat kunci sama) dan item yang tersentuh ditandai",
          {(a["name"], a["how"]) for a in nn["attached"]} == {("rolling horizon", "otomatis"), ("SAA", "AI"), ("random forest (RF)", "ejaan")}
          and ni["rolling horizon optimization"].get("touched") and ni["Random Forest"].get("touched"))
    check("hitungan artikel dihitung ulang dari cakupan saat ini dan ejaan baru ('random forest (RF)') tampak sebagai varian item lama", ni["Random Forest"]["article_ids"] == ["n1"] and ni["Random Forest"]["count"] == 1 and "random forest (RF)" in ni["Random Forest"]["variants"], str(ni["Random Forest"]))
    check("keluarga lama tidak berubah dan masukan tidak dimutasi", nn["families"] == inc_map["families"] and json.dumps(inc_map, sort_keys=True) == inc_before)
    calls2.clear()
    ji2 = cl2.post("/api/normalize-techniques", json={"articles": inc_arts, "topic": "PtO", "existing": nn}).get_json()
    check("Perbarui kedua kali tanpa teknik baru: tanpa panggilan AI dan hasil stabil (idempoten)", len(calls2) == 0 and len(ji2["normalization"]["items"]) == len(nn["items"]) and ji2["normalization"]["added"] == 0)
    ji3 = cl2.post("/api/normalize-techniques", json={"articles": inc_arts, "topic": "PtO", "existing": dup_norm}).get_json()
    check("Perbarui menggabung duplikat lama otomatis dan melaporkan duplikat lintas keluarga", len(ji3["normalization"]["merged_existing"]) == 2 and ji3["normalization"]["review"] == [["XGBoost", "XGBoost"]])
    calls2.clear()
    cl2.post("/api/normalize-techniques", json={"articles": corpus, "topic": "PtO"})
    check("usul dari nol: tanpa blok nama baku; prompt memuat aturan buang baru (uji statistik & alat diferensiasi = teknik)",
          "NAMA BAKU YANG SUDAH ADA" not in calls2[0] and "Friedman" in calls2[0] and "KKT conditions" in calls2[0] and "ADALAH teknik, bukan metrik" in calls2[0])
finally:
    app.llm_json = real2

print(f"\nSEMUA LULUS: {len(PASSED)} pengecekan")
