"""Prüft alle Lerninhalte in data/ gegen docs/CONTENT_FORMAT.md.

Aufruf:  python tools/validate_content.py [datei ...]
Ohne Argumente werden alle Dateien geprüft. Benötigt python-chess (pip install chess).
"""
import json
import sys
from collections import deque
from pathlib import Path

import chess

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
TRACKS = {"basics", "mates", "tactics", "strategy", "endgames", "openings"}
PIECES = {"wK", "wQ", "wR", "wB", "wN", "wP", "bK", "bQ", "bR", "bB", "bN", "bP"}
COLORS = {"g", "r", "b", "y"}
GOALS_MOVE = {"exact", "check", "mate", "capture", "promote", "castle"}
GOALS_PLAY = {"mate", "promote"}

errors: list[str] = []
warnings: list[str] = []


def err(where, msg):
    errors.append(f"{where}: {msg}")


def warn(where, msg):
    warnings.append(f"{where}: {msg}")


def is_square(s):
    return isinstance(s, str) and len(s) == 2 and s[0] in "abcdefgh" and s[1] in "12345678"


def board_from(where, fen):
    try:
        b = chess.Board(fen)
    except Exception as e:  # noqa: BLE001
        err(where, f"ungültige FEN {fen!r}: {e}")
        return None
    if not b.is_valid():
        err(where, f"illegale Stellung {fen!r}: {b.status()!r}")
        return None
    return b


def parse_uci(where, b, uci):
    try:
        m = chess.Move.from_uci(uci)
    except Exception:  # noqa: BLE001
        err(where, f"kein UCI-Zug: {uci!r}")
        return None
    if m not in b.legal_moves:
        err(where, f"illegaler Zug {uci} in {b.fen()}")
        return None
    return m


def check_common(where, step):
    for a in step.get("arrows", []) or []:
        if not (isinstance(a, list) and len(a) in (2, 3) and is_square(a[0]) and is_square(a[1])):
            err(where, f"ungültiger Pfeil {a!r}")
        elif len(a) == 3 and a[2] not in COLORS:
            err(where, f"ungültige Pfeilfarbe {a!r}")
    for sq, c in (step.get("marks") or {}).items():
        if not is_square(sq) or c not in COLORS:
            err(where, f"ungültige Markierung {sq}:{c}")
    if "orientation" in step and step["orientation"] not in ("w", "b"):
        err(where, "orientation muss 'w' oder 'b' sein")
    if not isinstance(step.get("text"), str) or not step["text"].strip():
        err(where, "text fehlt")


# ---------- stars ----------

def sq_xy(s):
    return "abcdefgh".index(s[0]), int(s[1]) - 1


def xy_sq(x, y):
    return "abcdefgh"[x] + str(y + 1)


def star_moves(piece, pos, walls, enemies):
    """Ziele einer Figur auf leerem Brett mit Hindernissen. enemies: noch nicht geschlagene Gegner."""
    kind = piece[1]
    white = piece[0] == "w"
    x, y = sq_xy(pos)
    out = []

    def free(sq):
        return sq not in walls and sq not in enemies

    if kind in "RBQ":
        dirs = []
        if kind in "RQ":
            dirs += [(1, 0), (-1, 0), (0, 1), (0, -1)]
        if kind in "BQ":
            dirs += [(1, 1), (1, -1), (-1, 1), (-1, -1)]
        for dx, dy in dirs:
            nx, ny = x + dx, y + dy
            while 0 <= nx < 8 and 0 <= ny < 8:
                sq = xy_sq(nx, ny)
                if sq in walls:
                    break
                out.append(sq)
                if sq in enemies:
                    break
                nx, ny = nx + dx, ny + dy
    elif kind == "N":
        for dx, dy in [(1, 2), (2, 1), (-1, 2), (-2, 1), (1, -2), (2, -1), (-1, -2), (-2, -1)]:
            nx, ny = x + dx, y + dy
            if 0 <= nx < 8 and 0 <= ny < 8 and xy_sq(nx, ny) not in walls:
                out.append(xy_sq(nx, ny))
    elif kind == "K":
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                if dx or dy:
                    nx, ny = x + dx, y + dy
                    if 0 <= nx < 8 and 0 <= ny < 8 and xy_sq(nx, ny) not in walls:
                        out.append(xy_sq(nx, ny))
    elif kind == "P":
        d = 1 if white else -1
        start = 1 if white else 6
        ny = y + d
        if 0 <= ny < 8 and free(xy_sq(x, ny)):
            out.append(xy_sq(x, ny))
            ny2 = y + 2 * d
            if y == start and free(xy_sq(x, ny2)):
                out.append(xy_sq(x, ny2))
        for dx in (-1, 1):
            nx = x + dx
            if 0 <= nx < 8 and 0 <= ny < 8 and xy_sq(nx, ny) in enemies:
                out.append(xy_sq(nx, ny))
    return out


def stars_min_moves(piece, start, stars, walls, enemies):
    stars = list(stars)
    full = (1 << len(stars)) - 1
    enemy_list = list(enemies)
    init = (start, 0, 0)  # pos, star mask, captured-enemy mask
    seen = {init}
    q = deque([(init, 0)])
    while q:
        (pos, smask, emask), d = q.popleft()
        alive = {e for i, e in enumerate(enemy_list) if not emask >> i & 1}
        for t in star_moves(piece, pos, set(walls), alive):
            ns = smask | (1 << stars.index(t) if t in stars else 0)
            ne = emask | (1 << enemy_list.index(t) if t in alive else 0)
            if ns == full:
                return d + 1
            st = (t, ns, ne)
            if st not in seen:
                seen.add(st)
                q.append((st, d + 1))
    return None


# ---------- steps ----------

def check_step(where, step):
    t = step.get("type")
    check_common(where, step)
    if t == "info":
        if "fen" in step:
            board_from(where, step["fen"])
    elif t == "stars":
        piece, start, stars = step.get("piece"), step.get("start"), step.get("stars") or []
        walls = step.get("walls") or []
        enemies = step.get("enemies") or {}
        if piece not in PIECES or piece[1] == "K" and False:
            err(where, f"ungültige Figur {piece!r}")
            return
        if not is_square(start) or not stars or not all(is_square(s) for s in stars):
            err(where, "start/stars ungültig")
            return
        if start in stars:
            err(where, "Startfeld ist ein Stern")
        if any(s in walls for s in stars) or start in walls:
            err(where, "Stern oder Start auf einer Mauer")
        if any(not is_square(s) for s in list(walls) + list(enemies)):
            err(where, "walls/enemies mit ungültigem Feld")
        for sq, p in enemies.items():
            if p not in PIECES or p[0] == piece[0]:
                err(where, f"enemy {sq}:{p} muss gegnerische Figur sein")
        best = stars_min_moves(piece, start, stars, walls, enemies)
        if best is None:
            err(where, "Sterne sind nicht alle erreichbar")
        elif step.get("par") != best:
            err(where, f"par={step.get('par')} aber Minimum ist {best}")
    elif t == "move":
        b = board_from(where, step.get("fen", ""))
        if not b:
            return
        goal = step.get("goal")
        if goal not in GOALS_MOVE:
            err(where, f"unbekanntes goal {goal!r}")
            return
        if goal == "exact":
            sols = step.get("solutions") or []
            if not sols:
                err(where, "goal exact braucht solutions")
            for s in sols:
                parse_uci(where, b, s)
        else:
            def ok(m):
                if goal == "check":
                    return b.gives_check(m)
                if goal == "mate":
                    b.push(m)
                    r = b.is_checkmate()
                    b.pop()
                    return r
                if goal == "capture":
                    return b.is_capture(m)
                if goal == "promote":
                    return m.promotion is not None
                if goal == "castle":
                    return b.is_castling(m)
                return False
            if not any(ok(m) for m in b.legal_moves):
                err(where, f"kein legaler Zug erfüllt goal {goal}")
            if "solutions" in step:
                for s in step["solutions"]:
                    m = parse_uci(where, b, s)
                    if m and not ok(m):
                        err(where, f"solution {s} erfüllt goal {goal} nicht")
    elif t == "line":
        b = board_from(where, step.get("fen", ""))
        moves = step.get("moves") or []
        if not b:
            return
        if len(moves) % 2 == 0:
            err(where, "line muss mit einem Zug des Lernenden enden (ungerade Anzahl)")
        for u in moves:
            m = parse_uci(where, b, u)
            if not m:
                return
            b.push(m)
    elif t == "quiz":
        opts = step.get("options") or []
        if len(opts) < 2:
            err(where, "quiz braucht >= 2 Optionen")
        if not isinstance(step.get("answer"), int) or not 0 <= step["answer"] < len(opts):
            err(where, "answer-Index ungültig")
        if "fen" in step:
            board_from(where, step["fen"])
        if not step.get("explain"):
            warn(where, "quiz ohne explain")
    elif t == "play":
        b = board_from(where, step.get("fen", ""))
        if step.get("goal") not in GOALS_PLAY:
            err(where, f"unbekanntes play-goal {step.get('goal')!r}")
        if not isinstance(step.get("maxMoves"), int) or step["maxMoves"] < 1:
            err(where, "maxMoves fehlt")
        if b and b.is_game_over():
            err(where, "Stellung ist schon beendet")
    else:
        err(where, f"unbekannter Schritt-Typ {t!r}")


def check_lessons(path, all_ids, all_units):
    data = json.loads(path.read_text(encoding="utf-8-sig"))
    units = data.get("units", [])
    lessons = data.get("lessons", [])
    unit_ids = set()
    for u in units:
        w = f"{path.name} unit {u.get('id')}"
        for f in ("id", "track", "level", "title", "description", "icon"):
            if f not in u:
                err(w, f"Feld {f} fehlt")
        if u.get("track") not in TRACKS:
            err(w, f"unbekannter track {u.get('track')!r}")
        if u.get("level") not in (0, 1, 2, 3, 4):
            err(w, "level muss 0–4 sein")
        if u.get("icon") not in PIECES:
            err(w, f"icon {u.get('icon')!r} ungültig")
        if u.get("id") in all_units:
            err(w, "doppelte unit-id")
        all_units.add(u.get("id"))
        unit_ids.add(u.get("id"))
    per_unit = {}
    for les in lessons:
        w = f"{path.name} lesson {les.get('id')}"
        for f in ("id", "unit", "title", "subtitle", "minutes", "steps"):
            if f not in les:
                err(w, f"Feld {f} fehlt")
        if les.get("id") in all_ids:
            err(w, "doppelte lesson-id")
        all_ids.add(les.get("id"))
        if les.get("unit") not in unit_ids:
            err(w, f"unit {les.get('unit')!r} nicht in dieser Datei")
        per_unit[les.get("unit")] = per_unit.get(les.get("unit"), 0) + 1
        steps = les.get("steps") or []
        if not 3 <= len(steps) <= 16:
            warn(w, f"{len(steps)} Schritte")
        for i, s in enumerate(steps):
            check_step(f"{w} step {i}", s)
    for uid in unit_ids:
        if not per_unit.get(uid):
            err(f"{path.name} unit {uid}", "hat keine Lektionen")
    return len(units), len(lessons)


def check_openings(path):
    data = json.loads(path.read_text(encoding="utf-8-sig"))
    ids = set()
    n_lines = 0
    for op in data.get("openings", []):
        w = f"openings {op.get('id')}"
        for f in ("id", "name", "eco", "side", "level", "summary", "ideas", "lines"):
            if f not in op:
                err(w, f"Feld {f} fehlt")
        if op.get("id") in ids:
            err(w, "doppelte id")
        ids.add(op.get("id"))
        if op.get("side") not in ("w", "b"):
            err(w, "side muss w/b sein")
        for line in op.get("lines", []):
            n_lines += 1
            lw = f"{w} / {line.get('name')}"
            b = chess.Board()
            moves = line.get("moves") or []
            if not 8 <= len(moves) <= 20:
                warn(lw, f"{len(moves)} Halbzüge")
            for i, mv in enumerate(moves):
                try:
                    b.push_san(mv["san"])
                except Exception as e:  # noqa: BLE001
                    err(lw, f"Halbzug {i + 1} {mv.get('san')!r} illegal: {e}")
                    break
                if not mv.get("note"):
                    err(lw, f"Halbzug {i + 1} ohne note")
    return len(ids), n_lines


def check_puzzles(path):
    data = json.loads(path.read_text(encoding="utf-8-sig"))
    n = 0
    ids = set()
    for p in data.get("puzzles", []):
        n += 1
        if not (isinstance(p, list) and len(p) == 5):
            err("puzzles", f"Eintrag {p!r} hat nicht 5 Spalten")
            continue
        pid, fen, moves, rating, themes = p
        w = f"puzzle {pid}"
        if pid in ids:
            err(w, "doppelte id")
        ids.add(pid)
        b = board_from(w, fen)
        if not b:
            continue
        ok = True
        for u in moves.split():
            m = parse_uci(w, b, u)
            if not m:
                ok = False
                break
            b.push(m)
        if ok and ("mateIn" in themes or " mate " in f" {themes} ") and not b.is_checkmate():
            err(w, "Matträtsel endet nicht im Matt")
        if not isinstance(rating, int):
            err(w, "rating keine Zahl")
    return n


def main():
    targets = [Path(a).resolve() for a in sys.argv[1:]] or None
    all_ids, all_units = set(), set()
    report = []
    lesson_dir = DATA / "lessons"
    for f in sorted(lesson_dir.glob("*.json")) if lesson_dir.exists() else []:
        if targets is None or f.resolve() in targets:
            u, l = check_lessons(f, all_ids, all_units)
            report.append(f"{f.name}: {u} Units, {l} Lektionen")
    op = DATA / "openings.json"
    if op.exists() and (targets is None or op.resolve() in targets):
        o, l = check_openings(op)
        report.append(f"openings.json: {o} Eröffnungen, {l} Linien")
    pz = DATA / "puzzles.json"
    if pz.exists() and (targets is None or pz.resolve() in targets):
        report.append(f"puzzles.json: {check_puzzles(pz)} Rätsel")
    print("\n".join(report))
    for w in warnings:
        print("WARNUNG", w)
    for e in errors:
        print("FEHLER ", e)
    print(f"\n{len(errors)} Fehler, {len(warnings)} Warnungen")
    sys.exit(1 if errors else 0)


if __name__ == "__main__":
    main()
