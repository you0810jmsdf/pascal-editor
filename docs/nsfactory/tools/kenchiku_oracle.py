# -*- coding: utf-8 -*-
"""壁量・柱小径の照合用オラクル（N's factory・2026-10-07）。
国交省が案内する公式「在来軸組工法用 表計算ツール」(HOWTEC・2025-12版) の計算式を Python に写したもの。
TypeScript 実装のテスト期待値はこのスクリプトで生成し、公式ツールの入力例（1階44・2階25 cm/㎡、柱 84/105mm）で照合済み。
使い方: py kenchiku_oracle.py  → 入力例とテストベクトルを JSON で出力
"""
import math
import json

ROOF = {"tile": 990, "slate": 740, "metal": 500}          # 瓦屋根(ふき土無)/スレート/金属板ぶき N/m²(屋根面積あたり)
EXT_WALL = {"earthen": 1000, "mortar": 890, "siding": 600, "metal": 500, "board": 350}  # 外壁 N/m²(壁面積あたり)
PV = {"none": 0, "standard": 200}                          # 太陽光 N/m²(屋根面積あたり)
INNER_WALL_28 = 200   # 内壁 せっこうボード N/m²(床面積あたり・階高2.8m時)
CEIL_INSUL = 100      # 天井(屋根)断熱 N/m²(床面積あたり)
WALL_INSUL = 70       # 外壁断熱 N/m²(壁面積あたり)
TRIPLE_GLASS = 400    # 高断熱窓 N/m²(開口面積あたり・壁面積の9%を開口とみなす)。公式ツールは常に算入する（切替なし）
FLOOR = 610           # 床 N/m²
LIVE_SEISMIC = {"house": 600, "office": 800}    # 積載(地震力算定用)
LIVE_COLUMN = {"house": 1300, "office": 1800}   # 積載(柱算定用)
REF_X, REF_Y = 6.0, 16.5   # 荷重換算に使う基準建物の平面(m)。外周長 = 2*(6+16.5) = 45m
OPENING_RATIO = 0.09
RT = 1.0
KD = 1.1              # 長期(1.1/3)
AE_COLUMN_M2 = 5.0    # 柱1本の負担面積(m²)
FC_SUGI = 17.7        # すぎ無等級材 Fc N/mm²


def roundup(x, digits=0):
    f = 10 ** digits
    return math.ceil(round(x * f, 9)) / f


def roof_factor(overhang_m, pitch_sun):
    """屋根面積の割増係数 Z2：軒の出と勾配(寸)による。"""
    return (REF_Y + overhang_m * 2) * (REF_X + overhang_m * 2) * math.sqrt(pitch_sun ** 2 + 10 ** 2) / (REF_Y * REF_X) / 10


def per_floor_wall(unit_wall_load, storey_h):
    """壁面積あたり荷重 → 床面積あたり(N/m²)。基準建物の外周壁面積×(1-開口率)/床面積。10N単位切上げ。"""
    return roundup(unit_wall_load * ((REF_X * storey_h * 2 + REF_Y * storey_h * 2) * (1 - OPENING_RATIO) / (REF_X * REF_Y)), -1)


def per_floor_opening(storey_h, triple=True):
    if not triple:
        return 0
    return roundup(TRIPLE_GLASS * ((REF_X * storey_h * 2 + REF_Y * storey_h * 2) * OPENING_RATIO / (REF_X * REF_Y)), -1)


def wall_load_kn(ext, storey_h, triple=True, wall_insul=WALL_INSUL):
    """② / ④ 壁荷重 kN/m²(床面積あたり)"""
    return (per_floor_wall(EXT_WALL[ext], storey_h) + INNER_WALL_28 * storey_h / 2.8
            + per_floor_wall(wall_insul, storey_h) + per_floor_opening(storey_h, triple)) / 1000


def required_wall_two_storey(h1, h2, roof_rise, c0, af1, af2, overhang, pitch_sun, roof, ext,
                             pv="none", ceil_insul=CEIL_INSUL, wall_insul=WALL_INSUL, triple=True, use="house"):
    """2階建ての床面積に乗ずる数値 Lw(cm/㎡) と内訳。公式ツール「表計算ツール（2階建て）」と同じ式。"""
    z2 = roof_factor(overhang, pitch_sun)
    r = af2 / af1                                   # 床面積比(≦1想定。超える場合は公式ツール同様そのまま)
    h = roof_rise / 2 + h2 + h1 + 0.5               # 算定用建築物の高さ(基礎+土台0.5m)
    T = 0.03 * h
    w_roof = ((ROOF[roof] * z2 + PV[pv] * z2) * r + ceil_insul * r) / 1000      # ①
    w_wall2 = wall_load_kn(ext, h2, triple, wall_insul) * r                      # ②
    w_floor2 = (FLOOR + LIVE_SEISMIC[use]) * r / 1000                            # ③
    w_wall1 = wall_load_kn(ext, h1, triple, wall_insul)                           # ④
    w_lean = (1 - r) * (ROOF[roof] * z2 + ceil_insul + PV[pv] * z2) / 1000 if r < 1 else 0   # ⑤ 下屋
    w2 = w_roof + 0.5 * w_wall2                     # 2階が支える荷重 (kN per 1階床面積 m²)
    w1 = w_roof + w_wall2 + w_floor2 + 0.5 * w_wall1 + w_lean
    alpha2 = w2 / w1
    a2 = 1 + (1 / math.sqrt(alpha2) - alpha2) * 2 * T / (1 + 3 * T)
    lw1 = roundup(c0 * RT * w1 / 0.0196)
    lw2 = roundup(a2 * c0 * RT * w2 / 0.0196 / r)
    return {"lw1": lw1, "lw2": lw2, "z2": z2, "h": h, "A2": a2, "w1": w1, "w2": w2,
            "parts": {"roof": w_roof, "wall2": w_wall2, "floor2": w_floor2, "wall1": w_wall1, "lean": w_lean},
            # 柱の小径用(積載は柱算定用)
            "col": {"w_roof": ((ROOF[roof] * z2 + PV[pv] * z2) + ceil_insul) / 1000,
                    "w_wall2": wall_load_kn(ext, h2, triple, wall_insul),
                    "w_floor2": (FLOOR + LIVE_COLUMN[use]) / 1000,
                    "w_wall1": wall_load_kn(ext, h1, triple, wall_insul),
                    "w_lean": w_lean}}


def required_wall_single_storey(h1, roof_rise, c0, overhang, pitch_sun, roof, ext, pv="none",
                                ceil_insul=CEIL_INSUL, wall_insul=WALL_INSUL, triple=True):
    z2 = roof_factor(overhang, pitch_sun)
    h = roof_rise / 2 + h1 + 0.5
    w_roof = (ROOF[roof] * z2 + PV[pv] * z2 + ceil_insul) / 1000
    w_wall1 = wall_load_kn(ext, h1, triple, wall_insul)
    w1 = w_roof + 0.5 * w_wall1
    return {"lw1": roundup(c0 * RT * w1 / 0.0196), "z2": z2, "h": h, "w1": w1,
            "col": {"w_roof": w_roof, "w_wall1": w_wall1}}


def column_min_size(w_kn_m2, l_mm, fc=FC_SUGI, ae_m2=AE_COLUMN_M2):
    """柱の必要小径(mm)。座屈3条件式(細長比による)と有効細長比150の大きい方。公式ツール 2-1/2-2 と同式。"""
    a = math.sqrt(w_kn_m2 * ae_m2 / (KD / 3 * fc) * 1000)      # √(wd·Ae/(Kd/3·Fc))
    y = l_mm / 52.7
    z = l_mm / 8.66
    if y > a:
        d_buck = (12 * l_mm ** 2 / 3000 * a ** 2) ** 0.25
    elif z < a:
        d_buck = a
    else:
        d_buck = l_mm / 75.05 + math.sqrt((l_mm / 75.05) ** 2 + a ** 2 / 1.3)
    d_buck = roundup(d_buck)
    d_slender = roundup(math.sqrt(12) * l_mm / 150)
    return {"de": max(d_buck, d_slender), "de_buckling": d_buck, "de_slenderness": d_slender, "a": a}


def ratio_label(l_mm, de):
    return "1/" + str(math.floor(l_mm / de * 10) / 10)


def two_storey_columns(res, h1, h2, fc=FC_SUGI):
    c = res["col"]
    w2_outer = c["w_roof"] + 0.5 * c["w_wall2"]
    w1_outer = c["w_roof"] + c["w_wall2"] + c["w_floor2"] + c["w_lean"] + 0.5 * c["w_wall1"]
    l2 = h2 * 1000 - 105     # 2階: 階高から梁せい105を引く
    l1 = h1 * 1000 - 120     # 1階: 梁せい120
    c2 = column_min_size(w2_outer, l2, fc)
    c1 = column_min_size(w1_outer, l1, fc)
    c2["ratio"] = ratio_label(l2, c2["de"])
    c1["ratio"] = ratio_label(l1, c1["de"])
    return {"storey2": c2, "storey1": c1, "l2": l2, "l1": l1, "w2_outer": w2_outer, "w1_outer": w1_outer}


if __name__ == "__main__":
    # 公式ツールの入力例: h2=3.0, h1=3.0, 最高高さ−軒高=0.5, C0=0.2, Af2=Af1=60, 軒の出0.5, 4寸, スレート, サイディング, 太陽光あり(200)
    ex = required_wall_two_storey(3.0, 3.0, 0.5, 0.2, 60, 60, 0.5, 4, "slate", "siding", pv="standard")
    cols = two_storey_columns(ex, 3.0, 3.0)
    assert ex["lw1"] == 44 and ex["lw2"] == 25, ex
    assert cols["storey2"]["de"] == 84 and cols["storey1"]["de"] == 105, cols
    assert cols["storey2"]["ratio"] == "1/34.4" and cols["storey1"]["ratio"] == "1/27.4", cols
    vectors = {
        "official_example": {
            "input": {"h1": 3.0, "h2": 3.0, "roof_rise": 0.5, "c0": 0.2, "af1": 60, "af2": 60, "overhang": 0.5,
                      "pitch_sun": 4, "roof": "slate", "ext": "siding", "pv": "standard"},
            "lw": [ex["lw1"], ex["lw2"]], "columns": [cols["storey1"]["de"], cols["storey2"]["de"]],
            "A2": round(ex["A2"], 4), "w1": round(ex["w1"], 4), "w2": round(ex["w2"], 4)},
    }
    cases = {
        "tile_siding_30_30_50_50": dict(h1=3.0, h2=3.0, roof_rise=1.0, c0=0.2, af1=50, af2=50, overhang=0.5, pitch_sun=4, roof="tile", ext="siding"),
        "metal_board_29_28_lean": dict(h1=2.9, h2=2.8, roof_rise=1.2, c0=0.2, af1=66.25, af2=49.69, overhang=0.6, pitch_sun=4.5, roof="metal", ext="board"),
        "tile_mortar_c03_pv": dict(h1=3.1, h2=3.0, roof_rise=1.5, c0=0.3, af1=80, af2=40, overhang=0.9, pitch_sun=5, roof="tile", ext="mortar", pv="standard"),
    }
    for name, kw in cases.items():
        r = required_wall_two_storey(**kw)
        c = two_storey_columns(r, kw["h1"], kw["h2"])
        vectors[name] = {"input": kw, "lw": [r["lw1"], r["lw2"]], "columns": [c["storey1"]["de"], c["storey2"]["de"]],
                         "A2": round(r["A2"], 4), "w1": round(r["w1"], 4), "w2": round(r["w2"], 4)}
    s = required_wall_single_storey(2.9, 1.0, 0.2, 0.5, 4, "slate", "siding")
    sc = column_min_size(s["col"]["w_roof"] + 0.5 * s["col"]["w_wall1"], 2.9 * 1000 - 105)
    vectors["single_slate_siding_29"] = {
        "input": {"h1": 2.9, "roof_rise": 1.0, "c0": 0.2, "overhang": 0.5, "pitch_sun": 4, "roof": "slate", "ext": "siding"},
        "lw": [s["lw1"]], "column": sc["de"], "w1": round(s["w1"], 4)}
    print(json.dumps(vectors, ensure_ascii=False, indent=1))
