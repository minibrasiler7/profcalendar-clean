#!/usr/bin/env python3
"""
Script de diagnostic pour comprendre pourquoi les fichiers n'ont pas de contenu BLOB
"""

import os
import sys
from flask import Flask
from extensions import db
from models.student import ClassFile
from models.file_manager import UserFile

def create_app():
    """Créer l'application Flask pour le diagnostic"""
    app = Flask(__name__)
    
    # Configuration de base (même que config.py)
    basedir = os.path.abspath(os.path.dirname(__file__))
    app.config['SQLALCHEMY_DATABASE_URI'] = os.environ.get('DATABASE_URL') or \
        'sqlite:///' + os.path.join(basedir, 'database', 'teacher_planner.db')
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
    
    # Initialiser l'extension
    db.init_app(app)
    
    return app

def debug_blob_files():
    """Diagnostic des fichiers BLOB manquants"""
    print("🔍 Diagnostic des fichiers BLOB")
    
    # Analyser ClassFile
    print(f"\n📁 ClassFiles:")
    class_files = ClassFile.query.all()
    print(f"Total class files: {len(class_files)}")
    
    with_blob = 0
    without_blob = 0
    
    for class_file in class_files:
        if class_file.file_content:
            with_blob += 1
        else:
            without_blob += 1
            print(f"  - ID {class_file.id}: {class_file.original_filename} (uploaded: {class_file.uploaded_at}) - PAS DE BLOB")
            
            # Vérifier si le fichier physique existe
            file_path = os.path.join('uploads', 'class_files', str(class_file.classroom_id), class_file.filename)
            exists = os.path.exists(file_path)
            print(f"    Fichier physique: {file_path} - {'EXISTS' if exists else 'MISSING'}")
    
    print(f"📊 ClassFiles: {with_blob} avec BLOB, {without_blob} sans BLOB")
    
    # Analyser UserFile
    print(f"\n📁 UserFiles:")
    user_files = UserFile.query.all()
    print(f"Total user files: {len(user_files)}")
    
    user_with_blob = 0
    user_without_blob = 0
    
    for user_file in user_files:
        if user_file.file_content:
            user_with_blob += 1
        else:
            user_without_blob += 1
            print(f"  - ID {user_file.id}: {user_file.original_filename} (uploaded: {user_file.uploaded_at}) - PAS DE BLOB")
            
            # Vérifier si le fichier physique existe
            file_path = user_file.get_file_path()
            exists = os.path.exists(file_path)
            print(f"    Fichier physique: {file_path} - {'EXISTS' if exists else 'MISSING'}")
    
    print(f"📊 UserFiles: {user_with_blob} avec BLOB, {user_without_blob} sans BLOB")
    
    # Focus sur le fichier 283 mentionné dans les logs
    print(f"\n🎯 Focus sur ClassFile ID 283:")
    class_file_283 = ClassFile.query.get(283)
    if class_file_283:
        print(f"  - Filename: {class_file_283.original_filename}")
        print(f"  - Uploaded: {class_file_283.uploaded_at}")
        print(f"  - Has BLOB: {class_file_283.file_content is not None}")
        print(f"  - File size: {class_file_283.file_size}")
        print(f"  - MIME type: {class_file_283.mime_type}")
        
        file_path = os.path.join('uploads', 'class_files', str(class_file_283.classroom_id), class_file_283.filename)
        exists = os.path.exists(file_path)
        print(f"  - Physical file: {file_path} - {'EXISTS' if exists else 'MISSING'}")
        
        if exists:
            file_size = os.path.getsize(file_path)
            print(f"  - Physical file size: {file_size} bytes")
    else:
        print(f"  - ClassFile ID 283 not found!")

if __name__ == '__main__':
    app = create_app()
    
    with app.app_context():
        print("🚀 Début du diagnostic des fichiers BLOB")
        debug_blob_files()
        print("🎉 Diagnostic terminé!")