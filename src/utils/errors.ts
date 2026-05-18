export class AppError extends Error {
    public readonly statusCode: number;
    public readonly isOperational: boolean;
    public readonly errors?: Array<{ field: string; message: string }>;

    constructor(
        message: string,
        statusCode = 500,
        isOperational = true,
        errors?: Array<{ field: string; message: string }>
    ) {
        super(message);
        Object.setPrototypeOf(this, new.target.prototype);
        this.name = this.constructor.name;
        this.statusCode = statusCode;
        this.isOperational = isOperational;
        this.errors = errors;
        Error.captureStackTrace(this, this.constructor);
    }
}

export class BadRequestError extends AppError {
    constructor(message: string, errors?: Array<{ field: string; message: string }>) {
        super(message, 400, true, errors);
    }
}

export class UnauthorizedError extends AppError {
    constructor(message = 'Unauthorized') {
        super(message, 401);
    }
}

export class ForbiddenError extends AppError {
    constructor(message = 'Access denied') {
        super(message, 403);
    }
}

export class NotFoundError extends AppError {
    constructor(message = 'Resource not found') {
        super(message, 404);
    }
}

export class ConflictError extends AppError {
    constructor(message: string) {
        super(message, 409);
    }
}

export class ValidationError extends AppError {
    constructor(message: string, errors: Array<{ field: string; message: string }>) {
        super(message, 422, true, errors);
    }
}

export class PaymentRequiredError extends AppError {
    constructor(message = 'Subscription required to access this feature') {
        super(message, 402);
    }
}

// Partner invite specific errors with error codes
export class InviteExpiredError extends AppError {
    public readonly code = 'INVITE_EXPIRED';
    constructor(message = 'Invite has expired') {
        super(message, 400);
    }
}

export class EmailMismatchError extends AppError {
    public readonly code = 'EMAIL_MISMATCH';
    constructor(message = 'This invite was not sent to your email') {
        super(message, 400);
    }
}

export class IncompatibleRolesError extends AppError {
    public readonly code = 'INCOMPATIBLE_ROLES';
    constructor(message = 'User role is not compatible with this invite') {
        super(message, 400);
    }
}

export class InviteAlreadyAcceptedError extends AppError {
    public readonly code = 'INVITE_ALREADY_ACCEPTED';
    constructor(message = 'Invite has already been accepted') {
        super(message, 400);
    }
}
