# Importer tous les modèles pour qu'ils soient disponibles
from models.user import User, Holiday, Break
from models.classroom import Classroom
from models.schedule import Schedule
from models.planning import Planning
from models.student import Student, Grade, LegacyClassFile, Chapter, ClassroomChapter, StudentFile
from models.class_file import ClassFile
from models.student_info_history import StudentInfoHistory
from models.attendance import Attendance
from models.file_manager import FileFolder, UserFile, FileShare
from models.sanctions import SanctionTemplate, SanctionThreshold, SanctionOption, ClassroomSanctionImport, StudentSanctionRecord
from models.student_sanctions import StudentSanctionCount
from models.evaluation import Evaluation, EvaluationGrade
from models.seating_plan import SeatingPlan
from models.student_group import StudentGroup, StudentGroupMembership
from models.class_collaboration import ClassMaster, TeacherAccessCode, TeacherCollaboration, SharedClassroom, StudentClassroomLink
from models.teacher_invitation import TeacherInvitation
from models.invitation_classroom import InvitationClassroom
from models.classroom_access_code import ClassroomAccessCode
from models.file_sharing import StudentFileShare
from models.mixed_group import MixedGroup, MixedGroupStudent
from models.user_preferences import UserPreferences, UserSanctionPreferences
from models.accommodation import AccommodationTemplate, StudentAccommodation
from models.lesson_memo import LessonMemo, StudentRemark
from models.lesson_blank_sheet import LessonBlankSheet
from models.decoupage import Decoupage, DecoupagePeriod, DecoupageAssignment

__all__ = ['User', 'Holiday', 'Break', 'Classroom', 'Schedule', 'Planning',
           'Student', 'Grade', 'LegacyClassFile', 'ClassFile', 'Chapter', 'ClassroomChapter', 'StudentFile', 'StudentInfoHistory', 'Attendance', 'FileFolder', 'UserFile', 'FileShare',
           'SanctionTemplate', 'SanctionThreshold', 'SanctionOption', 'ClassroomSanctionImport', 'StudentSanctionRecord', 'StudentSanctionCount',
           'Evaluation', 'EvaluationGrade', 'SeatingPlan', 'StudentGroup', 'StudentGroupMembership',
           'ClassMaster', 'TeacherAccessCode', 'TeacherCollaboration', 'SharedClassroom', 'StudentClassroomLink', 'TeacherInvitation', 'InvitationClassroom',
           'ClassroomAccessCode', 'StudentFileShare', 'MixedGroup', 'MixedGroupStudent', 'UserPreferences', 'UserSanctionPreferences',
           'AccommodationTemplate', 'StudentAccommodation', 'LessonMemo', 'StudentRemark', 'LessonBlankSheet',
           'Decoupage', 'DecoupagePeriod', 'DecoupageAssignment']
