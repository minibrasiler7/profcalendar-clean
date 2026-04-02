from flask import Blueprint, render_template, redirect, url_for, flash, request, jsonify, current_app
from flask_login import login_required, current_user
from extensions import db
from models.exercise import Exercise, ExerciseBlock, ExerciseFolder
from models.exercise_progress import ExercisePublication, StudentExerciseAttempt, StudentBlockAnswer
from models.rpg import StudentRPGProfile, Badge, StudentBadge
from models.classroom import Classroom
from models.user import User
from datetime import datetime
from routes import teacher_required

exercises_bp = Blueprint('exercises', __name__, url_prefix='/exercises')


@exercises_bp.route('/')
@login_required
@teacher_required
def index():
    """Liste des exercices de l'enseignant - Two-panel layout"""
    # All exercises (for left panel - unorganized ones)
    exercises = Exercise.query.filter_by(user_id=current_user.id)\
        .order_by(Exercise.updated_at.desc()).all()

    # Unorganized exercises (no folder assigned)
    unorganized = [ex for ex in exercises if ex.exercise_folder_id is None]

    # Root-level folders (for right panel)
    root_folders = ExerciseFolder.query.filter_by(
        user_id=current_user.id, parent_id=None
    ).order_by(ExerciseFolder.name).all()

    # RÃ©cupÃ©rer les classes de l'enseignant pour le filtre
    classrooms = Classroom.query.filter_by(user_id=current_user.id).all()

    return render_template('exercises/list.html',
                           exercises=exercises,
                           unorganized=unorganized,
                           folders=root_folders,
                           classrooms=classrooms)


@exercises_bp.route('/api/')
@exercises_bp.route('/api/create', methods=['POST'])
@login_required
@teacher_required
def create_exercise():
    data = request.get_json()
    folder_id = data.get('folder_id')
    exercise = Exercise(
        user_id=current_user.id,
        title=data.get('title', 'No title'),
        description=data.get('description', ''),
        exercise_folder_id=folder_id if folder_id != 'null' else None
    )
    db.session.add(exercise)
    db.session.commit()
    ret{«76öæg²w7FGW2s¢w7V66W72rÂvWW&66Rs¢²vBs¢WW&66RæBÂwFFÆRs¢WW&66RçFFÆW×Ò ¤WW&66W5ö'ç&÷WFRrö÷WFFRóÆCârÂÖWFöG3Õ²uUBuÒ¤Æövå÷&WV&V@¤FV6W%÷&WV&V@¦FVbWFFUöWW&66RB ¢FFÒ&WVW7BævWEö§6öâ¢WW&66RÒWW&66RçVW'ævWBB¢bæ÷BWW&66R÷"WW&66RçW6W%öBÒ7W'&VçE÷W6W"æC ¢&WGW&â§6öæg²vW'&÷"s¢tWW&66Ræ÷Bf÷VæBFòWFFWÒÂC@¢WW&66RçFFÆRÒFFævWBwFFÆRrÂWW&66RçFFÆR¢WW&66RæFW67&FöâÒFFævWBvFW67&FöârÂWW&66RæFW67&Föâ¢WW&66RçWFFVEöBÒFFWFÖRææ÷r¢F"ç6W76öâæ6öÖÖB¢&WGW&â§6öæg²w7FGW2s¢w7V66W72rÂvWW&66Rs¢²vBs¢WW&66RæBÂwFFÆRs¢WW&66RçFFÆW×Ò ¤WW&66W5ö'ç&÷WFRrööFVÆWFRóÆCârÂÖWFöG3Õ²tDTÄUDRuÒ¤Æövå÷&WV&V@¤FV6W%÷&WV&V@¦FVbFVÆWFUöWW&66RB ¢WW&66RÒWW&66RçVW'ævWBB¢bæ÷BWW&66R÷"WW&66RçW6W%öBÒ7W'&VçE÷W6W"æC ¢&WGW&â§6öæg²vW'&÷"s¢tWW&66Ræ÷Bf÷VæBFòFVÆWFRwÒÂC@¢F"ç6W76öâæFVÆWFRWW&66R¢F"ç6W76öâæ6öÖÖB¢&WGW&â§6öæg²w7FGW2s¢w7V66W72wÒ  ¤WW&66W5ö'ç&÷WFRröö&Æö6²ö7&VFRrÂÖWFöG3Õ²uõ5BuÒ¤Æövå÷&WV&V@¤FV6W%÷&WV&V@¦FVb7&VFUöWW&66Uö&Æö6² ¢FFÒ&WVW7BævWEö§6öâ¢WW&66UöBÒFFævWBvWW&66UöBr¢WW&66RÒWW&66RçVW'ævWBWW&66UöB¢bæ÷BWW&66R÷"WW&66RçW6W%öBÒ7W'&VçE÷W6W"æC ¢&WGW&â§6öæg²vW'&÷"s¢tWW&66Ræ÷Bf÷VæBwÒÂC@ ¢&Æö6²ÒWW&66T&Æö6²¢WW&66UöCÖWW&66UöBÀ¢Ö6æUö6öFSÖFFævWBvÖ6æUö6öFRrÂrrÀ¢VævÆ6ö6öFSÖFFævWBvVævÆ6ö6öFRrÂrrÀ¢÷&FW#ÖFFævWBv÷&FW"rÂ¢¢F"ç6W76öâæFB&Æö6²¢F"ç6W76öâæ6öÖÖB¢&WGW&â§6öæg²xÝ]\ÉÎ	ÜÝXØÙ\ÜÉË	ØØÚÉÎÉÚY	ÎØÚËY	Ù^\Ú\ÙWÚY	ÎØÚË^\Ú\ÙWÚY_JB^\Ú\Ù\×ØÝ]J	ËØ\KØØÚËÝ\]KÏYËY]ÙÏVÉÔU	×JBÙÚ[Ü\]Z\YXXÚ\Ü\]Z\YY\]WÙ^\Ú\ÙWØØÚÊY
N]HH\]Y\ÝÙ]ÚÛÛ
BØÚÈH^\Ú\ÙPØÚË]Y\KÙ]
Y
BYÝØÚÎ]\ÛÛYJÉÙ\ÜÎ	ÐØÚÈÝÝ[È\]IßJK^\Ú\ÙHHØÚË^\Ú\ÙBY^\Ú\ÙK\Ù\ÚYOHÝ\[Ý\Ù\Y]\ÛÛYJÉÙ\ÜÎ	ÐXØÙ\ÜÈ[YY	ßJKÂØÚËXXÚ[WØÛÙHH]KÙ]
	ÛXXÚ[WØÛÙIËØÚËXXÚ[WØÛÙJBØÚË[Û\ÚØÛÙHH]KÙ]
	Ù[Û\ÚØÛÙIËØÚË[Û\ÚØÛÙJBØÚËÜ\H]KÙ]
	ÛÜ\ËØÚËÜ\BÙ\ÜÚ[ÛÛÛ[Z]

B]\ÛÛYJÉÜÝ]\ÉÎ	ÜÝXØØÙ\ÜÉË	ØØÚÉÎÉÚY	ÎØÚËY	Ù^\Ú\ÙWÚY	ÎØÚË^\Ú\ÙWÚY_JB^\Ú\Ù\×ØÝ]J	ËØ\KØØÚËÙ[]KÏYËY]ÙÏVÉÑSUI×JBÙÚ[Ü\]Z\YXXÚ\Ü\]Z\YY[]WÙ^\Ú\ÙWØØÚÊY
NØÚÈH^\Ú\ÙPØÚË]Y\KÙ]
Y
BYÝØÚÎ]\ÛÛYJÉÙ\ÜÎ	ÐØÚÈÝÝ[È[]IßJK^\Ú\ÙHHØÚË^\Ú\ÙBY^\Ú\ÙK\Ù\ÚYOHÝ\[Ý\Ù\Y]\ÛÛYJÉÙ\ÜÎ	ÐXØÙ\ÜÈ[YY	ßJKÂÙ\ÜÚ[Û[]JØÚÊBÙ\ÜÚ[ÛÛÛ[Z]

B]\ÛÛYJÉÜÝ]\ÉÎ	ÜÝXØÙ\ÜÉßJB^\Ú\Ù\×ØÝ]J	ËØ\KØØÚËÛ\ÝÏYÊBÙÚ[Ü\]Z\YXXÚ\Ü\]Z\YYÙ]Ù^\Ú\ÙWØØÚÜÊY
N^\Ú\ÙHH^\Ú\ÙK]Y\KÙ]
Y
BYÝ^\Ú\ÙHÜ^\Ú\ÙK\Ù\ÚYOHÝ\[Ý\Ù\Y]\ÛÛYJÉÙ\ÜÎ	Ñ^\Ú\ÙHÝÝ[	ßJKØÚÜÈH^\Ú\ÙPØÚË]Y\K[\ØJ^\Ú\ÙWÚYZY
KÜ\ØJB^\Ú\ÙPØÚËÜ\
K[

BØÚÜ×Ù]HHÂ×	ÚY	ÎY	ÛXXÚ[WØÛÙIÎXXÚ[WØÛÙK	Ù[Û\ÚØÛÙIÎ[Û\ÚØÛÙK	ÛÜ\ÎÜ\HÜ[ØÚÜÂB]\ÛÛYJÉØØÚÜÉÎØÚÜ×Ù]_JB^\Ú\Ù\×ØÝ]J	ËØ\KÙÛ\ØÜX]IËY]ÙÏVÉÔÔÕ	×JBÙÚ[Ü\]Z\YXXÚ\Ü\]Z\YYÜX]WÙ^\Ú\ÙWÙÛ\
N]HH\]Y\ÝÙ]ÚÛÛ
B\[ÚYH]KÙ]
	Ü\[ÚY	ÊBÛ\H^\Ú\ÙQÛ\\Ù\ÚYXÝ\[Ý\Ù\Y[YOY]KÙ]
	Û[YIË	Ó]ÈÛ\ÊK\[ÚY\\[ÚYY\[ÚYOH	Û[	È[ÙHÛB
BÙ\ÜÚ[ÛY
Û\BÙ\ÜÚ[ÛÛÛ[Z]

B]\ÛÛYJÉÜÝ]\ÉÎ	ÜÝXØÙ\ÜÉË	ÙÛ\ÎÉÚY	ÎÛ\Y	Û[YIÎÛ\[Y__JB