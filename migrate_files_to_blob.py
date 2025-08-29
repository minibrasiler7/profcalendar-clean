#!/usr/bin/env python3
"""
Script de migration pour convertir les fichiers physiques en stockage BLOB
"""

import os
import sys
from flask import Flask
from extensions import db
from models.student import ClassFile
from models.file_manager import UserFile

def create_app():
    """Créer l'application Flask pour la migration"""
    app = Flask(__name__)
    
    # Configuration de base (même que config.py)
    basedir = os.path.abspath(os.path.dirname(__file__))
    app.config['SQLALCHEMY_DATABASE_URI'] = os.environ.get('DATABASE_URL') or \
        'sqlite:///' + os.path.join(basedir, 'database', 'teacher_planner.db')
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
    
    # Initialiser l'extension
    db.init_app(app)
    
    return app

def migrate_class_files():
    """Migrer les fichiers de classe vers le stockage BLOB"""
    print("🔄 Migration des fichiers de classe...")
    
    class_files = ClassFile.query.all()
    print(f"📊 Total class files found: {len(class_files)}")
    
    migrated_count = 0
    error_count = 0
    already_migrated = 0
    
    for class_file in class_files:
        try:
            # Ignorer si déjà migré
            if class_file.file_content:
                already_migrated += 1
                continue
            
            print(f"🔍 Processing file {class_file.id}: {class_file.original_filename}")
            
            # Construire le chemin du fichier physique
            file_path = os.path.join(
                'uploads', 'class_files', 
                str(class_file.classroom_id), 
                class_file.filename
            )
            
            if os.path.exists(file_path):
                # Lire le contenu du fichier
                with open(file_path, 'rb') as f:
                    file_content = f.read()
                
                # Déterminer le type MIME
                mime_type = 'application/octet-stream'
                if class_file.file_type == 'pdf':
                    mime_type = 'application/pdf'
                elif class_file.file_type in ['jpg', 'jpeg']:
                    mime_type = 'image/jpeg'
                elif class_file.file_type == 'png':
                    mime_type = 'image/png'
                
                # Mettre à jour le fichier avec le contenu BLOB
                class_file.file_content = file_content
                class_file.mime_type = mime_type
                
                migrated_count += 1
                print(f"✅ {class_file.original_filename} -> BLOB")
                
            else:
                print(f"⚠️  Fichier physique introuvable: {file_path}")
                error_count += 1
                
        except Exception as e:
            print(f"❌ Erreur pour {class_file.original_filename}: {e}")
            error_count += 1
    
    # Sauvegarder les changements
    try:
        db.session.commit()
        print(f"🎉 Migration class files terminée: {migrated_count} fichiers migrés, {already_migrated} déjà migrés, {error_count} erreurs")
    except Exception as e:
        db.session.rollback()
        print(f"❌ Erreur lors de la sauvegarde: {e}")

def migrate_user_files():
    """Migrer les fichiers utilisateur vers le stockage BLOB"""
    print("🔄 Migration des fichiers utilisateur...")
    
    user_files = UserFile.query.all()
    print(f"📊 Total user files found: {len(user_files)}")
    
    migrated_count = 0
    error_count = 0
    already_migrated = 0
    
    for user_file in user_files:
        try:
            # Ignorer si déjà migré
            if user_file.file_content:
                already_migrated += 1
                continue
            
            print(f"🔍 Processing user file {user_file.id}: {user_file.original_filename}")
            
            # Construire le chemin du fichier physique
            file_path = user_file.get_file_path()
            
            if os.path.exists(file_path):
                # Lire le contenu du fichier principal
                with open(file_path, 'rb') as f:
                    file_content = f.read()
                
                user_file.file_content = file_content
                
                # Migrer aussi la miniature si elle existe
                thumbnail_path = user_file.get_thumbnail_path()
                if thumbnail_path and os.path.exists(thumbnail_path):
                    with open(thumbnail_path, 'rb') as f:
                        thumbnail_content = f.read()
                    user_file.thumbnail_content = thumbnail_content
                
                migrated_count += 1
                print(f"✅ {user_file.original_filename} -> BLOB")
                
            else:
                print(f"⚠️  Fichier physique introuvable: {file_path}")
                error_count += 1
                
        except Exception as e:
            print(f"❌ Erreur pour {user_file.original_filename}: {e}")
            error_count += 1
    
    # Sauvegarder les changements
    try:
        db.session.commit()
        print(f"🎉 Migration user files terminée: {migrated_count} fichiers migrés, {already_migrated} déjà migrés, {error_count} erreurs")
    except Exception as e:
        db.session.rollback()
        print(f"❌ Erreur lors de la sauvegarde: {e}")

def ensure_database_schema():
    """S'assurer que toutes les tables et colonnes existent"""
    print("🔄 Vérification du schéma de base de données...")
    
    try:
        # Créer toutes les tables si elles n'existent pas
        db.create_all()
        
        # Vérifier si les colonnes existent avant de les ajouter
        from sqlalchemy import text, inspect
        
        inspector = inspect(db.engine)
        
        # Déterminer le type de base de données pour choisir le bon type BLOB
        db_type = db.engine.dialect.name
        blob_type = "BYTEA" if db_type == "postgresql" else "BLOB"
        print(f"🔍 Base de données détectée: {db_type}, utilisant le type: {blob_type}")
        
        # Vérifier les colonnes pour class_files
        if 'class_files' in inspector.get_table_names():
            columns = [col['name'] for col in inspector.get_columns('class_files')]
            
            if 'file_content' not in columns:
                db.session.execute(text(f"ALTER TABLE class_files ADD COLUMN file_content {blob_type}"))
                print("✅ Colonne file_content ajoutée à class_files")
            
            if 'mime_type' not in columns:
                db.session.execute(text("ALTER TABLE class_files ADD COLUMN mime_type VARCHAR(100)"))
                print("✅ Colonne mime_type ajoutée à class_files")
        
        # Vérifier les colonnes pour user_files
        if 'user_files' in inspector.get_table_names():
            columns = [col['name'] for col in inspector.get_columns('user_files')]
            
            if 'file_content' not in columns:
                db.session.execute(text(f"ALTER TABLE user_files ADD COLUMN file_content {blob_type}"))
                print("✅ Colonne file_content ajoutée à user_files")
            
            if 'thumbnail_content' not in columns:
                db.session.execute(text(f"ALTER TABLE user_files ADD COLUMN thumbnail_content {blob_type}"))
                print("✅ Colonne thumbnail_content ajoutée à user_files")
        
        db.session.commit()
        print("✅ Schéma de base de données vérifié")
        
    except Exception as e:
        db.session.rollback()
        print(f"❌ Erreur lors de la vérification du schéma: {e}")

if __name__ == '__main__':
    app = create_app()
    
    with app.app_context():
        print("🚀 Début de la migration vers le stockage BLOB")
        
        # Étape 1: Vérifier le schéma de base de données
        ensure_database_schema()
        
        # Étape 2: Migrer les fichiers de classe
        migrate_class_files()
        
        # Étape 3: Migrer les fichiers utilisateur
        migrate_user_files()
        
        print("🎉 Migration terminée!")