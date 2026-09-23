"""
Flask Microservice for CostKu Classical ML Transaction Category Classification.
Serves scikit-learn TF-IDF + Classifier pipeline.
"""

import os
import time
import json
import joblib
from flask import Flask, request, jsonify
from flask_cors import CORS

from train import PIPELINE_PATH, METADATA_PATH, train_and_export

app = Flask(__name__)
CORS(app)

START_TIME = time.time()
PIPELINE = None
METADATA = None

def load_or_train_pipeline():
    global PIPELINE, METADATA
    if os.path.exists(PIPELINE_PATH) and os.path.exists(METADATA_PATH):
        try:
            PIPELINE = joblib.load(PIPELINE_PATH)
            with open(METADATA_PATH, "r", encoding="utf-8") as f:
                METADATA = json.load(f)
            print(f"[ML Service] Loaded pre-trained model: {METADATA.get('model_name')}")
            return
        except Exception as e:
            print(f"[ML Service] Error loading model: {e}. Retraining...")
    
    print("[ML Service] Model not found. Initiating training...")
    PIPELINE, METADATA = train_and_export()

# Load model upon initialization
load_or_train_pipeline()

@app.route("/health", methods=["GET"])
def health():
    uptime_sec = round(time.time() - START_TIME, 2)
    return jsonify({
        "status": "ok",
        "service": "costKu ML Classification Service",
        "uptime_seconds": uptime_sec,
        "model_loaded": PIPELINE is not None,
        "metadata": METADATA
    }), 200

@app.route("/predict", methods=["POST"])
def predict():
    if PIPELINE is None:
        return jsonify({
            "error": "Model not loaded",
            "extraction_method": "rule_based"
        }), 503

    payload = request.get_json(silent=True) or {}
    text = payload.get("text") or payload.get("raw_text") or ""
    
    if not isinstance(text, str) or not text.strip():
        return jsonify({
            "error": "Missing or empty 'text' field",
            "status": "error"
        }), 400

    clean_text = text.strip()
    
    try:
        # Predict class
        predicted_class = PIPELINE.predict([clean_text])[0]
        
        # Calculate probabilities and confidence
        classes = list(PIPELINE.classes_)
        probabilities = {}
        confidence = 0.5
        
        if hasattr(PIPELINE, "predict_proba"):
            probs = PIPELINE.predict_proba([clean_text])[0]
            for cls_name, prob in zip(classes, probs):
                probabilities[cls_name] = round(float(prob), 4)
            confidence = probabilities.get(predicted_class, 0.5)
        else:
            confidence = 0.85
            
        return jsonify({
            "category": predicted_class,
            "confidence": round(float(confidence), 4),
            "probabilities": probabilities,
            "extraction_method": "ml_model",
            "model_version": METADATA.get("version", "1.0.0") if METADATA else "1.0.0",
            "text": clean_text
        }), 200
        
    except Exception as err:
        return jsonify({
            "error": f"Prediction failed: {str(err)}",
            "extraction_method": "rule_based"
        }), 500

@app.route("/retrain", methods=["POST"])
def retrain():
    global PIPELINE, METADATA
    try:
        PIPELINE, METADATA = train_and_export()
        return jsonify({
            "status": "success",
            "message": "Model retrained successfully",
            "metadata": METADATA
        }), 200
    except Exception as err:
        return jsonify({
            "status": "error",
            "error": f"Retraining failed: {str(err)}"
        }), 500

if __name__ == "__main__":
    port = int(os.getenv("PORT", 5001))
    print(f"[ML Service] Starting Flask app on port {port}...")
    app.run(host="0.0.0.0", port=port, debug=False)
