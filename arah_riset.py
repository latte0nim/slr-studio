"""
Arah Riset (langkah 0, khusus TMI ITB) - deterministik, TANPA LLM saat runtime, tanpa biaya token.
Data: arah_riset_data/thesis_facets.json (hasil ekstraksi facet tesis TMI) + vocab_en.json (istilah query).

selected = dict layer -> nilai (None / tidak ada = "belum tahu")
layer    = kk, masalah, sektor, kelompok_metode, metode, pendekatan
"""
import json
import random
from collections import Counter
from datetime import date
from pathlib import Path

KK_LABEL = {
    "sistem_manufaktur": "Sistem Manufaktur",
    "manajemen_industri": "Manajemen Industri",
    "sistem_industri_rantai_nilai": "Sistem Industri & Rantai Nilai",
    "sistem_informasi_keputusan": "Sistem Informasi & Keputusan",
    "ergonomi_rekayasa_kerja": "Ergonomi & Rekayasa Kerja",
}
LAYERS = [
    ("kk", "Kelompok keilmuan"),
    ("masalah", "Jenis masalah yang ingin dianalisis"),
    ("sektor", "Sektor / konteks"),
    ("kelompok_metode", "Kelompok metode"),
    ("metode", "Metode spesifik"),
    ("pendekatan", "Pendekatan penelitian"),
]
NETRAL = {"lainnya", "tidak spesifik"}
TOP = {"kk": 5, "masalah": 25, "sektor": 25, "kelompok_metode": 12, "metode": 10, "pendekatan": 10}  # opsi tampil per layer

# RQ penelitian per pendekatan. {m}=masalah, {s}=konteks, {x}=metode
RQ_TEMPLATE = {
    "pengembangan model": "Bagaimana mengembangkan model untuk {m}{s}{x}?",
    "eksplorasi faktor": "Faktor-faktor apa yang memengaruhi {m}{s}, dan bagaimana hubungan antar faktor tersebut{x}?",
    "evaluasi/pengukuran": "Bagaimana {m}{s} dapat diukur dan dievaluasi{x}?",
    "optimasi": "Bagaimana {m}{s} dapat dioptimalkan{x}?",
    "perancangan sistem": "Bagaimana merancang sistem untuk {m}{s}{x}?",
    "analisis kebijakan": "Bagaimana dampak alternatif kebijakan terhadap {m}{s}{x}?",
    "prediksi/peramalan": "Seberapa baik kinerja prediksi untuk {m}{s}{x}?",
}
RQ_DEFAULT = "Bagaimana {m}{s} dapat dianalisis{x}?"


def _match(t, layer, val):
    if layer == "kk":
        return val in t["kk"]
    if layer in ("masalah", "kelompok_metode", "metode"):
        return val in t[layer]
    return t[layer] == val  # sektor, pendekatan


DATA_DIR = Path(__file__).resolve().parent / "arah_riset_data"


class Engine:
    def __init__(self, data=DATA_DIR / "thesis_facets.json", vocab=DATA_DIR / "vocab_en.json"):
        self.t = json.loads(Path(data).read_text(encoding="utf-8"))
        self.v = json.loads(Path(vocab).read_text(encoding="utf-8"))

    # ---------- filter & opsi ----------
    def filtered(self, selected, skip=None):
        r = self.t
        for layer, _ in LAYERS:
            if layer == skip or not selected.get(layer):
                continue
            r = [t for t in r if _match(t, layer, selected[layer])]
        return r

    def options(self, layer, selected, top=8, min_n=1):
        """Opsi untuk satu layer, dihitung dari tesis yang cocok dengan pilihan layer LAIN."""
        pool = self.filtered(selected, skip=layer)
        c = Counter()
        for t in pool:
            if layer == "kk":
                vals = t["kk"]
            elif layer in ("masalah", "kelompok_metode", "metode"):
                vals = t[layer]
            else:
                vals = [t[layer]]
            for x in vals:
                if x not in NETRAL:
                    c[x] += 1
        out = [(k, n) for k, n in c.most_common() if n >= (3 if layer == "metode" else min_n)]
        return out[:top], len(pool)

    def label(self, layer, val):
        return KK_LABEL.get(val, val) if layer == "kk" else val

    # ---------- mode reaksi ----------
    def examples(self, selected, n=5, seed=None):
        pool = self.filtered(selected)
        rnd = random.Random(seed)
        pool = sorted(pool, key=lambda t: -(t["angkatan"] or 0))[: max(n * 4, 20)]
        return rnd.sample(pool, min(n, len(pool)))

    # ---------- celah ----------
    def gaps(self, selected):
        """Pasangan masalah x sektor yang belum pernah muncul di tesis jurusanmu.
        BUKAN jaminan novelty global dan belum tentu masuk akal: cek sendiri/dengan pembimbing.
        (Celah untuk metode sengaja tidak disarankan otomatis: terlalu sering tidak masuk akal.)"""
        m, s = selected.get("masalah"), selected.get("sektor")
        if not m or s:
            return []
        n = len(self.t)
        m_tot = sum(m in t["masalah"] for t in self.t)
        sek_tot = Counter(t["sektor"] for t in self.t)
        have = Counter(t["sektor"] for t in self.t if m in t["masalah"])
        cand = []
        for sek, tot in sek_tot.items():
            if sek in NETRAL or have[sek] > 0:
                continue
            expected = m_tot * tot / n
            if expected >= 3:
                cand.append((expected, sek, tot))
        cand.sort(reverse=True)
        return [f"'{m}' belum pernah dipasangkan dengan sektor '{sek}' "
                f"(sektor itu ada di {tot} tesis; perkiraan {exp:.0f} jika acak) - cek kelayakannya"
                for exp, sek, tot in cand[:3]]

    # ---------- generator ----------
    def _terms(self, layer, val):
        return list(self.v[layer].get(val, {}).get("terms", [])) if val else []

    def _label_en(self, layer, val):
        return self.v[layer].get(val, {}).get("label_en", "") if val else ""

    @staticmethod
    def _ops(blocks):
        return (len(blocks) - 1) + sum(len(b) - 1 for b in blocks)

    def build_query(self, blocks, max_ops, max_terms=5):
        blocks = [b[:max_terms] for b in blocks if b]
        while self._ops(blocks) > max_ops:
            big = max(range(len(blocks)), key=lambda i: len(blocks[i]))
            if len(blocks[big]) > 1:
                blocks[big] = blocks[big][:-1]
            else:
                blocks = blocks[:-1]  # buang blok prioritas terendah

        def fmt(b):
            q = " OR ".join(f'"{t}"' for t in b)
            return f"({q})" if len(b) > 1 else q

        return " AND ".join(fmt(b) for b in blocks), self._ops(blocks)

    def generate(self, selected, extra_en_terms=None, year_from=2020):
        m, s, km = selected.get("masalah"), selected.get("sektor"), selected.get("kelompok_metode")
        met, appr = selected.get("metode"), selected.get("pendekatan")
        extra = extra_en_terms or []
        if not (m or s or met or km or extra):
            raise ValueError("Pilih minimal satu dari: masalah, sektor, metode (atau isi kata kunci tambahan).")

        s_ok = s and s not in NETRAL
        m_ok = m and m not in NETRAL
        # ---- topik & RQ ----
        m_txt = m.replace(" & ", " dan ") if m_ok else "topik yang dipilih"
        s_txt = f" pada {s.replace(' & ', ' dan ')}" if s_ok else ""
        x_name = met or (km.replace(" & ", " dan ") if km and km not in NETRAL else None)
        x_txt = f" dengan pendekatan {x_name}" if x_name else ""
        topik = f"{m_txt[0].upper()}{m_txt[1:]}{s_txt}{x_txt}"
        topik_en = " ".join(
            p for p in [
                self._label_en("masalah", m) if m_ok else "",
                f"in {self._label_en('sektor', s)}" if s_ok and self._label_en("sektor", s) else "",
                f"using {met}" if met else (f"using {self._label_en('kelompok_metode', km)}" if self._label_en("kelompok_metode", km) else ""),
            ] if p
        )
        tpl = RQ_TEMPLATE.get(appr, RQ_DEFAULT)
        rq = tpl.format(m=m_txt, s=s_txt, x=x_txt)
        rq_slr = (f"Bagaimana studi terdahulu menangani {m_txt}{s_txt}, "
                  f"metode apa yang digunakan, dan celah apa yang masih tersisa?")

        # ---- query ----
        met_terms = self._terms("kelompok_metode", km)
        if met:
            alias = self.v["metode_alias"].get(met, [met])
            met_terms = [met] + [a for a in alias if a != met] if met in self.v["metode_alias"] else [met]
        blocks = [
            self._terms("masalah", m) if m_ok else [],
            self._terms("sektor", s) if s_ok else [],
            met_terms,
            extra,
        ]
        q_sd, ops_sd = self.build_query(blocks, max_ops=8)
        q_sc, ops_sc = self.build_query(blocks, max_ops=20, max_terms=6)
        year_to = date.today().year

        incl = [
            f"Artikel jurnal peer-reviewed {year_from}-{year_to}, bahasa Inggris, full text tersedia",
            f"Membahas langsung {self._label_en('masalah', m) or m_txt}" + (f" dalam konteks {self._label_en('sektor', s)}" if s_ok and self._label_en("sektor", s) else ""),
            "Menyajikan model, metode, atau bukti empiris yang dapat dianalisis (bukan sekadar pembahasan konsep)",
        ]
        if x_name:
            incl.append(f"Menggunakan atau membandingkan {x_name}")
        excl = [
            "Review, opini, editorial, prosiding/konferensi, buku",
            "Domain di luar konteks yang dipilih atau hanya menyebut topik sekilas",
            "Tanpa full text atau duplikat",
            "Bukan bahasa Inggris",
        ]
        if met:
            excl.insert(2, f"Tidak menggunakan {met} maupun pendekatan yang setara")

        return {
            "topik_umum": topik, "topik_en": topik_en,
            "research_question": rq, "rq_untuk_slr": rq_slr,
            "query_sciencedirect": q_sd, "operator_sciencedirect": ops_sd,
            "query_scopus": f"TITLE-ABS-KEY({q_sc})", "operator_scopus": ops_sc,
            "inklusi": incl, "eksklusi": excl,
            "panduan_hasil": "Kalau hasil >2.000 artikel: persempit (tambah blok sektor/metode). "
                             "Kalau <50: longgarkan (buang blok metode, tambah sinonim). "
                             "Sedikit hasil bukan berarti topiknya belum ada penelitiannya.",
            "pemilihan": {k: v for k, v in selected.items() if v},
            "jumlah_tesis_serupa": len(self.filtered(selected)),
            "celah_jurusan": self.gaps(selected),
        }
