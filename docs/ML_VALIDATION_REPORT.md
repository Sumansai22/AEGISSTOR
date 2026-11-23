# AEGISSTOR – Machine Learning Validation and Forecasting Report

**Date:** November 17, 2026  
**Auditor:** Machine Learning Engineer & Systems Performance Analyst  
**Scope:** Time-Series Forecasting, Chronological Split, Uncertainty Modeling, Growth Patterns, Anomaly Detection & Model Persistence  
**Status:** PASS – Validated against Real & Calibrated Storage Histories

---

## 1. Machine Learning Forecasting Architecture

The AEGISSTOR ML Engine (`backend/app/ml/engine.py`) provides intelligent storage forecasting and capacity exhaustion calculations. It avoids reliance on black-box external cloud APIs and executes entirely on the local system using Scikit-Learn, LightGBM, Pandas, and NumPy.

```
+-----------------------------------------------------------------+
|                    Raw Storage Telemetry                        |
|  - Timestamps, used_bytes, total_bytes, I/O rates               |
+-------------------------------+---------------------------------+
                                |
                                v
+-----------------------------------------------------------------+
|                   Feature Engineering                           |
|  - hour_of_day, day_of_week, day_of_month, day_index            |
|  - lag_1h, lag_6h, lag_24h, rolling_mean_24h, rolling_std_24h   |
+-------------------------------+---------------------------------+
                                |
                                v
+-----------------------------------------------------------------+
|               Multi-Model Tournament Evaluation                 |
|  1. LightGBM (Gradient Boosted Trees)                           |
|  2. Random Forest Regressor (Ensemble Trees)                    |
|  3. Ridge Linear Regression (L2 Regularized Trend)              |
|  4. Moving Average Baseline (7-Day Rolling Trend)               |
+-------------------------------+---------------------------------+
                                |
                                v
+-----------------------------------------------------------------+
|                      Evaluation & Selection                     |
|  - Chronological 80/20 Train/Test Split (No Data Leakage)       |
|  - Metrics: MAE (GB), RMSE (GB), MAPE (%)                       |
|  - Selection of Best Performing Model Instance                  |
+-------------------------------+---------------------------------+
                                |
                                v
+-----------------------------------------------------------------+
|                     Inference & Delivery                        |
|  - Forecast: 7-day, 14-day, 30-day, 90-day projections          |
|  - Dynamic Uncertainty Intervals (+/- 1.96 * sigma * sqrt(days))|
|  - Capacity Runway Thresholds (70%, 80%, 90%, 95%, 100%)       |
|  - Joblib Artifact Persistence to disk (models/<drive>_<algo>)  |
+-----------------------------------------------------------------+
```

---

## 2. Validation of Chronological Separation & Data Leakage Prevention

### 2.1 The Requirement
In time-series forecasting, standard randomized $k$-fold cross-validation or random train-test splitting introduces lookahead bias (training on future data to predict the past). AEGISSTOR strictly enforces temporal ordering.

### 2.2 Implementation
```python
# Chronological 80/20 train/test split (backend/app/ml/engine.py)
split_idx = int(len(X) * 0.8)
X_train, X_test = X.iloc[:split_idx], X.iloc[split_idx:]
y_train, y_test = y.iloc[:split_idx], y.iloc[split_idx:]
```
- The oldest 80% of chronological observations form the training set.
- The latest 20% form the evaluation test set.
- Future observations are never seen by any model during training.
- Verified in `test_ml_chronological_validation_and_models`: all tournament models train cleanly, reporting authentic non-negative MAE, RMSE, and MAPE scores.

---

## 3. Forecast Uncertainty Formulation

Capacity forecasts are non-deterministic; uncertainty increases with projection horizon. AEGISSTOR implements expanding confidence intervals based on residual standard deviation $\sigma$:

$$\text{Lower Bound}(t) = \hat{y}(t) - 1.96 \cdot \sigma \cdot \sqrt{\Delta t}$$
$$\text{Upper Bound}(t) = \hat{y}(t) + 1.96 \cdot \sigma \cdot \sqrt{\Delta t}$$

Where:
- $\hat{y}(t)$ is the point prediction at day $\Delta t$.
- $\sigma$ is the historical standard deviation of residuals.
- $\sqrt{\Delta t}$ scales the uncertainty interval realistically over 7, 14, 30, and 90-day horizons.
- Predictions and bounds are capped at $0$ on the low end and drive capacity on the high end.

---

## 4. Storage Growth Pattern Analysis

Capacity runway calculations were evaluated against three distinct enterprise storage profiles in `test_storage_growth_patterns`:

### 4.1 Rapid Growth Pattern (+5 GB/Day, Current: 350 GB / 500 GB)
- **70% Used Threshold:** Already reached.
- **80% Used Threshold (400 GB):** 10.0 days remaining ($\pm 0.1$ day).
- **90% Used Threshold (450 GB):** 20.0 days remaining.
- **100% Exhaustion (500 GB):** 30.0 days remaining.
- **Status:** `CRITICAL_RUNWAY` warning generated.

### 4.2 Stable Usage Pattern (0.0 GB/Day Growth)
- Days to thresholds: `None`.
- Calendar dates: `"Safe / Zero Consumption Growth"`.
- Runway status: `HEALTHY`.

### 4.3 Declining Usage Pattern (-2.0 GB/Day Growth)
- Days to thresholds: `None`.
- Calendar dates: `"Negative Growth (Storage Reclaimed)"`.
- Daily growth rate: $-2.0$ GB/day.
- Runway status: `OPTIMAL`.

---

## 5. Model Persistence & Retraining

- **Persistence:** Trained models are serialized to disk using `joblib` in the `models/` directory:
  `models/{drive_id}_{algorithm}.joblib`
- **Reusability:** If a persisted model exists and telemetry has not changed significantly, `load_model()` retrieves the pre-trained weights for sub-millisecond inference.
- **Retraining:** Retraining triggers automatically when new telemetry records exceed calibration thresholds or when explicitly requested via `POST /api/v1/forecast/retrain`.
- Verified in `test_ml_model_persistence`: saved models were successfully reloaded and executed predictions identical to the original instances.

---

## 6. Anomaly Detection & Insufficient Data Handling

- **Isolation Forest:** Multi-variate anomaly detection evaluates consumption jumps, anomalous write spikes, and disk I/O anomalies.
- **Insufficient Data Guard:** If telemetry records are fewer than 8 data points, `detect_anomalies()` safely returns an empty list `[]` instead of raising exceptions or outputting misleading anomalies.
- Verified in `test_insufficient_data_handling`.
