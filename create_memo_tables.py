"""Script pour créer les tables lesson_memos et student_remarks"""
from app import create_app
from extensions import db
from models.lesson_memo import LessonMemo, StudentRemark

app = create_app()

with app.app_context():
    # Créer les tables
    db.create_all()
    print("✅ Tables lesson_memos et student_remarks créées avec succès!")
