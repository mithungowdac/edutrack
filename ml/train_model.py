"""Trains and evaluates the performance-category model, then exports it for the app.

Evaluation is always on held-out data the model never saw during training.
Three checks are reported, because a score on synthetic data alone proves little:
  1. Synthetic held-out test - how well the model recovers the simulator's pattern.
  2. Real-data benchmark     - same method, trained and tested on the UCI dataset.
  3. External test           - the synthetic-trained model applied to real UCI students.
"""
import json
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.dummy import DummyClassifier
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (accuracy_score, confusion_matrix, f1_score,
                             precision_score, recall_score)
from sklearn.model_selection import StratifiedKFold, cross_val_score, train_test_split
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

ROOT = Path(__file__).resolve().parent.parent
FEATURES = ["attendance_pct", "internal_pct", "previous_pct", "backlogs"]
CLASSES = ["At Risk", "Average", "Good"]
SEED = 42
ASSUMED_SCHOOL_DAYS = 180  # UCI records absence counts, not a percentage


def category(pct):
    return "At Risk" if pct < 50 else "Average" if pct < 70 else "Good"


def score(y_true, y_pred):
    return {
        "accuracy": round(accuracy_score(y_true, y_pred), 3),
        "precision_macro": round(precision_score(y_true, y_pred, average="macro", zero_division=0, labels=CLASSES), 3),
        "recall_macro": round(recall_score(y_true, y_pred, average="macro", zero_division=0, labels=CLASSES), 3),
        "f1_macro": round(f1_score(y_true, y_pred, average="macro", zero_division=0, labels=CLASSES), 3),
        "at_risk_recall": round(recall_score(y_true, y_pred, labels=["At Risk"], average="macro", zero_division=0), 3),
        "at_risk_precision": round(precision_score(y_true, y_pred, labels=["At Risk"], average="macro", zero_division=0), 3),
        "confusion_matrix": confusion_matrix(y_true, y_pred, labels=CLASSES).tolist(),
        "test_size": int(len(y_true)),
    }


def logistic():
    # balanced weights: missing a struggling student costs more than a false alarm
    return make_pipeline(StandardScaler(), LogisticRegression(class_weight="balanced", max_iter=2000))


def load_uci():
    path = ROOT / "ml" / "data" / "uci" / "student-por.csv"
    if not path.exists():
        return None
    raw = pd.read_csv(path, sep=";")
    return pd.DataFrame({
        "attendance_pct": (100 * (1 - raw["absences"] / ASSUMED_SCHOOL_DAYS)).clip(0, 100),
        "internal_pct": raw["G2"] * 5,   # second-period grade (0-20) as the internal mark
        "previous_pct": raw["G1"] * 5,   # first-period grade as the earlier record
        "backlogs": raw["failures"],
        "category": (raw["G3"] * 5).map(category),
    })


def main():
    data = pd.read_csv(ROOT / "ml" / "data" / "synthetic_training.csv")
    X, y = data[FEATURES], data["category"]
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, stratify=y, random_state=SEED)

    candidates = {
        "Baseline (always majority class)": DummyClassifier(strategy="most_frequent"),
        "Logistic Regression": logistic(),
        "Random Forest": RandomForestClassifier(n_estimators=200, class_weight="balanced", random_state=SEED),
    }
    comparison = {}
    cv = StratifiedKFold(5, shuffle=True, random_state=SEED)
    for name, model in candidates.items():
        cv_f1 = cross_val_score(model, X_train, y_train, cv=cv, scoring="f1_macro")
        model.fit(X_train, y_train)
        comparison[name] = {**score(y_test, model.predict(X_test)),
                            "cv_f1_mean": round(cv_f1.mean(), 3), "cv_f1_std": round(cv_f1.std(), 3)}

    chosen = candidates["Logistic Regression"]
    report = {"synthetic_test": comparison}

    uci = load_uci()
    if uci is not None:
        Xu, yu = uci[FEATURES], uci["category"]
        Xa, Xb, ya, yb = train_test_split(Xu, yu, test_size=0.2, stratify=yu, random_state=SEED)
        real = logistic().fit(Xa, ya)
        baseline = DummyClassifier(strategy="most_frequent").fit(Xa, ya)
        report["real_benchmark"] = {
            "dataset": "UCI Student Performance (Portuguese course), 649 students",
            "logistic": score(yb, real.predict(Xb)),
            "baseline": score(yb, baseline.predict(Xb)),
            "class_counts": yu.value_counts().to_dict(),
        }
        report["external_test"] = {
            "logistic": score(yu, chosen.predict(Xu)),
            "baseline": score(yu, [y_train.value_counts().idxmax()] * len(yu)),
        }

    scaler, clf = chosen.named_steps["standardscaler"], chosen.named_steps["logisticregression"]
    samples = X_test.head(8)
    export = {
        "features": FEATURES,
        "classes": list(clf.classes_),
        "mean": scaler.mean_.round(6).tolist(),
        "scale": scaler.scale_.round(6).tolist(),
        "coef": clf.coef_.round(6).tolist(),
        "intercept": clf.intercept_.round(6).tolist(),
        "training_rows": len(X_train),
        "report": report,
        # lets the app's JavaScript version be checked against scikit-learn's own answers
        "check_vectors": {"inputs": samples.values.tolist(),
                          "probabilities": chosen.predict_proba(samples).round(6).tolist()},
    }
    out = ROOT / "www" / "data" / "model.json"
    out.write_text(json.dumps(export, indent=1))
    print(json.dumps(report, indent=1))
    print("coefficients", dict(zip(clf.classes_, clf.coef_.round(2).tolist())), FEATURES)


if __name__ == "__main__":
    main()
