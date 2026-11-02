# Viva notes: EduTrack

Read this until you can say each answer in your own words. Open the app while you practise.

## The project in 30 seconds

> EduTrack is an Android app for faculty. It stores student attendance and marks, shows averages and trends, and flags students below minimums the faculty set. A machine-learning model also estimates whether a student's final result will be At Risk, Average or Good, and shows the factors behind that estimate. We tested it on data it had not seen, including real students from a public dataset. It over-flags, so we use it to decide who to talk to first, never to judge a student.

## 5-minute demo

1. **Home:** show the student count, the estimated categories and the early-warning list.
2. **Open an At Risk student:** show the estimate, factors, suggested support and charts.
3. **Review or correct data:** change a mark, enter a reason and PIN `1234`. Point out that the estimate updates.
4. **Data > Correction history:** show that the change was recorded.
5. **Class tab:** show subject averages, then change the attendance minimum and watch the list change.
6. **Class report (PDF):** generate it.
7. **Model tab:** finish on the test results and limitations. This is the strongest part of the project.

## Key concepts in plain words

- **Machine learning:** the program learns a pattern from past examples rather than from rules we write.
- **Logistic regression:** gives each input a weight, adds them up for each category, and converts the totals into probabilities. We chose it because its weights can be explained, and it scored as well as the random forest.
- **Train/test split:** the model learns from 80% of the records. The other 20% are hidden and used only for testing, like an exam with unseen questions.
- **Baseline:** a "model" that always guesses the most common category. A real model must beat it.
- **Accuracy:** the share of all estimates that were correct.
- **Recall (At Risk):** of the students truly at risk, how many did we find?
- **Precision (At Risk):** of the students we flagged, how many were truly at risk?
- **F1-score:** one number that balances precision and recall.
- **Confusion matrix:** a table of actual versus estimated categories, showing exactly where the model goes wrong.
- **Data leakage:** letting the model see the answer. We leave out this semester's exam marks because they are what we are estimating.

## Our results

Every score below comes from data the model did not train on.

| Test | Accuracy | Macro F1 | At Risk recall | At Risk precision |
|---|---|---|---|---|
| Simulated test set (400 students), logistic regression | 91.7% | 0.92 | 96% | 87% |
| Simulated test set, random forest | 89.2% | 0.90 | 94% | 88% |
| Simulated test set, always guess the most common | 49.0% | 0.22 | 0% | 0% |
| Same method trained on real UCI students (130 tested) | 82.3% | 0.82 | 90% | 69% |
| App's model on all 649 real UCI students | 70.7% | 0.71 | 99% | 44% |
| Same 649 students, always guess the most common | 54.7% | 0.24 | 0% | 0% |

**The number to trust most is 70.7%, not 91.7%.** The 91.7% mostly shows the model learned the pattern we simulated. The 70.7% is the app's model tested on real students it had never seen. It finds 99% of struggling students, but 56% of its flags are false alarms.

## Likely viva questions

**Why is the data synthetic?**
Real student records need authorisation and privacy safeguards, which the brief also points out. We simulated VTU-style records for the app and tested the method on a real public dataset.

**Is 91.7% accuracy good?**
It is not strong evidence, because we created the pattern ourselves. The real-student results are more honest.

**Why does the model use only four inputs?**
Attendance, internal marks, previous marks and backlogs are all available before the exam, and faculty already have them.

**Why does attendance barely affect the estimate?**
Internal marks already carry most of the signal, so attendance adds little on top. This is an association, and does not mean attendance is unimportant. The app still flags low attendance using its own minimum.

**Why balance the classes?**
Missing a struggling student costs more than a false alarm, so we set `class_weight="balanced"`. This raises recall and lowers precision.

**How does Python's model run on the phone?**
We train it in Python, export the weights to a JSON file, and recalculate the same formula in JavaScript. The Model tab confirms that 8 of 8 test students match scikit-learn's answers.

**How are the factors calculated?**
For each input: weight × how far the student's value is from the training average. Larger results influence the estimate more. These show association, not cause.

**What are the limitations?**
It was not trained on real MVIT or VTU students. The UCI students are Portuguese school students. We assumed 180 school days when converting absences to a percentage. The model cannot see health, finances or family events, and fairness across student groups has not been tested.

**How would you improve it?**
Get authorised records from the college, retrain, test on a later batch of students, check fairness across groups, and add a secure server login so several faculty can share data.

**Where is the data stored? Is it secure?**
In a SQLite database on the phone, in the app's private storage. The PIN stops accidental edits, but it is not strong security. A real deployment needs proper logins and encryption.

**Why not Streamlit, as suggested?**
Our guide asked for a mobile application, and Streamlit needs a running server. Capacitor packages the interface as an Android app that works offline.

**What is VTU-style marking here?**
Internal marks out of 50 and exam marks scaled to 50. A pass needs at least 20/50 internal, 18/50 exam and 40/100 total. Check these against your scheme's current rules, as schemes change.

## Be ready to say honestly

Know who did what. This code was written with an AI assistant, so tell your guide if asked, and check your department's rules on AI use. Being able to explain the results above matters more than remembering the code.
