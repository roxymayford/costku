"""
Training script for CostKu personal finance category classifier.
Strictly follows ML Best Practices:
  1. Chronological/Stratified Train/Test split BEFORE featurization.
  2. Multi-model comparison (MultinomialNB, Calibrated LinearSVC, LogisticRegression).
  3. Evaluation with Accuracy, Precision, Recall, F1-Score, and Confusion Matrix.
  4. Model serialization with joblib for production serving.
"""

import os
import json
import time
from datetime import datetime
import joblib
import numpy as np
from sklearn.model_selection import train_test_split
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.naive_bayes import MultinomialNB
from sklearn.svm import LinearSVC
from sklearn.linear_model import LogisticRegression
from sklearn.calibration import CalibratedClassifierCV
from sklearn.pipeline import Pipeline
from sklearn.metrics import classification_report, accuracy_score, confusion_matrix

from dataset import get_dataset

MODEL_DIR = os.path.join(os.path.dirname(__file__), "model")
PIPELINE_PATH = os.path.join(MODEL_DIR, "classifier_pipeline.joblib")
METADATA_PATH = os.path.join(MODEL_DIR, "metadata.json")

def evaluate_model(name, pipeline, X_test, y_test, classes):
    y_pred = pipeline.predict(X_test)
    acc = accuracy_score(y_test, y_pred)
    report = classification_report(y_test, y_pred, target_names=classes, output_dict=True)
    cm = confusion_matrix(y_test, y_pred, labels=classes)
    
    print(f"\n==================== {name} ====================")
    print(f"Accuracy: {acc * 100:.2f}%")
    print(classification_report(y_test, y_pred, target_names=classes))
    print("Confusion Matrix:")
    print(f"Classes: {classes}")
    print(cm)
    
    return {
        "name": name,
        "pipeline": pipeline,
        "accuracy": float(acc),
        "f1_macro": float(report["macro avg"]["f1-score"]),
        "report": report,
        "confusion_matrix": cm.tolist()
    }

def train_and_export():
    os.makedirs(MODEL_DIR, exist_ok=True)
    
    print("[1/5] Generating dataset...")
    X, y = get_dataset(samples_per_class=400, seed=42)
    classes = sorted(list(set(y)))
    print(f"Total dataset size: {len(X)} samples across {len(classes)} classes: {classes}")
    
    print("[2/5] Splitting data into train and test sets (stratified 80/20)...")
    # STRICT ordering: Train/Test split BEFORE fitting any featurizer!
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.20, random_state=42, stratify=y
    )
    print(f"Train size: {len(X_train)} | Test size: {len(X_test)}")
    
    print("[3/5] Defining candidates and pipelines...")
    vectorizer = TfidfVectorizer(
        ngram_range=(1, 2),
        sublinear_tf=True,
        min_df=1,
        strip_accents="unicode",
        lowercase=True
    )
    
    candidates = [
        (
            "Calibrated LinearSVC",
            CalibratedClassifierCV(LinearSVC(C=1.0, random_state=42), cv=3)
        ),
        (
            "Multinomial Naive Bayes",
            MultinomialNB(alpha=0.1)
        ),
        (
            "Logistic Regression",
            LogisticRegression(C=2.0, max_iter=1000, random_state=42)
        ),
    ]
    
    results = []
    print("[4/5] Training and evaluating candidate models...")
    for name, clf in candidates:
        pipeline = Pipeline([
            ("tfidf", vectorizer),
            ("clf", clf)
        ])
        t0 = time.time()
        pipeline.fit(X_train, y_train)
        duration = time.time() - t0
        print(f"Trained {name} in {duration:.3f}s")
        
        eval_result = evaluate_model(name, pipeline, X_test, y_test, classes)
        results.append(eval_result)
        
    # Pick the best model based on F1-macro and Accuracy
    best = max(results, key=lambda r: (r["f1_macro"], r["accuracy"]))
    print(f"\n>> Selected Best Model: {best['name']} (Accuracy: {best['accuracy']*100:.2f}%, F1-macro: {best['f1_macro']:.4f})")
    
    print(f"[5/5] Exporting model to {PIPELINE_PATH}...")
    joblib.dump(best["pipeline"], PIPELINE_PATH)
    
    metadata = {
        "model_name": best["name"],
        "accuracy": best["accuracy"],
        "f1_macro": best["f1_macro"],
        "classes": classes,
        "sample_count": len(X),
        "train_count": len(X_train),
        "test_count": len(X_test),
        "metrics_per_class": {
            cls: {
                "precision": best["report"][cls]["precision"],
                "recall": best["report"][cls]["recall"],
                "f1_score": best["report"][cls]["f1-score"]
            }
            for cls in classes
        },
        "trained_at": datetime.utcnow().isoformat() + "Z",
        "version": "1.0.0"
    }
    
    with open(METADATA_PATH, "w", encoding="utf-8") as f:
        json.dump(metadata, f, indent=2)
        
    print(f"Saved metadata to {METADATA_PATH}")
    print("Training pipeline finished successfully!")
    return best["pipeline"], metadata

if __name__ == "__main__":
    train_and_export()
