// src/services/file.service.ts
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { FileFilterCallback } from 'multer'; // Importer les types multer si besoin
import { AppError } from '../errors/app.errors';

// Configuration (Mieux dans des variables d'env)
const UPLOAD_DIR = path.resolve(__dirname, '../../public/uploads/profile-pictures'); // Chemin absolu vers le dossier d'upload
const MAX_FILE_SIZE_MB = 5; // Limite de taille en Mo
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const BASE_URL_PATH = '/uploads/profile-pictures'; // Chemin URL public

export class FileService {

    constructor() {
        this.ensureUploadDirExists(); // Créer le dossier au démarrage si absent
    }

    private async ensureUploadDirExists(): Promise<void> {
        try {
            await fs.access(UPLOAD_DIR);
        } catch (error) {
            console.log(`Upload directory ${UPLOAD_DIR} does not exist, creating...`);
            try {
                await fs.mkdir(UPLOAD_DIR, { recursive: true });
                console.log(`Upload directory created successfully.`);
            } catch (mkdirError) {
                console.error(`FATAL: Could not create upload directory ${UPLOAD_DIR}`, mkdirError);
                // Peut-être arrêter le serveur si le dossier est essentiel
                process.exit(1);
            }
        }
    }

    // Filtre pour multer (vérifie type et taille)
    public static fileFilter = (req: Express.Request, file: Express.Multer.File, cb: FileFilterCallback): void => {
        if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
            // Rejeter le fichier avec une erreur spécifique
            cb(new AppError('InvalidFileType', 400, `Invalid file type. Allowed types: ${ALLOWED_MIME_TYPES.join(', ')}`));
        } else {
            // Accepter le fichier
            cb(null, true);
        }
        // La taille est vérifiée par l'option 'limits' de multer
    };

    // Fonction pour sauvegarder une nouvelle image de profil
    async saveProfilePicture(file: Express.Multer.File, oldPictureUrl?: string | null): Promise<string> {
        if (oldPictureUrl) {
            await this.deleteFileByUrl(oldPictureUrl);
        }

        const fileExtension = path.extname(file.originalname);
        const uniqueSuffix = crypto.randomBytes(16).toString('hex');
        const newFilename = `${uniqueSuffix}${fileExtension}`;
        const newFilePath = path.join(UPLOAD_DIR, newFilename);

        try {
            await fs.writeFile(newFilePath, file.buffer);
        } catch (error) {
            console.error("Error saving uploaded file:", error);
            throw new AppError('FileUploadError', 500, 'Could not save the uploaded file.');
        }

        const publicUrl = `${BASE_URL_PATH}/${newFilename}`;
        console.log(`Saved new profile picture: ${publicUrl}`);
        return publicUrl;
    }

    async deleteFileByUrl(fileUrl: string | null | undefined): Promise<void> {
        if (!fileUrl || !fileUrl.startsWith(BASE_URL_PATH)) {
            console.warn(`Skipping deletion of invalid or non-managed URL: ${fileUrl}`);
            return;
        }

        try {
            const filename = path.basename(fileUrl);
            const filePath = path.join(UPLOAD_DIR, filename);

            console.log(`Attempting to delete file: ${filePath}`);
            await fs.unlink(filePath);
            console.log(`Successfully deleted file: ${filePath}`);
        } catch (error: any) {
            if (error.code === 'ENOENT') {
                console.warn(`File not found for deletion (already deleted?): ${fileUrl}`);
            } else {
                console.error(`Error deleting file for URL ${fileUrl}:`, error);
            }
        }
    }

    // Options Multer pour les contrôleurs
    public get multerOptions() {
        return {
            fileFilter: FileService.fileFilter,
            limits: { fileSize: MAX_FILE_SIZE_MB * 1024 * 1024 }
        };
    }
}

export const fileService = new FileService();