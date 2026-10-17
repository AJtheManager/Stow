/**
 * Form validation utilities with comprehensive validation rules.
 * Provides reusable validators and error message generators.
 */

export type ValidationRule<T = string> = (value: T) => string | null;

export interface ValidationResult {
  isValid: boolean;
  errors: Record<string, string>;
}

/**
 * Email validation regex - matches basic email format
 */
export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * URL validation regex - matches http/https URLs
 */
export const URL_REGEX = /^https?:\/\/.+\..+/;

/**
 * Stellar address validation regex (G... or C... addresses)
 */
export const STELLAR_ADDRESS_REGEX = /^[GC][A-Z2-7]{55}$/;

/**
 * Password strength regex - at least 8 chars, includes number, letter, and special char
 */
export const STRONG_PASSWORD_REGEX = /^(?=.*[A-Za-z])(?=.*\d)(?=.*[@$!%*#?&])[A-Za-z\d@$!%*#?&]{8,}$/;

/**
 * Validation helper functions
 */

export const validators = {
  required: (fieldName: string = "This field"): ValidationRule => {
    return (value: string) => {
      const trimmed = value?.trim();
      return !trimmed ? `${fieldName} is required` : null;
    };
  },

  email: (fieldName: string = "Email"): ValidationRule => {
    return (value: string) => {
      const trimmed = value?.trim();
      if (!trimmed) return null; // Use with required() for required emails
      return EMAIL_REGEX.test(trimmed) ? null : `${fieldName} must be a valid email address`;
    };
  },

  minLength: (min: number, fieldName: string = "This field"): ValidationRule => {
    return (value: string) => {
      const trimmed = value?.trim();
      if (!trimmed) return null;
      return trimmed.length >= min ? null : `${fieldName} must be at least ${min} characters`;
    };
  },

  maxLength: (max: number, fieldName: string = "This field"): ValidationRule => {
    return (value: string) => {
      const trimmed = value?.trim();
      if (!trimmed) return null;
      return trimmed.length <= max ? null : `${fieldName} must not exceed ${max} characters`;
    };
  },

  min: (min: number, fieldName: string = "Value"): ValidationRule<number> => {
    return (value: number) => {
      return value >= min ? null : `${fieldName} must be at least ${min}`;
    };
  },

  max: (max: number, fieldName: string = "Value"): ValidationRule<number> => {
    return (value: number) => {
      return value <= max ? null : `${fieldName} must not exceed ${max}`;
    };
  },

  pattern: (regex: RegExp, message: string): ValidationRule => {
    return (value: string) => {
      const trimmed = value?.trim();
      if (!trimmed) return null;
      return regex.test(trimmed) ? null : message;
    };
  },

  url: (fieldName: string = "URL"): ValidationRule => {
    return (value: string) => {
      const trimmed = value?.trim();
      if (!trimmed) return null;
      return URL_REGEX.test(trimmed) ? null : `${fieldName} must be a valid URL`;
    };
  },

  stellarAddress: (fieldName: string = "Address"): ValidationRule => {
    return (value: string) => {
      const trimmed = value?.trim();
      if (!trimmed) return null;
      return STELLAR_ADDRESS_REGEX.test(trimmed) 
        ? null 
        : `${fieldName} must be a valid Stellar address`;
    };
  },

  strongPassword: (fieldName: string = "Password"): ValidationRule => {
    return (value: string) => {
      if (!value) return null;
      return STRONG_PASSWORD_REGEX.test(value)
        ? null
        : `${fieldName} must be at least 8 characters and include a letter, number, and special character`;
    };
  },

  match: (otherValue: string, otherFieldName: string): ValidationRule => {
    return (value: string) => {
      return value === otherValue ? null : `Must match ${otherFieldName}`;
    };
  },

  positiveNumber: (fieldName: string = "Value"): ValidationRule => {
    return (value: string) => {
      const num = Number(value);
      if (!value.trim()) return null;
      return Number.isFinite(num) && num > 0 
        ? null 
        : `${fieldName} must be a positive number`;
    };
  },

  integerNumber: (fieldName: string = "Value"): ValidationRule => {
    return (value: string) => {
      const num = Number(value);
      if (!value.trim()) return null;
      return Number.isInteger(num) 
        ? null 
        : `${fieldName} must be a whole number`;
    };
  },
};

/**
 * Validate a single field with multiple rules
 */
export function validateField(
  value: any,
  rules: ValidationRule<any>[]
): string | null {
  for (const rule of rules) {
    const error = rule(value);
    if (error) return error;
  }
  return null;
}

/**
 * Validate multiple fields
 */
export function validateFields(
  fields: Record<string, { value: any; rules: ValidationRule<any>[] }>
): ValidationResult {
  const errors: Record<string, string> = {};

  for (const [fieldName, { value, rules }] of Object.entries(fields)) {
    const error = validateField(value, rules);
    if (error) {
      errors[fieldName] = error;
    }
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}

/**
 * Custom validation composer - combine multiple validators
 */
export function composeValidators<T = string>(
  ...validators: ValidationRule<T>[]
): ValidationRule<T> {
  return (value: T) => {
    for (const validator of validators) {
      const error = validator(value);
      if (error) return error;
    }
    return null;
  };
}

/**
 * Async validation support
 */
export type AsyncValidationRule<T = string> = (value: T) => Promise<string | null>;

export async function validateFieldAsync(
  value: any,
  rules: Array<ValidationRule<any> | AsyncValidationRule<any>>
): Promise<string | null> {
  for (const rule of rules) {
    const error = await rule(value);
    if (error) return error;
  }
  return null;
}
