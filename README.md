# EduTrack: Student Academic Performance Analysis System

An Android app that analyses student records, flags students who may need support, and estimates a performance category with a machine-learning model. Everything runs on the phone, so no internet or server is needed.

## Get the app on your phone

The APK is built on GitHub's free cloud computers, because Android Studio needs far more disk space than this laptop has free.

1. Sign in at [github.com](https://github.com) and create a new **private** repository named `edutrack`. Leave it empty.
2. Upload this project to it (Claude can run this step for you).
3. Open the repository's **Actions** tab and wait for "Build Android APK" to show a green tick, usually 5 to 10 minutes.
4. Open that run and download **EduTrack-APK** under Artifacts. It arrives as a zip containing `app-debug.apk`.
5. Copy the APK to an Android phone, open it, and allow "Install unknown apps" when asked.

**Editing PIN:** `1234`. Change it from Data > Change PIN.

## Preview on the laptop

```bash
python -m http.server 5173 --directory www
```

Then open http://localhost:5173 in a browser.

## How the project meets the brief

| Requirement | Where it is in the app |
|---|---|
| CSV import or manual entry | Data tab |
| Student, subject, attendance, internal and exam records | SQLite database (`www/js/db.js`) |
| Subject-wise averages and overall performance | Class tab and student page |
| Attendance, marks and semester charts | Class tab and student page |
| Configurable thresholds | Class tab > Minimum thresholds |
| ML prediction of a performance category | Student page > Estimated category |
| Factors behind the prediction | Student page > Factors linked to this estimate |
| Student and class reports | PDF buttons on the student page and Class tab |
| Faculty review and correction | Student page > Review or correct data, with PIN and history |
| Model evaluation and limitations | Model tab |
| Optional: early-warning dashboard with actions | Home tab and Suggested support |

## Technology

| Component | Used | Note |
|---|---|---|
| Language | Python for ML, JavaScript for the app | Android apps cannot run scikit-learn directly |
| Data processing | pandas, NumPy | `ml/` |
| Machine learning | scikit-learn logistic regression | Trained on the laptop, then exported to `www/data/model.json` |
| Interface | HTML, CSS and JavaScript in Capacitor | Packaged as an Android app |
| Database | SQLite through sql.js | Stored on the phone |
| Charts | Chart.js | Works offline on a phone |

## Folders

- `ml/` - data generator, training script and the UCI dataset
- `www/` - the app itself
- `.github/workflows/build-apk.yml` - cloud APK build
- `VIVA_NOTES.md` - project explanation and likely viva questions

To retrain the model:

```bash
pip install -r ml/requirements.txt
```

```bash
python ml/generate_data.py
```

```bash
python ml/train_model.py
```

## Data sources

- **Simulated records:** created by `ml/generate_data.py`. All names and USNs are fictional.
- **UCI Student Performance dataset:** P. Cortez and A. Silva (2008), UCI Machine Learning Repository, licensed CC BY 4.0. Used only to test the method on real students.

Only use real student data with your institution's authorisation. The PIN protects against accidental edits, and is not strong security.
