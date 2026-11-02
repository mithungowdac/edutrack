"""Generates SYNTHETIC academic records in a VTU-style format.

No real student is represented here. The same simulator produces:
  ml/data/synthetic_training.csv  - 2000 simulated students, used to train the model
  www/data/demo_seed.json         - 60 fictional students, loaded into the app for demo

VTU-style marking assumed: internal (CIE) out of 50, exam (SEE) scaled to 50.
"""
import json
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
SEMESTERS = 5
SUBJECTS = {
    1: ["Engineering Mathematics I", "Engineering Physics", "Basic Electrical Engineering",
        "Programming in C", "Engineering Graphics", "Communication Skills"],
    2: ["Engineering Mathematics II", "Engineering Chemistry", "Basic Electronics",
        "Python Programming", "Mechanical Sciences", "Environmental Studies"],
    3: ["Mathematics for Computing", "Data Structures", "Digital Logic Design",
        "Computer Organization", "Object Oriented Programming", "Discrete Structures"],
    4: ["Probability and Statistics", "Design and Analysis of Algorithms", "Operating Systems",
        "Microcontrollers", "Database Systems Foundations", "Biology for Engineers"],
    5: ["Software Engineering", "Computer Networks", "Theory of Computation",
        "Artificial Intelligence", "Web Technology", "Research Methodology"],
}
FIRST = ["Aarav", "Diya", "Rohan", "Ananya", "Karthik", "Meghana", "Vikram", "Sneha", "Nikhil", "Pooja",
         "Rahul", "Divya", "Suhas", "Kavya", "Manoj", "Shreya", "Arjun", "Nandini", "Tejas", "Bhavana"]
LAST = ["Rao", "Gowda", "Sharma", "Hegde", "Reddy", "Nair", "Kulkarni", "Shetty", "Murthy", "Patil", "Iyer"]


def subject_code(sem, i):
    return f"S{sem}{i + 1:02d}"


def is_fail(cie, see):
    """VTU-style pass rule: CIE >= 20/50, SEE >= 18/50 (35%), total >= 40/100."""
    return cie < 20 or see < 18 or cie + see < 40


def simulate_student(rng, difficulty):
    ability = rng.normal()
    diligence = 0.3 * ability + np.sqrt(1 - 0.09) * rng.normal()
    rows = []
    for sem in range(1, SEMESTERS + 1):
        sem_effect = rng.normal(0, 3)
        for i in range(len(SUBJECTS[sem])):
            diff = difficulty[(sem, i)]
            att = np.clip(88 + 7 * diligence + rng.normal(0, 6), 35, 100)
            cie = np.clip(63 + 11 * ability + 4 * diligence + diff + sem_effect + rng.normal(0, 8), 5, 100)
            see = np.clip(60 + 13 * ability + 5 * diligence + diff + sem_effect + rng.normal(0, 11), 0, 100)
            held = int(rng.integers(38, 49))
            rows.append({
                "sem": sem, "i": i, "held": held, "attended": int(round(held * att / 100)),
                "cie": int(round(cie / 2)), "see": int(round(see / 2)),
            })
    return rows


def features(rows, current_sem=SEMESTERS):
    """The ONLY inputs the model sees. Current-semester exam marks are excluded on
    purpose: they are what we are trying to anticipate (avoids target leakage)."""
    now = [r for r in rows if r["sem"] == current_sem]
    past = [r for r in rows if r["sem"] < current_sem]
    return {
        "attendance_pct": 100 * sum(r["attended"] for r in now) / sum(r["held"] for r in now),
        "internal_pct": 100 * sum(r["cie"] for r in now) / (50 * len(now)),
        "previous_pct": sum(r["cie"] + r["see"] for r in past) / len(past),
        "backlogs": sum(is_fail(r["cie"], r["see"]) for r in past),
    }


def category(final_pct):
    return "At Risk" if final_pct < 50 else "Average" if final_pct < 70 else "Good"


def main():
    rng = np.random.default_rng(2026)
    difficulty = {(s, i): rng.normal(0, 4) for s in SUBJECTS for i in range(len(SUBJECTS[s]))}

    records = []
    for _ in range(2000):
        rows = simulate_student(rng, difficulty)
        now = [r for r in rows if r["sem"] == SEMESTERS]
        final = sum(r["cie"] + r["see"] for r in now) / len(now)
        records.append({**features(rows), "final_pct": final, "category": category(final)})
    out = ROOT / "ml" / "data" / "synthetic_training.csv"
    pd.DataFrame(records).round(2).to_csv(out, index=False)

    subjects = [{"code": subject_code(s, i), "name": n, "semester": s, "credits": 4 if i < 4 else 3}
                for s, names in SUBJECTS.items() for i, n in enumerate(names)]
    students, attendance, internals, exams = [], [], [], []
    for n in range(60):
        usn = f"1MV23CS{n + 1:03d}"
        name = f"{FIRST[n % len(FIRST)]} {LAST[(n * 7) % len(LAST)]}"
        students.append({"usn": usn, "name": name, "branch": "CSE", "section": "A" if n < 30 else "B",
                         "current_sem": SEMESTERS})
        for r in simulate_student(rng, difficulty):
            code = subject_code(r["sem"], r["i"])
            attendance.append({"usn": usn, "code": code, "held": r["held"], "attended": r["attended"]})
            internals.append({"usn": usn, "code": code, "marks": r["cie"]})
            if r["sem"] < SEMESTERS:  # the current semester's exam has not happened yet
                exams.append({"usn": usn, "code": code, "marks": r["see"]})
    seed = {"students": students, "subjects": subjects, "attendance": attendance,
            "internals": internals, "exams": exams}
    target = ROOT / "www" / "data"
    target.mkdir(parents=True, exist_ok=True)
    (target / "demo_seed.json").write_text(json.dumps(seed, separators=(",", ":")))
    print(pd.DataFrame(records)["category"].value_counts())
    print("training rows:", len(records), "| demo students:", len(students))


if __name__ == "__main__":
    main()
