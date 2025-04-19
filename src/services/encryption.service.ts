import crypto from 'crypto';

const ENCRYPTION_KEY_HEX = process.env.ENCRYPTION_KEY;
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

if (!ENCRYPTION_KEY_HEX || Buffer.from(ENCRYPTION_KEY_HEX, 'hex').length !== 32) {
    console.error("FATAL ERROR: ENCRYPTION_KEY environment variable is missing or not a 32-byte hex string.");
    if(process.env.NODE_ENV === 'production') process.exit(1);
    // En dev/test, utiliser une clé par défaut (NON SÉCURISÉ POUR PROD)
    else process.env.ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'; // 64 hex chars = 32 bytes
}

const encryptionKey = Buffer.from(process.env.ENCRYPTION_KEY!, 'hex');

export class EncryptionService {

    encrypt(text: string): { iv: string, encryptedData: string, authTag: string } {
        const iv = crypto.randomBytes(IV_LENGTH);
        const cipher = crypto.createCipheriv(ALGORITHM, encryptionKey, iv);
        let encrypted = cipher.update(text, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        const authTag = cipher.getAuthTag();
        return { iv: iv.toString('hex'), encryptedData: encrypted, authTag: authTag.toString('hex') };
    }

    decrypt(encryptedData: string, ivHex: string, authTagHex: string): string | null {
        try {
            const iv = Buffer.from(ivHex, 'hex');
            const authTag = Buffer.from(authTagHex, 'hex');
            const decipher = crypto.createDecipheriv(ALGORITHM, encryptionKey, iv);
            decipher.setAuthTag(authTag);
            let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
            decrypted += decipher.final('utf8');
            return decrypted;
        } catch (error) {
            console.error("Decryption failed:", error);
            return null;
        }
    }

    encryptForStorage(text: string): string {
        const { iv, encryptedData, authTag } = this.encrypt(text);
        return `${iv}:${encryptedData}:${authTag}`;
    }

    decryptFromStorage(storedValue: string | null | undefined): string | null {
        if (!storedValue || typeof storedValue !== 'string' || storedValue.split(':').length !== 3) {
            if(storedValue) console.error("Invalid stored value format for decryption.");
            return null;
        }
        const [ivHex, encryptedData, authTagHex] = storedValue.split(':');
        if (!ivHex || !encryptedData || !authTagHex) {
            console.error("Incomplete stored value for decryption.");
            return null;
        }
        return this.decrypt(encryptedData, ivHex, authTagHex);
    }
}

export const encryptionService = new EncryptionService();