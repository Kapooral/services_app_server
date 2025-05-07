// src/services/NotificationService.ts
import nodemailer from 'nodemailer';
import Mail from 'nodemailer/lib/mailer';

import { UserAttributes } from '../models/User';
import { EstablishmentAttributes } from '../models/Establishment';
import { ServiceAttributes } from '../models/Service';
import { BookingAttributes, BookingStatus } from '../models/Booking';

const APP_NAME = process.env.APP_NAME || 'Your Application';
const EMAIL_FROM_ADDRESS = process.env.MAILER_DEFAULT_FROM || `noreply@${process.env.MAILER_HOST?.split('.').slice(-2).join('.') || 'example.com'}`;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
const ACTIVATION_TOKEN_EXPIRATION_HOURS = parseInt(process.env.ACTIVATION_TOKEN_EXPIRATION_HOURS || '24', 10);

export interface INotificationService {
    // Méthodes existantes
    sendEmailVerificationCode(to: string, code: string): Promise<void>;
    sendPhoneVerificationCode(phone: string, code: string): Promise<void>;
    sendPasswordRecoveryToken(to: string, token: string, expires_in_minutes: number): Promise<void>;
    sendWelcomeEmail(to: string): Promise<void>;
    sendActivationEmail(to: string, activationToken: string): Promise<void>;
    sendAccountDeletionConfirmation(to: string): Promise<void>;
    sendInvitationEmail(toEmail: string, token: string, establishmentName: string, inviterName: string): Promise<void>;
    sendMemberJoinedNotification(adminEmail: string, newMemberUsername: string, establishmentName: string): Promise<void>;

    // --- Méthodes pour les réservations ---
    sendBookingConfirmationClient(
        clientEmail: string,
        booking: BookingAttributes,
        service: ServiceAttributes,
        establishment: EstablishmentAttributes
    ): Promise<void>;

    sendBookingNotificationAdmin(
        adminEmail: string,
        booking: BookingAttributes,
        service: ServiceAttributes,
        client: UserAttributes
    ): Promise<void>;

    sendBookingCancellationAdmin(
        adminEmail: string,
        booking: BookingAttributes,
        service: ServiceAttributes,
        client: UserAttributes
    ): Promise<void>;

    sendBookingStatusUpdateClient(
        clientEmail: string,
        booking: BookingAttributes,
        service: ServiceAttributes
    ): Promise<void>;
}

function getErrorMessage(error: unknown): string {
    if (error instanceof Error) return error.message;
    return String(error);
}

export class ConsoleNotificationService implements INotificationService {
    private transporter: Mail;
    private mailerConfigured: boolean = false;

    constructor() {
        if (!process.env.MAILER_HOST || !process.env.MAILER_USER || !process.env.MAILER_PASSWORD) {
            console.warn(
                `[NotificationService] MAILER environment variables (HOST, USER, PASSWORD) are not fully configured. Emails will likely fail to send.`
            );
            this.transporter = nodemailer.createTransport({ jsonTransport: true });

            this.mailerConfigured = !!(process.env.MAILERL_HOST && process.env.MAILERL_USER);
            if (this.mailerConfigured && process.env.NODE_ENV !== 'test') {
                this.verifyConnection();
            } else if (!this.mailerConfigured && process.env.NODE_ENV !== 'test') {
                console.warn('[NotificationService] Mailer not configured. Emails will be logged to console only.');
            } else if (process.env.NODE_ENV === 'test') {
                console.log('[NotificationService] Skipping mailer connection verification in test environment.');
            }
        }
        else {
            this.transporter = nodemailer.createTransport({
                host: process.env.MAILER_HOST,
                port: Number(process.env.MAILER_PORT) || 587,
                secure: Number(process.env.MAILER_PORT) === 465,
                auth: {
                    user: process.env.MAILER_USER,
                    pass: process.env.MAILER_PASSWORD,
                }
            });
        }
    }

    private async verifyConnection(): Promise<void> {
        if (this.transporter.options && (this.transporter.options as any).jsonTransport) return;
        try {
            await this.transporter.verify();
            console.log('[NotificationService] Mailer connection verified successfully.');
        } catch (error) {
            console.error('[NotificationService] Mailer connection verification failed:', error);
        }
    }

    private async send(options: { to: string; subject: string; html: string }): Promise<void> {
        if (!process.env.MAILER_HOST || !process.env.MAILER_USER || !process.env.MAILER_PASSWORD) {
            console.error(`[NotificationService] Cannot send email to ${options.to}. Mailer not configured.`);
            throw new Error('Mailer service is not configured.');
        }

        if (this.transporter.options && (this.transporter.options as any).jsonTransport) {
            console.warn(`[NotificationService] Mailer not configured. Skipping email send to ${options.to}. Subject: "${options.subject}"`);
            throw new Error('Mailer service is not configured.');
        }

        const mailOptions: Mail.Options = {
            from: EMAIL_FROM_ADDRESS,
            to: options.to,
            subject: options.subject,
            html: options.html,
        };

        try {
            console.log(`[NotificationService] Attempting to send email. Subject: "${options.subject}", To: ${options.to}`);
            const info = await this.transporter.sendMail(mailOptions);
            console.log(`[NotificationService] Email sent successfully to ${options.to}. Message ID: ${info.messageId}`);
        } catch (error) {
            console.error(`[NotificationService] FAILED to send email. Subject: "${options.subject}", To: ${options.to}`, error);
            // Relancer l'erreur pour que l'appelant soit informé de l'échec
            throw new Error(`Failed to send email: ${getErrorMessage(error)}`); // Assurez-vous que getErrorMessage existe
        }
    }

    async sendWelcomeEmail(to: string): Promise<void> {
        const subject = `Welcome to ${APP_NAME}!`;
        const html = `
            <h1>Welcome!</h1>
            <p>Thank you for registering with ${APP_NAME}.</p>
            <p>We're excited to have you.</p>
            <br/>
            <p>Best regards,</p>
            <p>The ${APP_NAME} Team</p>
        `;
        await this.send({ to, subject, html });
    }

    async sendActivationEmail(to: string, token: string): Promise<void> {
        const subject = `Activate Your Account`;
        const activationLink = `${process.env.FRONTEND_URL}/activate-account?token=${token}`;

        const html = `
            <h1>Welcome to ${APP_NAME}!</h1>
            <p>Thank you for registering. Please click the link below to activate your account:</p>
            <p><a href="${activationLink}" style="display: inline-block; padding: 10px 20px; background-color: #28a745; color: white; text-decoration: none; border-radius: 5px;">Activate Your Account</a></p>
            <p>Or copy and paste this link into your browser:</p>
            <p>${activationLink}</p>
            <p>This activation link is valid for ${ACTIVATION_TOKEN_EXPIRATION_HOURS} hours.</p>
            <p>If you did not create an account, please ignore this email.</p>
            <br/>
            <p>Thanks,</p>
            <p>The ${APP_NAME} Team</p>
        `;
        await this.send({ to, subject, html });
    }

    async sendEmailVerificationCode(to: string, code: string): Promise<void> {
        const subject = `Email Verification Code`;
        const html = `
            <p>Hello,</p>
            <p>Please use the following code to verify your email address for ${APP_NAME}:</p>
            <p style="font-size: 1.5em; font-weight: bold; margin: 20px 0; letter-spacing: 2px;">${code}</p>
            <p>This code is time-sensitive. If you did not request this verification, please ignore this email.</p>
            <p>Do not share this code with anyone.</p>
            <br/>
            <p>Thanks,</p>
            <p>The ${APP_NAME} Team</p>
        `;
        await this.send({ to, subject, html });
    }

    async sendPhoneVerificationCode(phone: string, code: string): Promise<void> {
        console.log(`[NotificationService] SIMULATING sending phone verification code to ${phone}: ${code}`);
        // Pas d'implémentation réelle ici, juste un log
    }

    async sendPasswordRecoveryToken(to: string, token: string, expires_at: number): Promise<void> {
        const subject = `Password Reset Link`;
        const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${token}`;

        const html = `
            <p>Hello,</p>
            <p>We received a request to reset the password for your ${APP_NAME} account.</p>
            <p>Please click the link below to set a new password:</p>
            <p><a href="${resetUrl}" style="display: inline-block; padding: 10px 20px; background-color: #007bff; color: white; text-decoration: none; border-radius: 5px;">Reset Your Password</a></p>
            <p>Or copy and paste this link into your browser:</p>
            <p>${resetUrl}</p>
            <p>This link is valid for ${expires_at} minutes.</p>
            <p>If you did not request a password reset, please ignore this email.</p>
            <br/>
            <p>Thanks,</p>
            <p>The ${APP_NAME} Team</p>
        `;
        await this.send({ to, subject, html });
    }

    async sendAccountDeletionConfirmation(to: string): Promise<void> {
        const subject = `Your ${APP_NAME} Account Deletion`;
        const html = `
            <p>Hello,</p>
            <p>This email confirms that your account associated with this email address (${to}) at ${APP_NAME} has been successfully deleted as requested.</p>
            <p>If you did not request this deletion, please contact our support immediately.</p>
            <br/>
            <p>We're sorry to see you go.</p>
            <p>The ${APP_NAME} Team</p>
        `;
        await this.send({ to, subject, html });
    }

    async sendBookingConfirmationClient(
        clientEmail: string,
        booking: BookingAttributes,
        service: ServiceAttributes,
        establishment: EstablishmentAttributes
    ): Promise<void> {
        const subject = `Booking Confirmation - ${service.name} at ${establishment.name}`;
        const startTime = booking.start_datetime.toLocaleString('en-GB', { timeZone: 'UTC', dateStyle: 'full', timeStyle: 'short' }) + ' UTC';

        const html = `
            <h1>Booking Confirmed!</h1>
            <p>Hello,</p>
            <p>Your booking for <strong>${service.name}</strong> at <strong>${establishment.name}</strong> is confirmed.</p>
            <ul>
                <li><strong>Date & Time:</strong> ${startTime}</li>
                <li><strong>Duration:</strong> ${service.duration_minutes} minutes</li>
                <li><strong>Price:</strong> ${booking.price_at_booking.toFixed(2)} ${booking.currency_at_booking}</li>
                <li><strong>Establishment:</strong> ${establishment.name}</li>
                <li><strong>Address:</strong> ${establishment.address_line1}, ${establishment.city}</li>
            </ul>
            ${booking.user_notes ? `<p><strong>Your Notes:</strong> ${booking.user_notes}</p>` : ''}
            <p>If you need to cancel or reschedule, please contact the establishment or manage your booking through our platform (link if available).</p>
            <br/>
            <p>Thank you for booking with us!</p>
            <p>The ${APP_NAME} Team</p>
        `;
        await this.send({ to: clientEmail, subject, html });
    }

    async sendBookingNotificationAdmin(
        adminEmail: string,
        booking: BookingAttributes,
        service: ServiceAttributes,
        client: UserAttributes
    ): Promise<void> {
        const subject = `New Booking Alert: ${service.name} by ${client.username}`;
        const startTime = booking.start_datetime.toLocaleString('en-GB', { timeZone: 'UTC', dateStyle: 'full', timeStyle: 'short' }) + ' UTC';

        const html = `
            <h1>New Booking Received</h1>
            <p>A new booking has been made at your establishment:</p>
            <ul>
                <li><strong>Service:</strong> ${service.name}</li>
                <li><strong>Client:</strong> ${client.username} (${client.email})</li>
                <li><strong>Date & Time:</strong> ${startTime}</li>
                <li><strong>Duration:</strong> ${service.duration_minutes} minutes</li>
                <li><strong>Booking ID:</strong> ${booking.id}</li>
                 ${booking.user_notes ? `<li style="color: blue;"><strong>Client Notes:</strong> ${booking.user_notes}</li>` : ''}
            </ul>
            <p>You can view the booking details in your dashboard.</p>
        `;
        await this.send({ to: adminEmail, subject, html });
    }

    async sendBookingCancellationAdmin(
        adminEmail: string,
        booking: BookingAttributes,
        service: ServiceAttributes,
        client: UserAttributes
    ): Promise<void> {
        const subject = `Booking Cancellation: ${service.name} by ${client.username}`;
        const startTime = booking.start_datetime.toLocaleString('en-GB', { timeZone: 'UTC', dateStyle: 'full', timeStyle: 'short' }) + ' UTC';

        const html = `
            <h1>Booking Cancelled by Client</h1>
            <p>The following booking has been cancelled by the client:</p>
            <ul>
                <li><strong>Service:</strong> ${service.name}</li>
                <li><strong>Client:</strong> ${client.username} (${client.email})</li>
                <li><strong>Original Date & Time:</strong> ${startTime}</li>
                <li><strong>Booking ID:</strong> ${booking.id}</li>
            </ul>
            <p>This time slot may now be available for other bookings.</p>
        `;
        await this.send({ to: adminEmail, subject, html });
    }

    async sendBookingStatusUpdateClient(
        clientEmail: string,
        booking: BookingAttributes,
        service: ServiceAttributes
    ): Promise<void> {
        const subject = `Booking Status Update for ${service.name}`;
        const startTime = booking.start_datetime.toLocaleString('en-GB', { timeZone: 'UTC', dateStyle: 'full', timeStyle: 'short' }) + ' UTC';
        let statusMessage = '';

        switch (booking.status) {
            case BookingStatus.CANCELLED_BY_ESTABLISHMENT:
                statusMessage = `We regret to inform you that your booking for <strong>${service.name}</strong> on ${startTime} has been cancelled by the establishment. Please contact them for more details.`;
                break;
            case BookingStatus.COMPLETED:
                statusMessage = `Your appointment for <strong>${service.name}</strong> on ${startTime} is now marked as completed. We hope you enjoyed the service!`;
                break;
            case BookingStatus.NO_SHOW:
                statusMessage = `Your booking for <strong>${service.name}</strong> on ${startTime} has been marked as a no-show. Please contact the establishment if this is incorrect.`;
                break;
            // Ajouter d'autres cas si nécessaire (ex: PENDING -> CONFIRMED par admin)
            default:
                statusMessage = `The status of your booking for <strong>${service.name}</strong> on ${startTime} has been updated to: <strong>${booking.status}</strong>.`;
        }

        const html = `
            <h1>Booking Update</h1>
            <p>Hello,</p>
            <p>${statusMessage}</p>
            ${booking.establishment_notes ? `<p><strong>Note from Establishment:</strong> ${booking.establishment_notes}</p>` : ''}
            <p>If you have any questions, please contact the establishment directly.</p>
            <br/>
            <p>Thanks,</p>
            <p>The ${APP_NAME} Team</p>
        `;
        await this.send({ to: clientEmail, subject, html });
    }


    async sendInvitationEmail(to: string, token: string, establishmentName: string, inviterName: string): Promise<void> {
        const subject = `You're invited to join ${establishmentName} on ${APP_NAME}`;
        const acceptLink = `${FRONTEND_URL}/accept-invitation/${token}`;
        const html = `
            <h1>Invitation</h1>
            <p>Hello,</p>
            <p><strong>${inviterName}</strong> has invited you to join the establishment "<strong>${establishmentName}</strong>" as a Staff member on ${APP_NAME}.</p>
            <p>Click the link below to accept the invitation and set up your account:</p>
            <p><a href="${acceptLink}" style="display: inline-block; padding: 10px 20px; background-color: #0d6efd; color: white; text-decoration: none; border-radius: 5px;">Accept Invitation</a></p>
            <p>Or copy and paste this link into your browser:</p>
            <p>${acceptLink}</p>
            <p>This invitation link is valid for 7 days.</p>
            <p>If you were not expecting this invitation, please ignore this email.</p>
            <br/>
            <p>Thanks,</p>
            <p>The ${APP_NAME} Team</p>
        `;
        await this.send({ to, subject, html });
    }

    async sendMemberJoinedNotification(adminEmail: string, newMemberUsername: string, establishmentName: string): Promise<void> {
        const subject = `New Member Joined: ${newMemberUsername} joined ${establishmentName}`;
        const html = `
            <h1>Member Joined</h1>
            <p>Hello Admin,</p>
            <p><strong>${newMemberUsername}</strong> has accepted the invitation and joined your establishment "<strong>${establishmentName}</strong>" as a Staff member.</p>
            <p>You can manage members in your establishment settings.</p>
            <br/>
            <p>The ${APP_NAME} Team</p>
         `;
        await this.send({ to: adminEmail, subject, html });
    }
}

export class NullNotificationService implements INotificationService {
    async sendEmailVerificationCode(to: string, code: string): Promise<void> { /* no-op */ }
    async sendPhoneVerificationCode(phone: string, code: string): Promise<void> { /* no-op */ }
    async sendPasswordRecoveryToken(to: string, code: string, expires_at: number): Promise<void> { /* no-op */ }
    async sendWelcomeEmail(to: string): Promise<void> { /* no-op */ }
    async sendActivationEmail(to: string, activationToken: string): Promise<void> { /* no-op */ }
    async sendAccountDeletionConfirmation(to: string): Promise<void> { /* no-op */ }

    async sendBookingConfirmationClient(clientEmail: string, booking: BookingAttributes, service: ServiceAttributes, establishment: EstablishmentAttributes): Promise<void> { /* no-op */ }
    async sendBookingNotificationAdmin(adminEmail: string, booking: BookingAttributes, service: ServiceAttributes, client: UserAttributes ): Promise<void> { /* no-op */ }
    async sendBookingCancellationAdmin(adminEmail: string, booking: BookingAttributes, service: ServiceAttributes, client: UserAttributes ): Promise<void> { /* no-op */ }
    async sendBookingStatusUpdateClient(clientEmail: string, booking: BookingAttributes, service: ServiceAttributes): Promise<void> { /* no-op */ }
    async sendInvitationEmail(toEmail: string, token: string, establishmentName: string, inviterName: string): Promise<void> { /* no-op */ }
    async sendMemberJoinedNotification(adminEmail: string, newMemberUsername: string, establishmentName: string): Promise<void> { /* no-op */ }
}